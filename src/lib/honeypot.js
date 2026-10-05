// Salon piège ("pot de miel") : tout message posté dedans = ban global immédiat
// du compte ET de tous ses alts liés (même mécanique que /gban add).
// Sert à attraper les bots de spam et les comptes piratés qui écrivent partout.
// Le salon est créé automatiquement au démarrage sur chaque serveur du bot.
const { ChannelType, PermissionFlagsBits: P } = require('discord.js');
const { db, save } = require('../storage');
const { isStaff } = require('./helpers');
const { V2, container, text, separator } = require('./components');
const gb = require('./globalBan');
const log = require('./logger');

const CHANNEL_NAME = 'ne-pas-écrire';
const DELETE_SECONDS = 86400; // efface ses messages des dernières 24 h sur chaque serveur

function warningMessage() {
  const c = container(0xc0392b)
    .addTextDisplayComponents(text('## Salon de sécurité — ne pas écrire'))
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(text([
      'Ce salon est surveillé automatiquement par le système de sécurité 31 Labs.',
      '',
      "**Aucun message ne doit être envoyé ici.** Tout message publié dans ce salon entraîne un **bannissement immédiat et définitif** de l'ensemble des serveurs 31 Labs, appliqué à tous les comptes associés, sans avertissement préalable.",
    ].join('\n')))
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(text("-# Ce salon sert à détecter les comptes piratés et les bots de spam. Il n'y a rien à faire ici : vous pouvez simplement l'ignorer."));
  return { components: [c], flags: V2, allowedMentions: { parse: [] } };
}

/** Crée le salon et le message d'avertissement s'ils n'existent pas. */
async function ensure(guild) {
  const saved = (db.honeypot || {})[guild.id];
  let channel = saved?.channelId ? await guild.channels.fetch(saved.channelId).catch(() => null) : null;
  if (!channel) channel = guild.channels.cache.find((c) => c.type === ChannelType.GuildText && c.name === CHANNEL_NAME);
  if (!channel) {
    channel = await guild.channels.create({
      name: CHANNEL_NAME,
      type: ChannelType.GuildText,
      position: 1,
      topic: 'Salon de sécurité : tout message ici = bannissement immédiat.',
      permissionOverwrites: [
        { id: guild.members.me.id, allow: [P.ViewChannel, P.SendMessages, P.ManageMessages, P.ReadMessageHistory] },
      ],
      reason: 'Salon piège anti-spam',
    });
    log.event(guild, { level: 'info', scope: 'honeypot', title: 'Salon piège créé', description: `<#${channel.id}>` });
  }

  let messageId = saved?.channelId === channel.id ? saved.messageId : null;
  const existing = messageId ? await channel.messages.fetch(messageId).catch(() => null) : null;
  if (!existing) messageId = (await channel.send(warningMessage())).id;

  if (!db.honeypot) db.honeypot = {};
  db.honeypot[guild.id] = { channelId: channel.id, messageId };
  save();
}

async function ensureAll(client) {
  for (const guild of client.guilds.cache.values()) {
    await ensure(guild).catch((err) => log.warn('honeypot', `Salon piège impossible sur ${guild.name}`, { detail: err.message }));
  }
}

/** Message dans le salon piège : suppression + ban global du compte et de ses alts (staff exempté). */
async function onMessage(message) {
  const cfg = message.guild && (db.honeypot || {})[message.guild.id];
  if (!cfg || message.channelId !== cfg.channelId || message.author.bot) return false;

  await message.delete().catch(() => {});
  const member = message.member || await message.guild.members.fetch(message.author.id).catch(() => null);
  if (member && isStaff(member)) return true;

  const reason = 'Message dans le salon piège (compte piraté / bot de spam)';
  // L'auteur est banni ; ses autres comptes sont expulsés par globalBan.
  const results = await gb.globalBan(message.client, [message.author.id], { reason, by: message.client.user.id, deleteSeconds: DELETE_SECONDS });
  gb.logAll(message.client, {
    level: 'error', title: 'Salon piège : ban global',
    fields: [
      { name: 'Comptes', value: results.map((r) => `<@${r.id}> (\`${r.id}\`) — ${r.guilds} serveur(s)`).join('\n') },
      { name: 'Auteur', value: `${message.author.tag} sur ${message.guild.name}` },
      { name: 'Message', value: (message.content || '*(pièce jointe)*').slice(0, 300) },
    ],
  });
  return true;
}

module.exports = { ensureAll, onMessage };
