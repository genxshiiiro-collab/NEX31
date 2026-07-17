const {
  ChannelType, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  AttachmentBuilder, MessageFlags,
} = require('discord.js');
const config = require('../../config');
const { db, save, isBlacklisted } = require('../storage');
const { isStaff, isTicketChannel, slugifyName } = require('./helpers');
const { syncFromMeta } = require('./ticketPastille');
const { V2, container, text, separator, fieldsText, file } = require('./components');
const log = require('./logger');

function validId(id) {
  return typeof id === 'string' && /^\d+$/.test(id);
}

function ticketControlsRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ticket:claim').setLabel('Prendre en charge').setEmoji('🙋').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('ticket:close').setLabel('Fermer le ticket').setEmoji('🔒').setStyle(ButtonStyle.Danger),
  );
}

/** Crée un salon de ticket pour l'utilisateur qui a cliqué. */
async function createTicket(interaction, typeId) {
  const guild = interaction.guild;
  const user = interaction.user;
  const type = config.ticketTypes.find((t) => t.id === typeId) || { id: 'ticket', label: 'Ticket', emoji: '🎫' };

  // Ack immédiat : la création d'un salon peut dépasser les 3 s autorisées par
  // Discord (sinon 10062 Unknown interaction / 40060 already acknowledged).
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
  }

  if (isBlacklisted(guild.id, user.id)) {
    return interaction.editReply({ content: '🚫 Tu ne peux pas ouvrir de ticket.' });
  }

  // Empêche les doublons : un seul ticket ouvert par personne (sur ce serveur).
  const already = Object.entries(db.tickets).find(([, m]) => m.ownerId === user.id && m.guildId === guild.id && !m.closed);
  if (already) {
    const existing = guild.channels.cache.get(already[0]) || await guild.channels.fetch(already[0]).catch(() => null);
    if (existing) {
      return interaction.editReply({ content: `❗ Tu as déjà un ticket ouvert : ${existing}` });
    }
    delete db.tickets[already[0]]; // salon supprimé entre-temps : on nettoie
  }

  const cfg = config.forGuild(guild.id);
  const ownerName = interaction.member?.displayName || user.username;
  const slug = slugifyName(ownerName);
  const name = config.pastillesEnabled !== false
    ? `${config.emoji.waiting}-${slug}`
    : `ticket-${slug}`;

  const overwrites = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    // Le bot doit se voir accorder l'accès, sinon il ne peut plus voir le salon
    // (donc plus de pastilles ni de lecture des messages).
    {
      id: guild.members.me.id,
      allow: [
        PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.AttachFiles,
      ],
    },
    {
      id: user.id,
      allow: [
        PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles,
      ],
    },
    ...cfg.staffRoleIds.filter(validId).map((r) => ({
      id: r,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
    })),
  ];

  const parentId = cfg.ticketCategoryIds.find(validId);
  let channel;
  try {
    channel = await guild.channels.create({
      name,
      type: ChannelType.GuildText,
      parent: parentId,
      topic: `Ticket ${type.label} • Ouvert par ${user.tag} (${user.id})`,
      permissionOverwrites: overwrites,
    });
  } catch (err) {
    console.error('[ticket] Création impossible :', err.message);
    return interaction.editReply({
      content: '⚠️ Impossible de créer le salon. Vérifie que le bot a la permission **Gérer les salons** et que la catégorie de tickets est bien configurée.',
    });
  }

  db.tickets[channel.id] = {
    guildId: guild.id, ownerId: user.id, ownerName, nameSlug: slugifyName(ownerName),
    status: 'waiting', type: type.id,
    lastUserAt: Date.now(), relanceSent: false, closed: false,
  };
  save();

  const staffPing = cfg.staffRoleIds.filter(validId).map((r) => `<@&${r}>`).join(' ');

  // Accueil (Components V2) : court et sans fioritures.
  const welcome = container()
    .addTextDisplayComponents(text(`## ${type.label}`))
    .addTextDisplayComponents(text(`${user} ${staffPing}`.trim()))
    .addTextDisplayComponents(text(
      `Bonjour ${user}, merci d'avoir ouvert un ticket.\n` +
      'Décris ta demande **en détail** (idée, style, deadline, budget), ' +
      'un membre du staff te répondra dès que possible.',
    ))
    .addActionRowComponents(ticketControlsRow());

  await channel.send({
    components: [welcome],
    flags: V2,
    allowedMentions: { users: [user.id], roles: cfg.staffRoleIds.filter(validId) },
  });

  log.event(guild, {
    level: 'success', scope: 'ticket', title: '🎫 Ticket ouvert',
    fields: [
      { name: 'Salon', value: `${channel}`, inline: true },
      { name: 'Auteur', value: `${user}`, inline: true },
      { name: 'Motif', value: type.label, inline: true },
    ],
  });

  return interaction.editReply({ content: `✅ Ton ticket a été créé : ${channel}` });
}

