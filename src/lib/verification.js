// Vérification à l'arrivée : les nouveaux membres reçoivent le rôle "Visiteur"
// (ne voit que #vérification) et cliquent "Vérifier".
//  - compte de moins de MIN_AGE_DAYS jours : refusé
//  - ressemblance forte avec un banni global : refusé (ou ban global si très forte)
//  - léger doute : le propriétaire reçoit un DM pour trancher
//  - sinon : rôle Visiteur retiré, accès au serveur
const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, MessageFlags, PermissionFlagsBits: P,
} = require('discord.js');
const { db, save } = require('../storage');
const { V2, container, text, separator } = require('./components');
const gb = require('./globalBan');
const log = require('./logger');

const MIN_AGE_DAYS = 90;
const DAY = 86400e3;
const ROLE_NAME = 'Visiteur';
const CHANNEL_NAME = 'vérification';

const cfgFor = (guildId) => (db.verif || {})[guildId];
const pendingKey = (guildId, userId) => `${guildId}:${userId}`;

// --- Mise en place du serveur ---

/** Visiteur ne voit pas ce salon. */
function hideFromVisitors(channel, roleId) {
  return channel.permissionOverwrites.edit(roleId, { ViewChannel: false }, { reason: 'Vérification : salon caché aux visiteurs' });
}

function panelMessage() {
  const c = container(0x3498db)
    .addTextDisplayComponents(text('## Vérification'))
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(text([
      'Bienvenue. Clique sur **Vérifier** pour accéder au serveur.',
      '',
      '**Important :** une fois vérifié, ouvre **Salons et rôles** (en haut de la liste des salons) et **coche tous les salons**, sinon une partie du serveur restera masquée pour toi.',
      `-# Ton compte Discord doit avoir au moins ${Math.round(MIN_AGE_DAYS / 30)} mois.`,
    ].join('\n')))
    .addActionRowComponents(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('verif:go').setLabel('Vérifier').setStyle(ButtonStyle.Success),
    ));
  return { components: [c], flags: V2 };
}

/** Crée/retrouve le rôle et le salon, cache tout le reste aux visiteurs, poste le panneau. */
async function setup(guild) {
  const me = guild.members.me;
  let role = guild.roles.cache.find((r) => r.name === ROLE_NAME && !r.managed);
  if (!role) {
    role = await guild.roles.create({ name: ROLE_NAME, color: 0x95a5a6, permissions: [], reason: 'Vérification' });
  }

  let channel = guild.channels.cache.find((c) => c.type === ChannelType.GuildText && c.name === CHANNEL_NAME);
  const verifOverwrites = [
    { id: guild.roles.everyone.id, deny: [P.ViewChannel] },
    { id: role.id, allow: [P.ViewChannel, P.ReadMessageHistory], deny: [P.SendMessages, P.AddReactions, P.CreatePublicThreads] },
    { id: me.id, allow: [P.ViewChannel, P.SendMessages, P.ReadMessageHistory] },
  ];
  if (!channel) {
    channel = await guild.channels.create({
      name: CHANNEL_NAME, type: ChannelType.GuildText, position: 0, permissionOverwrites: verifOverwrites, reason: 'Vérification',
    });
  } else {
    await channel.permissionOverwrites.set(verifOverwrites, 'Vérification');
  }

  let hidden = 0;
  let failed = 0;
  for (const ch of guild.channels.cache.values()) {
    if (ch.id === channel.id || ch.isThread()) continue;
    try { await hideFromVisitors(ch, role.id); hidden += 1; } catch { failed += 1; }
  }

  const old = cfgFor(guild.id);
  if (old?.panelMessageId && old.channelId === channel.id) {
    await channel.messages.delete(old.panelMessageId).catch(() => {});
  }
  const panel = await channel.send(panelMessage());

  if (!db.verif) db.verif = {};
  db.verif[guild.id] = { roleId: role.id, channelId: channel.id, panelMessageId: panel.id };
  save();
  return { role, channel, hidden, failed };
}

