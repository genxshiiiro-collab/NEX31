const {
  SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags,
} = require('discord.js');
const config = require('../../config');
const { db, nextId, save, isBlacklisted } = require('../storage');
const { isCustomer, stars } = require('../lib/helpers');
const {
  V2, container, text, separator, thumbSection, fieldsText,
} = require('../lib/components');
const log = require('../lib/logger');

/** Boutons Valider / Refuser pour un avis en attente. */
function validationRow(id) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`avis:approve:${id}`).setLabel('Valider & publier').setStyle(ButtonStyle.Success).setEmoji('✅'),
    new ButtonBuilder().setCustomId(`avis:reject:${id}`).setLabel('Refuser').setStyle(ButtonStyle.Danger).setEmoji('❌'),
  );
}

/**
 * Conteneur V2 de l'avis dans le salon de validation (staff).
 * Selon review.status : en attente (avec boutons), publié, ou refusé.
 */
function validationContainer(review, avatarURL) {
  const map = {
    pending: { color: config.brandColor, title: `🕓 Avis #${review.id} — en attente de validation` },
    approved: { color: 0x2ecc71, title: `✅ Avis #${review.id} — publié${review.handledBy ? ` par <@${review.handledBy}>` : ''}` },
    rejected: { color: 0xe74c3c, title: `❌ Avis #${review.id} — refusé${review.handledBy ? ` par <@${review.handledBy}>` : ''}` },
  };
  const m = map[review.status] || map.pending;

  const c = container(m.color).addTextDisplayComponents(text(`## ${m.title}`));

  const infoLines = [
    `**Client** — <@${review.authorId}>`,
    `**Note** — ${stars(review.note)} (${review.note}/5)`,
    `**Prestation** — ${review.prestation}`,
  ];
  c.addSeparatorComponents(separator());
  if (avatarURL) c.addSectionComponents(thumbSection(infoLines, avatarURL));
  else c.addTextDisplayComponents(text(infoLines.join('\n')));

  c.addSeparatorComponents(separator())
    .addTextDisplayComponents(text(`>>> ${review.comment}`));

  if (review.status === 'rejected' && review.rejectReason) {
    c.addTextDisplayComponents(text(`**Raison du refus** — ${review.rejectReason}`));
  }
  if (review.status === 'pending') {
    c.addActionRowComponents(validationRow(review.id));
  }
  return c;
}

/** Conteneur V2 de l'avis publié publiquement. */
function publicContainer(review, avatarURL) {
  const c = container(0x2ecc71)
    .addTextDisplayComponents(text(`## ${stars(review.note)}  ${review.note}/5`));
  const lines = [
    `**${review.authorTag}**`,
    `>>> ${review.comment}`,
  ];
  if (avatarURL) c.addSectionComponents(thumbSection(lines, avatarURL));
  else c.addTextDisplayComponents(text(lines.join('\n')));
  c.addSeparatorComponents(separator())
    .addTextDisplayComponents(text(fieldsText([{ name: 'Prestation', value: review.prestation }])))
    .addTextDisplayComponents(text(`-# Avis #${review.id}`));
  return c;
}

const data = new SlashCommandBuilder()
  .setName('avis')
  .setDescription('Laisser un avis sur une prestation (réservé aux clients)')
  .addIntegerOption((o) =>
    o.setName('note').setDescription('Ta note sur 5').setRequired(true)
      .addChoices(
        { name: '⭐ 1/5', value: 1 }, { name: '⭐⭐ 2/5', value: 2 },
        { name: '⭐⭐⭐ 3/5', value: 3 }, { name: '⭐⭐⭐⭐ 4/5', value: 4 },
        { name: '⭐⭐⭐⭐⭐ 5/5', value: 5 },
      ))
  .addStringOption((o) =>
    o.setName('prestation').setDescription('Type de prestation (logo, bannière, overlay...)').setRequired(true).setMaxLength(100))
  .addStringOption((o) =>
    o.setName('commentaire').setDescription('Ton retour détaillé').setRequired(true).setMaxLength(900));

async function execute(interaction) {
  // Ack immédiat : l'envoi vers le salon de validation peut dépasser les 3 s
  // autorisées par Discord (sinon 10062 Unknown interaction).
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
  }

  if (isBlacklisted(interaction.guild.id, interaction.user.id)) {
    return interaction.editReply({ content: '🚫 Tu ne peux pas laisser d\'avis.' });
  }
  if (!isCustomer(interaction.member)) {
    return interaction.editReply({
      content: '❌ Seuls les membres avec le rôle **client** peuvent laisser un avis.',
    });
  }

  const validationChannelId = config.forGuild(interaction.guild.id).reviewValidationChannelId;
  const validationChannel = validationChannelId
    ? await interaction.guild.channels.fetch(validationChannelId).catch(() => null)
    : null;
  if (!validationChannel) {
    return interaction.editReply({
      content: '⚠️ Salon de validation des avis introuvable. Préviens un admin (config `reviewValidationChannelId`).',
    });
  }

  const note = interaction.options.getInteger('note');
  const prestation = interaction.options.getString('prestation');
  const comment = interaction.options.getString('commentaire');

  const id = nextId('review');
  const review = {
    id,
    guildId: interaction.guild.id,
    authorId: interaction.user.id,
    authorTag: interaction.user.tag,
    note, prestation, comment,
    status: 'pending',
    createdAt: Date.now(),
  };
  db.reviews[id] = review;
  save();

  await validationChannel.send({
    components: [validationContainer(review, interaction.user.displayAvatarURL())],
    flags: V2,
    allowedMentions: { parse: [] },
  });

  log.event(interaction.guild, {
    level: 'info', scope: 'avis', title: `📝 Nouvel avis #${id} en attente`,
    fields: [
      { name: 'Client', value: `<@${review.authorId}>`, inline: true },
      { name: 'Note', value: `${note}/5`, inline: true },
      { name: 'Prestation', value: prestation, inline: true },
    ],
  });

  return interaction.editReply({
    content: '✅ Merci ! Ton avis a bien été envoyé. Il sera publié après validation par le staff.',
  });
}

module.exports = { data, execute, validationContainer, publicContainer };
