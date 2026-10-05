// Verrouillage du serveur : plus personne (hors admins) ne peut écrire, réagir,
// parler en vocal ni rejoindre via invitation. L'état d'origine est sauvegardé
// pour être restauré exactement au déverrouillage.
const { PermissionFlagsBits: P, PermissionsBitField, ChannelType } = require('discord.js');
const { db, save } = require('../storage');
const log = require('./logger');

const LOCKED = [P.SendMessages, P.SendMessagesInThreads, P.CreatePublicThreads, P.CreatePrivateThreads, P.AddReactions, P.Connect, P.Speak];
const LOCK_OVERWRITE = { SendMessages: false, SendMessagesInThreads: false, AddReactions: false, Connect: false, CreatePublicThreads: false };

const isLocked = (guildId) => Boolean(db.lockdown?.[guildId]);

async function lock(guild, reason) {
  if (isLocked(guild.id)) return { already: true };
  const everyone = guild.roles.everyone;
  const state = { at: Date.now(), reason, everyonePerms: everyone.permissions.bitfield.toString(), channels: {} };

  // Sauvegarde avant toute modification : un crash en plein verrouillage reste réversible.
  for (const ch of guild.channels.cache.values()) {
    if (ch.isThread() || ch.type === ChannelType.GuildCategory || !ch.permissionOverwrites) continue;
    const ow = ch.permissionOverwrites.cache.get(everyone.id);
    state.channels[ch.id] = ow ? { allow: ow.allow.bitfield.toString(), deny: ow.deny.bitfield.toString() } : null;
  }
  if (!db.lockdown) db.lockdown = {};
  db.lockdown[guild.id] = state;
  save();

  await everyone.setPermissions(everyone.permissions.remove(LOCKED), `Lockdown : ${reason}`).catch((e) => log.warn('lockdown', '@everyone', { detail: e.message }));
  let done = 0;
  for (const id of Object.keys(state.channels)) {
    const ch = guild.channels.cache.get(id);
    if (await ch?.permissionOverwrites.edit(everyone.id, LOCK_OVERWRITE, { reason: `Lockdown : ${reason}` }).catch(() => null)) done += 1;
  }
  await guild.disableInvites(true).catch(() => {});
  return { channels: done };
}

async function unlock(guild, by) {
  const state = db.lockdown?.[guild.id];
  if (!state) return { notLocked: true };
  const everyone = guild.roles.everyone;

  await everyone.setPermissions(new PermissionsBitField(BigInt(state.everyonePerms)), `Fin du lockdown (${by})`).catch(() => {});
  for (const [id, ow] of Object.entries(state.channels)) {
    const ch = guild.channels.cache.get(id);
    if (!ch) continue;
    if (ow) {
      await ch.permissionOverwrites.set(
        [...ch.permissionOverwrites.cache.filter((o) => o.id !== everyone.id).values(),
          { id: everyone.id, allow: BigInt(ow.allow), deny: BigInt(ow.deny) }],
        'Fin du lockdown',
      ).catch(() => {});
    } else {
      await ch.permissionOverwrites.delete(everyone.id, 'Fin du lockdown').catch(() => {});
    }
  }
  await guild.disableInvites(false).catch(() => {});
  delete db.lockdown[guild.id];
  save();
  return { channels: Object.keys(state.channels).length };
}

module.exports = { lock, unlock, isLocked };
