// Anti-nuke : surveille le journal d'audit. Un membre (ou un bot) qui enchaîne
// suppressions de salons/rôles, bans, expulsions ou créations de webhooks au-delà
// du seuil perd immédiatement tous ses rôles (un bot est expulsé).
// Exemptés : ce bot, le propriétaire du serveur, GBAN_OWNERS, protect.nuke.whitelist.
const { AuditLogEvent } = require('discord.js');
const config = require('../../config');
const { ownerIds, securityAlert } = require('./alert');

const WINDOW_MS = 60e3;
const LIMITS = {
  [AuditLogEvent.ChannelDelete]: { max: 3, label: 'suppressions de salons' },
  [AuditLogEvent.ChannelCreate]: { max: 8, label: 'créations de salons' },
  [AuditLogEvent.RoleDelete]: { max: 3, label: 'suppressions de rôles' },
  [AuditLogEvent.RoleCreate]: { max: 8, label: 'créations de rôles' },
  [AuditLogEvent.MemberBanAdd]: { max: 5, label: 'bannissements' },
  [AuditLogEvent.MemberKick]: { max: 5, label: 'expulsions' },
  [AuditLogEvent.MemberPrune]: { max: 1, label: 'purge de membres' },
  [AuditLogEvent.WebhookCreate]: { max: 3, label: 'créations de webhooks' },
};

const counts = new Map();   // "guildId:userId:action" -> [timestamps]
const punished = new Map(); // "guildId:userId" -> timestamp

function isTrusted(guild, userId) {
  const whitelist = config.protect?.nuke?.whitelist || [];
  return userId === guild.client.user.id || userId === guild.ownerId
    || ownerIds(guild).includes(userId) || whitelist.includes(userId);
}

async function neutralize(guild, userId, label, total) {
  const key = `${guild.id}:${userId}`;
  if (Date.now() - (punished.get(key) || 0) < WINDOW_MS) return;
  punished.set(key, Date.now());

  const member = await guild.members.fetch(userId).catch(() => null);
  let action = 'introuvable sur le serveur';
  if (member?.user.bot) {
    action = await member.kick('Anti-nuke').then(() => 'bot expulsé').catch(() => 'expulsion impossible (rôle du bot trop bas ?)');
  } else if (member) {
    const keep = member.roles.cache.filter((r) => r.managed || r.id === guild.id);
    action = await member.roles.set(keep, 'Anti-nuke').then(() => 'tous ses rôles retirés').catch(() => 'retrait des rôles impossible (rôle du bot trop bas ?)');
  }

  await securityAlert(guild, {
    title: 'Anti-nuke déclenché',
    description: `<@${userId}> a fait ${total} ${label} en moins d'une minute.`,
    fields: [
      { name: 'Compte', value: `<@${userId}> (\`${userId}\`)`, inline: true },
      { name: 'Action', value: action, inline: true },
      { name: 'Conseil', value: "Vérifie le journal d'audit. `/backup restore` recrée les salons et rôles supprimés." },
    ],
  });
}

async function onAuditEntry(entry, guild) {
  const limit = LIMITS[entry.action];
  const userId = entry.executorId;
  if (!limit || !userId || isTrusted(guild, userId)) return;

  const key = `${guild.id}:${userId}:${entry.action}`;
  const now = Date.now();
  const list = (counts.get(key) || []).filter((t) => now - t < WINDOW_MS);
  list.push(now);
  counts.set(key, list);
  if (list.length >= limit.max) await neutralize(guild, userId, limit.label, list.length);
}

module.exports = { onAuditEntry };