/** Nouveau salon créé : on le cache aussi aux visiteurs. */
async function onChannelCreate(channel) {
  const cfg = channel.guild && cfgFor(channel.guild.id);
  if (!cfg || channel.id === cfg.channelId || channel.name === CHANNEL_NAME || channel.isThread?.()) return;
  await hideFromVisitors(channel, cfg.roleId).catch((err) => log.warn('verif', 'Salon non caché', { detail: err.message }));
}

/** Arrivée : rôle Visiteur si la vérification est en place. Retourne true si appliqué. */
async function giveVisitorRole(member) {
  const cfg = cfgFor(member.guild.id);
  if (!cfg) return false;
  await member.roles.add(cfg.roleId, 'Vérification en attente')
    .catch((err) => log.warn('verif', 'Rôle Visiteur impossible', { id: member.id, detail: err.message }));
  return true;
}

// --- Décideurs (DM) ---

function deciderIds(guild) {
  const owners = (process.env.GBAN_OWNERS || '').split(',').map((s) => s.trim()).filter(Boolean);
  return owners.length ? owners : [guild.ownerId];
}

async function dmDeciders(guild, user, ageDays, match) {
  const c = container(0xf39c12)
    .addTextDisplayComponents(text(`## Vérification à valider — ${guild.name}`))
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(text([
      `**Compte** — <@${user.id}> (${user.tag}, \`${user.id}\`)`,
      `**Âge du compte** — ${ageDays} jours`,
      `**Ressemble à** — \`${match.id}\` (${match.ban.tag}), banni pour : ${match.ban.reason}`,
      `**Score** — ${match.score} — ${match.reasons.join(', ')}`,
    ].join('\n')))
    .addActionRowComponents(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`verif:accept:${guild.id}:${user.id}`).setLabel('Accepter').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`verif:refuse:${guild.id}:${user.id}`).setLabel('Refuser (expulser)').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`verif:gban:${guild.id}:${user.id}`).setLabel('Ban global').setStyle(ButtonStyle.Danger),
    ));
  let sent = 0;
  for (const id of deciderIds(guild)) {
    const u = await guild.client.users.fetch(id).catch(() => null);
    if (await u?.send({ components: [c], flags: V2, allowedMentions: { parse: [] } }).catch(() => null)) sent += 1;
  }
  return sent;
}

// --- Bouton "Vérifier" ---

async function handleVerify(interaction) {
  const { guild, member } = interaction;
  const cfg = cfgFor(guild.id);
  const say = (content) => interaction.reply({ content, flags: MessageFlags.Ephemeral });
  if (!cfg) return say('La vérification n\'est pas configurée.');
  if (!member.roles.cache.has(cfg.roleId)) return say('Tu es déjà vérifié.');

  const logRefusal = (why) => log.event(guild, {
    level: 'warn', scope: 'verif', title: 'Vérification refusée',
    fields: [{ name: 'Compte', value: `<@${member.id}> (${member.user.tag})`, inline: true }, { name: 'Motif', value: why, inline: true }],
  });

  if (db.globalBans[member.id]) {
    await say('Accès refusé.');
    await member.ban({ reason: `[Ban global] ${db.globalBans[member.id].reason}`.slice(0, 512) }).catch(() => {});
    return;
  }
  if (db.verifPending?.[pendingKey(guild.id, member.id)]) {
    return say('Ta vérification est en attente de validation par le staff.');
  }

  const user = await interaction.client.users.fetch(member.id, { force: true }).catch(() => member.user);
  const ageDays = Math.floor((Date.now() - user.createdTimestamp) / DAY);
  if (ageDays < MIN_AGE_DAYS) {
    logRefusal(`compte trop récent (${ageDays} jours)`);
    return say(`Vérification refusée : ton compte doit avoir au moins ${Math.round(MIN_AGE_DAYS / 30)} mois (il a ${ageDays} jours).`);
  }

  const match = gb.bestMatch(user);
  const score = match?.score || 0;

  if (score >= gb.AUTO_BAN_SCORE) {
    await say('Accès refusé.');
    gb.link(match.id, member.id);
    await gb.globalBan(interaction.client, [member.id], { reason: `Alt de ${match.id} — ${match.ban.reason}`, by: interaction.client.user.id });
    gb.logAll(interaction.client, {
      level: 'error', title: 'Alt banni à la vérification',
      fields: [{ name: 'Compte', value: `<@${member.id}> (${user.tag})` }, { name: 'Score', value: `${score} — ${match.reasons.join(', ')}` }],
    });
    return;
  }
  if (score >= gb.QUARANTINE_SCORE) {
    logRefusal(`compte suspect (score ${score} : ${match.reasons.join(', ')})`);
    return say('Vérification refusée. Si tu penses que c\'est une erreur, contacte le staff.');
  }
  if (score > 0) {
    if (!db.verifPending) db.verifPending = {};
    db.verifPending[pendingKey(guild.id, member.id)] = { at: Date.now(), matchId: match.id };
    save();
    const sent = await dmDeciders(guild, user, ageDays, match);
    if (!sent) log.event(guild, { level: 'warn', scope: 'verif', title: 'DM de validation impossible', description: `<@${member.id}> en attente — DM fermés ?` });
    return say('Ta vérification est en attente de validation par le staff.');
  }

  await member.roles.remove(cfg.roleId, 'Vérifié');
  log.event(guild, { level: 'success', scope: 'verif', title: 'Membre vérifié', description: `<@${member.id}> (${user.tag}) — compte de ${ageDays} jours` });
  return say('Vérifié. Bienvenue sur le serveur. Pense à ouvrir **Salons et rôles** (en haut de la liste des salons) et à **cocher tous les salons** pour tout voir.');
}

