// Attribution des rôles clients selon le total dépensé (Partners exclu).
const config = require('../../config');
const log = require('./logger');

/** Total dépensé par un membre sur un serveur. */
function getClientTotal(guildId, userId) {
  return Number(dbRef()?.clientTotals?.[guildId]?.[userId] || 0);
}

function addClientTotal(guildId, userId, amount) {
  const db = dbRef();
  if (!db.clientTotals) db.clientTotals = {};
  if (!db.clientTotals[guildId]) db.clientTotals[guildId] = {};
  db.clientTotals[guildId][userId] = getClientTotal(guildId, userId) + Number(amount || 0);
  save();
}

/** Référence lazy pour éviter dépendance circulaire au chargement. */
function dbRef() {
  return require('../storage').db;
}

function save() {
  require('../storage').save();
}

/** Rôles de palier configurés pour un serveur (triés du plus haut au plus bas). */
function getTierRoles(guildId) {
  const cfg = config.forGuild(guildId);
  const tiers = (cfg.customerTiers || []).filter((t) => t.roleId && !t.roleId.startsWith('ID_'));
  return [...tiers].sort((a, b) => b.minTotal - a.minTotal);
}

/** Palier le plus élevé atteint pour un montant donné. */
function tierForTotal(guildId, total) {
  const tiers = getTierRoles(guildId);
  return tiers.find((t) => total >= t.minTotal) || null;
}

/** Tous les IDs de rôles gérés automatiquement par paliers (hors Partners). */
function allAutoTierRoleIds(guildId) {
  return getTierRoles(guildId).map((t) => t.roleId);
}

/**
 * Met à jour les rôles client d'un membre selon son total dépensé.
 * Ne touche pas au rôle Partners ni aux rôles staff.
 */
async function syncCustomerTier(guild, userId, { reason = 'Mise à jour palier client' } = {}) {
  const cfg = config.forGuild(guild.id);
  const excluded = new Set([
    ...(cfg.excludedAutoRoleIds || []),
    ...cfg.staffRoleIds,
  ]);

  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) return null;

  const total = getClientTotal(guild.id, userId);
  const target = tierForTotal(guild.id, total);
  const autoIds = allAutoTierRoleIds(guild.id);

  if (!target) return null;

  // Retire les anciens paliers auto (sauf le palier cible).
  for (const roleId of autoIds) {
    if (roleId === target.roleId) continue;
    if (excluded.has(roleId)) continue;
    if (member.roles.cache.has(roleId)) {
      await member.roles.remove(roleId, reason).catch(() => {});
    }
  }

  if (!member.roles.cache.has(target.roleId) && !excluded.has(target.roleId)) {
    await member.roles.add(target.roleId, reason).catch((err) => {
      log.warn('tiers', 'Impossible d\'ajouter le rôle palier', { role: target.roleId, detail: err.message });
    });
  }

  return { total, tier: target };
}

/** Le membre a-t-il un rôle client (base ou palier) ? */
function hasCustomerAccess(member) {
  if (!member?.guild) return false;
  const cfg = config.forGuild(member.guild.id);
  const ids = allAutoTierRoleIds(member.guild.id);
  if (cfg.customerRoleId && member.roles.cache.has(cfg.customerRoleId)) return true;
  return ids.some((id) => member.roles.cache.has(id));
}

module.exports = {
  getClientTotal,
  addClientTotal,
  getTierRoles,
  tierForTotal,
  syncCustomerTier,
  hasCustomerAccess,
  allAutoTierRoleIds,
};
