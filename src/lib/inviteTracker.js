// =====================================================================
//  SUIVI DES INVITATIONS — qui a invité un nouvel arrivant / provenance.
//
//  Principe : on garde en mémoire le nombre d'utilisations de chaque
//  invitation par serveur. À l'arrivée d'un membre, on relit les
//  invitations et on repère celle dont le compteur a augmenté -> c'est
//  l'invitation utilisée, donc son auteur.
//
//  Prérequis : intents GuildMembers (privilégié) + GuildInvites, et
//  permission "Gérer le serveur" pour le bot (lecture des invitations).
//  Tout est conditionné par config.memberTracking.enabled.
// =====================================================================

const config = require('../../config');
const { V2, container, text, separator } = require('./components');
const log = require('./logger');

// guildId -> { invites: Map(code -> uses), vanityUses: number }
const cache = new Map();

function trackingEnabled() {
  return config.memberTracking?.enabled === true;
}

/** Recense les utilisations actuelles des invitations d'un serveur. */
async function primeGuild(guild) {
  try {
    const invites = await guild.invites.fetch();
    const uses = new Map();
    for (const inv of invites.values()) uses.set(inv.code, inv.uses || 0);
    let vanityUses = 0;
    if (guild.vanityURLCode) {
      const v = await guild.fetchVanityData().catch(() => null);
      vanityUses = v?.uses || 0;
    }
    cache.set(guild.id, { invites: uses, vanityUses });
  } catch (e) {
    log.warn('invites', `Lecture des invitations impossible pour ${guild.id} (permission "Gérer le serveur" ?)`, { detail: e.message });
    cache.set(guild.id, { invites: new Map(), vanityUses: 0 });
  }
}

/** Prépare tous les serveurs au démarrage. */
async function primeAll(client) {
  if (!trackingEnabled()) return;
  for (const guild of client.guilds.cache.values()) {
    await primeGuild(guild);
  }
  log.info('invites', `Cache d'invitations initialisé (${cache.size} serveur(s))`);
}

/**
 * Détermine l'invitation utilisée par un nouvel arrivant.
 * @returns {Promise<{inviterId: string|null, code: string|null, type: string}>}
 *   type : 'invite' | 'vanity' | 'bot' | 'unknown'
 */
async function resolveJoin(member) {
  const guild = member.guild;
  const before = cache.get(guild.id) || { invites: new Map(), vanityUses: 0 };
  let result = { inviterId: null, code: null, type: member.user.bot ? 'bot' : 'unknown' };

  let after = null;
  try {
    after = await guild.invites.fetch();
  } catch (e) {
    log.warn('invites', `Résolution impossible pour ${guild.id}`, { detail: e.message });
  }

  if (after) {
    let used = null;
    for (const inv of after.values()) {
      const prev = before.invites.get(inv.code) || 0;
      if ((inv.uses || 0) > prev) { used = inv; break; }
    }

    const uses = new Map();
    for (const inv of after.values()) uses.set(inv.code, inv.uses || 0);
    let vanityUses = before.vanityUses;

    if (used) {
      result = { inviterId: used.inviter?.id || null, code: used.code, type: 'invite' };
    } else if (guild.vanityURLCode) {
      const v = await guild.fetchVanityData().catch(() => null);
      if (v && (v.uses || 0) > before.vanityUses) {
        result = { inviterId: null, code: guild.vanityURLCode, type: 'vanity' };
      }
      vanityUses = v?.uses ?? vanityUses;
    }

    cache.set(guild.id, { invites: uses, vanityUses });
  }

  return result;
}

/**
 * Salon de log pour un type d'événement membre.
 * @param {string} guildId
 * @param {'join'|'leave'} [kind] salon dédié arrivée/départ, sinon salon commun.
 */
function memberLogChannelId(guildId, kind) {
  const cfg = config.forGuild(guildId);
  const dedicated = kind === 'join' ? cfg.memberJoinChannelId
    : kind === 'leave' ? cfg.memberLeaveChannelId
      : '';
  return dedicated || cfg.memberLogChannelId || cfg.logChannelId || '';
}

/** Envoie un container V2 dans le salon de log des membres. */
async function postMemberLog(guild, componentContainer, kind) {
  const channelId = memberLogChannelId(guild.id, kind);
  if (!channelId || channelId.startsWith('ID_')) return;
  const channel = await guild.client.channels.fetch(channelId).catch(() => null);
  if (!channel?.send) return;
  await channel.send({ components: [componentContainer], flags: V2, allowedMentions: { parse: [] } })
    .catch((e) => log.warn('invites', 'Envoi log membre impossible', { detail: e.message }));
}

module.exports = {
  trackingEnabled, primeGuild, primeAll, resolveJoin, postMemberLog,
  memberLogChannelId, V2, container, text, separator,
};