// --- Boutons du DM de validation ---

async function handleDecision(interaction, action, guildId, userId) {
  const guild = interaction.client.guilds.cache.get(guildId);
  if (!guild) return interaction.reply({ content: 'Serveur introuvable.', flags: MessageFlags.Ephemeral });
  if (!deciderIds(guild).includes(interaction.user.id)) {
    return interaction.reply({ content: "Vous n'avez pas la permission d'utiliser cette commande.", flags: MessageFlags.Ephemeral });
  }

  const pending = db.verifPending?.[pendingKey(guildId, userId)];
  if (db.verifPending) delete db.verifPending[pendingKey(guildId, userId)];
  save();

  const cfg = cfgFor(guildId);
  const member = await guild.members.fetch(userId).catch(() => null);
  const done = (title, color) => interaction.update({
    components: [container(color).addTextDisplayComponents(text(`## ${title}`)).addTextDisplayComponents(text(`<@${userId}> — ${guild.name}`))],
    flags: V2,
    allowedMentions: { parse: [] },
  });

  if (action === 'accept') {
    if (member && cfg) await member.roles.remove(cfg.roleId, `Vérification acceptée par ${interaction.user.tag}`).catch(() => {});
    member?.send(`Ta vérification sur **${guild.name}** a été acceptée. Bienvenue.`).catch(() => {});
    log.event(guild, { level: 'success', scope: 'verif', title: 'Vérification acceptée', description: `<@${userId}> par <@${interaction.user.id}>` });
    return done('Vérification acceptée', 0x2ecc71);
  }
  if (action === 'refuse') {
    await member?.kick(`Vérification refusée par ${interaction.user.tag}`).catch(() => {});
    log.event(guild, { level: 'warn', scope: 'verif', title: 'Vérification refusée', description: `<@${userId}> expulsé par <@${interaction.user.id}>` });
    return done('Refusé et expulsé', 0x95a5a6);
  }
  if (action === 'gban') {
    await done('Ban global appliqué', 0xe74c3c);
    if (pending?.matchId) gb.link(pending.matchId, userId);
    await gb.globalBan(interaction.client, [userId], { reason: 'Refusé à la vérification (alt suspect)', by: interaction.user.id });
    gb.logAll(interaction.client, { level: 'error', title: 'Ban global', description: `<@${userId}> — refusé à la vérification par <@${interaction.user.id}>` });
  }
}

async function handleButton(interaction, action, id, extra) {
  if (action === 'go') return handleVerify(interaction);
  return handleDecision(interaction, action, id, extra);
}

module.exports = { setup, onChannelCreate, giveVisitorRole, handleButton, MIN_AGE_DAYS };
