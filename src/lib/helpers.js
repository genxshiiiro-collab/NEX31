const { PermissionFlagsBits } = require('discord.js');
const config = require('../../config');

const ALL_PASTILLES = Object.values(config.emoji);

function validId(id) {
  return typeof id === 'string' && /^\d+$/.test(id);
}

/** Rôles staff + graphiste configurés pour un serveur. */
function staffRoleIds(guildId) {
  const cfg = config.forGuild(guildId);
  return [...new Set([...(cfg.staffRoleIds || []), ...(cfg.graphisteRoleIds || [])])].filter(validId);
}

/**
 * L'auteur (GuildMember) fait-il partie du staff ?
 * = rôle staff/graphiste configuré, OU ManageGuild / Administrator.
 */
function isStaff(member) {
  if (!member || !member.guild) return false;
  const ids = staffRoleIds(member.guild.id);
  if (ids.some((id) => member.roles.cache.has(id))) return true;
  try {
    return member.permissions.has(PermissionFlagsBits.ManageGuild)
      || member.permissions.has(PermissionFlagsBits.Administrator);
  } catch {
    return false;
  }
}

/** Charge le membre (fetch API) et vérifie s'il est staff — fiable sans GuildMembers intent. */
async function isStaffMember(guild, userId, hint = null) {
  if (!guild || !userId) return false;
  if (hint && isStaff(hint)) return true;
  const member = await guild.members.fetch(userId).catch(() => hint || null);
  return member ? isStaff(member) : false;
}

/** L'auteur a-t-il le rôle customer (selon la config du serveur) ? */
function isCustomer(member) {
  const { hasCustomerAccess } = require('./customerTiers');
  return hasCustomerAccess(member);
}

/** Le salon est-il un ticket géré (base, catégorie ou préfixe de nom) ? */
function isTicketChannel(channel) {
  if (!channel || !channel.guild) return false;
  const { db } = require('../storage');
  const meta = db.tickets[channel.id];
  if (meta && !meta.closed) return true;
  const cfg = config.forGuild(channel.guild.id);
  if (channel.parentId && cfg.ticketCategoryIds.filter(validId).includes(channel.parentId)) return true;
  const name = channel.name || '';
  return config.ticketNamePrefixes.some((p) => name.startsWith(p));
}

/** Retire la pastille + tirets de tête d'un nom de salon pour récupérer le "base". */
function stripPastille(name) {
  let n = name || '';
  for (const e of ALL_PASTILLES) {
    if (n.startsWith(e)) n = n.slice(e.length);
  }
  return n.replace(/^[-–—\s]+/, '').trim();
}

/** Nettoie un pseudo pour qu'il soit valide dans un nom de salon. */
function slugifyName(name) {
  return (name || 'client')
    .normalize('NFKC')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'client';
}

/** ⭐ visuel à partir d'une note /5. */
function stars(note) {
  const n = Math.max(0, Math.min(5, Number(note) || 0));
  return '⭐'.repeat(n) + '▪️'.repeat(5 - n);
}

module.exports = {
  isStaff, isStaffMember, isCustomer, isTicketChannel, stripPastille, slugifyName, stars, staffRoleIds,
};