async function buildTranscript(channel) {
  const all = [];
  let lastId;
  for (let i = 0; i < 10; i++) {
    const batch = await channel.messages.fetch({ limit: 100, ...(lastId && { before: lastId }) });
    if (batch.size === 0) break;
    all.push(...batch.values());
    lastId = batch.last().id;
    if (batch.size < 100) break;
  }
  all.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
  const header = `Transcript du ticket #${channel.name}\nGénéré le ${new Date().toLocaleString('fr-FR')}\n${'='.repeat(50)}\n\n`;
  const body = all.map((m) => {
    const time = new Date(m.createdTimestamp).toLocaleString('fr-FR');
    const att = m.attachments.size ? ' [' + [...m.attachments.values()].map((a) => a.url).join(', ') + ']' : '';
    return `[${time}] ${m.author.tag}: ${m.content || ''}${att}`;
  }).join('\n');
  return header + body;
}

/**
 * Ferme le ticket courant : archive un transcript dans le salon de logs puis supprime le salon.
 * Réservé au staff.
 */
async function closeTicket(interaction, reason = 'Non précisée') {
  const channel = interaction.channel;
  if (!isTicketChannel(channel)) {
    return interaction.reply({ content: '❌ Cette action s\'utilise dans un salon de ticket.', flags: MessageFlags.Ephemeral });
  }
  if (!isStaff(interaction.member)) {
    return interaction.reply({ content: '❌ Seul le staff peut fermer un ticket.', flags: MessageFlags.Ephemeral });
  }
  const meta = db.tickets[channel.id];

  // Accuse réception selon le type d'interaction (bouton vs slash).
  if (interaction.isButton?.()) {
    await interaction.update({ content: '📦 Archivage du ticket en cours...', components: [], embeds: [] }).catch(() => {});
  } else {
    await interaction.reply({ content: '📦 Archivage du ticket en cours...' });
  }

  const transcript = await buildTranscript(channel);
  // Nom ASCII-safe : la référence attachment:// (Components V2) n'aime pas les emoji/accents.
  const transcriptName = `transcript-${slugifyName(channel.name)}.txt`;
  const transcriptFile = new AttachmentBuilder(Buffer.from(transcript, 'utf8'), { name: transcriptName });

  const logChannelId = config.forGuild(interaction.guild.id).logChannelId;
  const logChannel = logChannelId ? await interaction.guild.channels.fetch(logChannelId).catch(() => null) : null;
  if (logChannel) {
    const c = container()
      .addTextDisplayComponents(text('## 🔒 Ticket fermé'))
      .addSeparatorComponents(separator())
      .addTextDisplayComponents(text(fieldsText([
        { name: 'Salon', value: `#${channel.name}` },
        { name: 'Fermé par', value: `<@${interaction.user.id}>` },
        { name: 'Client', value: meta?.ownerId ? `<@${meta.ownerId}>` : '—' },
        { name: 'Raison', value: reason },
      ])))
      .addFileComponents(file(transcriptName));
    await logChannel.send({
      components: [c], files: [transcriptFile], flags: V2, allowedMentions: { parse: [] },
    }).catch(() => {});
  }

  if (meta) { meta.closed = true; }
  delete db.tickets[channel.id];
  save();

  const { resetChannel } = require('./renameQueue');
  resetChannel(channel.id);

  log.event(interaction.guild, {
    level: 'info', scope: 'ticket', title: '🔒 Ticket fermé',
    fields: [
      { name: 'Salon', value: `#${channel.name}`, inline: true },
      { name: 'Fermé par', value: `<@${interaction.user.id}>`, inline: true },
      { name: 'Client', value: meta?.ownerId ? `<@${meta.ownerId}>` : '—', inline: true },
      { name: 'Raison', value: reason, inline: false },
    ],
  });

  const delay = config.deleteTicketAfterCloseSeconds;
  if (delay > 0) {
    await channel.send(`✅ Transcript archivé. Suppression du salon dans ${delay}s.`).catch(() => {});
    setTimeout(() => channel.delete('Ticket fermé').catch(() => {}), delay * 1000);
  } else {
    await channel.send('✅ Transcript archivé.').catch(() => {});
  }
}

/** Un membre du staff prend le ticket en charge : passe la pastille au vert + note le responsable. */
async function claimTicket(interaction) {
  if (!isTicketChannel(interaction.channel)) {
    return interaction.reply({ content: '❌ Cette action s\'utilise dans un salon de ticket.', flags: MessageFlags.Ephemeral });
  }
  if (!isStaff(interaction.member)) {
    return interaction.reply({ content: '❌ Réservé au staff.', flags: MessageFlags.Ephemeral });
  }
  const meta = db.tickets[interaction.channel.id];
  if (meta?.claimedBy && meta.claimedBy !== interaction.user.id) {
    return interaction.reply({ content: `ℹ️ Ce ticket est déjà pris en charge par <@${meta.claimedBy}>.`, flags: MessageFlags.Ephemeral });
  }
  if (meta) { meta.claimedBy = interaction.user.id; meta.status = 'answered'; save(); }

  syncFromMeta(interaction.channel, meta).catch((e) => log.error('pastille', 'claim sync', e));

  log.event(interaction.guild, {
    level: 'info', scope: 'ticket', title: '🙋 Ticket pris en charge',
    fields: [
      { name: 'Salon', value: `${interaction.channel}`, inline: true },
      { name: 'Staff', value: `<@${interaction.user.id}>`, inline: true },
    ],
  });

  return interaction.reply({ content: `🙋 <@${interaction.user.id}> prend ce ticket en charge.` });
}

module.exports = { createTicket, closeTicket, claimTicket, ticketControlsRow };
