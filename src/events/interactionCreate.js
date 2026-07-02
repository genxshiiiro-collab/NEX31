const {
  MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle,
} = require('discord.js');
const { db, save } = require('../storage');
const { isStaff } = require('../lib/helpers');
const { V2 } = require('../lib/components');
const { updateSuiviMessage, postSuiviInTicket, STEPS, LAST_STEP } = require('../commands/commande');
const { validationContainer, publicContainer } = require('../commands/avis');
const { createTicket, closeTicket, claimTicket } = require('../lib/tickets');
const { approvePayment, rejectPayment } = require('../lib/payments');
const { applyPastilleFromInteraction } = require('../lib/ticketPastille');
const config = require('../../config');
const log = require('../lib/logger');

async function handleTicketButton(interaction, action) {
  if (action === 'new') return createTicket(interaction, 'commande');
  if (action === 'claim') return claimTicket(interaction);
  if (action === 'close') {
    if (!isStaff(interaction.member)) {
      return interaction.reply({ content: '❌ Seul le staff peut fermer un ticket.', flags: MessageFlags.Ephemeral });
    }
    // Demande une confirmation avant de fermer.
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ticket:closeconfirm').setLabel('Confirmer la fermeture').setEmoji('🔒').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('ticket:closecancel').setLabel('Annuler').setStyle(ButtonStyle.Secondary),
    );
    return interaction.reply({ content: 'Confirmer la fermeture de ce ticket ?', components: [row], flags: MessageFlags.Ephemeral });
  }
  if (action === 'closeconfirm') {
    if (!isStaff(interaction.member)) {
      return interaction.reply({ content: '❌ Seul le staff peut fermer un ticket.', flags: MessageFlags.Ephemeral });
    }
    return closeTicket(interaction);
  }
  if (action === 'closecancel') {
    return interaction.update({ content: 'Fermeture annulée.', components: [] });
  }
}

async function handleAvisButton(interaction, action, id) {
  if (!isStaff(interaction.member)) {
    return interaction.reply({ content: '❌ Réservé au staff.', flags: MessageFlags.Ephemeral });
  }
  const review = db.reviews[id];
  if (!review) {
    return interaction.reply({ content: '⚠️ Avis introuvable (peut-être déjà traité).', flags: MessageFlags.Ephemeral });
  }
  if (review.status !== 'pending') {
    return interaction.reply({ content: `ℹ️ Avis déjà **${review.status}**.`, flags: MessageFlags.Ephemeral });
  }

  if (action === 'approve') {
    review.status = 'approved';
    review.handledBy = interaction.user.id;
    save();

    const author = await interaction.client.users.fetch(review.authorId).catch(() => null);
    const avatar = author?.displayAvatarURL();

    const publicChannelId = config.forGuild(interaction.guild.id).reviewPublicChannelId;
    const publicChannel = publicChannelId ? await interaction.guild.channels.fetch(publicChannelId).catch(() => null) : null;
    if (publicChannel) {
      await publicChannel.send({
        components: [publicContainer(review, avatar)],
        flags: V2,
        allowedMentions: { parse: [] },
      });
    }

    await interaction.update({ components: [validationContainer(review, avatar)], flags: V2 });

    interaction.client.users.fetch(review.authorId)
      .then((u) => u.send(`✅ Ton avis (#${review.id}) a été validé et publié. Merci !`))
      .catch(() => {});

    log.event(interaction.guild, {
      level: 'success', scope: 'avis', title: `⭐ Avis #${review.id} publié`,
      fields: [
        { name: 'Client', value: `<@${review.authorId}>`, inline: true },
        { name: 'Note', value: `${review.note}/5`, inline: true },
        { name: 'Validé par', value: `<@${interaction.user.id}>`, inline: true },
      ],
    });
    return;
  }

  if (action === 'reject') {
    // Demande la raison via un modal.
    const modal = new ModalBuilder()
      .setCustomId(`avis:rejectmodal:${id}`)
      .setTitle(`Refuser l'avis #${id}`)
      .addComponents(new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('reason').setLabel('Raison du refus (visible par le client)')
          .setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(300),
      ));
    return interaction.showModal(modal);
  }
}

async function handleRejectModal(interaction, id) {
  const review = db.reviews[id];
  if (!review || review.status !== 'pending') {
    return interaction.reply({ content: '⚠️ Avis déjà traité.', flags: MessageFlags.Ephemeral });
  }
  const reason = interaction.fields.getTextInputValue('reason');
  review.status = 'rejected';
  review.handledBy = interaction.user.id;
  review.rejectReason = reason;
  save();

  await interaction.update({ components: [validationContainer(review)], flags: V2 });

  interaction.client.users.fetch(review.authorId)
    .then((u) => u.send(`❌ Ton avis (#${review.id}) n'a pas été publié.\n**Raison :** ${reason}`))
    .catch(() => {});

  log.event(interaction.guild, {
    level: 'warn', scope: 'avis', title: `❌ Avis #${review.id} refusé`,
    fields: [
      { name: 'Client', value: `<@${review.authorId}>`, inline: true },
      { name: 'Refusé par', value: `<@${interaction.user.id}>`, inline: true },
      { name: 'Raison', value: reason, inline: false },
    ],
  });
}

async function handleOrderStep(interaction, id, action) {
  if (!isStaff(interaction.member)) {
    return interaction.reply({ content: '❌ Réservé au staff.', flags: MessageFlags.Ephemeral });
  }
  const order = db.orders[id];
  if (!order) {
    return interaction.reply({ content: '⚠️ Commande introuvable.', flags: MessageFlags.Ephemeral });
  }

  if (action === 'cancel') {
    order.cancelled = true;
  } else if (action === 'next') {
    if (order.step < LAST_STEP) order.step += 1;
  } else if (action === 'prev') {
    order.cancelled = false; // sert aussi de "Réactiver"
    if (order.step > 0) order.step -= 1;
  }
  save();

  try {
    await updateSuiviMessage(interaction, order);
  } catch {
    await interaction.deferUpdate().catch(() => {});
    const ch = interaction.channel;
    if (ch && order.ticketChannelId) {
      await postSuiviInTicket(ch, order, { replace: true });
    }
  }

  const stateLabel = order.cancelled ? 'Annulée' : `${STEPS[order.step].label} (${order.step + 1}/4)`;
  log.event(interaction.guild, {
    level: 'info', scope: 'commande', title: `🛠️ Commande #${order.id} — ${stateLabel}`,
    fields: [
      { name: 'Client', value: `<@${order.clientId}>`, inline: true },
      { name: 'Par', value: `<@${interaction.user.id}>`, inline: true },
    ],
  });

  // À la dernière étape : prévient le client et l'invite à laisser un avis.
  if (!order.cancelled && order.step === LAST_STEP && action === 'next') {
    interaction.client.users.fetch(order.clientId)
      .then((u) => u.send(`✅ Ta commande #${order.id} (${order.prestation}) est **livrée** ! N'hésite pas à laisser un avis avec /avis 🙂`))
      .catch(() => {});
  }
}

async function handlePayButton(interaction, action, id) {
  if (action === 'approve') return approvePayment(interaction, id);
  if (action === 'reject') {
    if (!isStaff(interaction.member)) {
      return interaction.reply({ content: '❌ Réservé au staff.', flags: MessageFlags.Ephemeral });
    }
    const modal = new ModalBuilder()
      .setCustomId(`pay:rejectmodal:${id}`)
      .setTitle(`Refuser le paiement #${id}`)
      .addComponents(new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('reason').setLabel('Raison (visible par le client)')
          .setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(300),
      ));
    return interaction.showModal(modal);
  }
}

async function handlePayRejectModal(interaction, id) {
  const reason = interaction.fields.getTextInputValue('reason');
  return rejectPayment(interaction, id, reason);
}

module.exports = {
  name: 'interactionCreate',
  async execute(interaction) {
    try {
      if (interaction.guild && interaction.channel && interaction.user && !interaction.user.bot) {
        applyPastilleFromInteraction(interaction).catch((e) => log.error('pastille', 'interaction sync', e));
      }

      // --- Slash commands ---
      if (interaction.isChatInputCommand()) {
        const cmd = interaction.client.commands.get(interaction.commandName);
        if (!cmd) return;
        log.debug('commande', `/${interaction.commandName}`, { par: interaction.user.tag });
        return await cmd.execute(interaction);
      }

      // --- Menus déroulants ---
      if (interaction.isStringSelectMenu()) {
        const [ns, action] = interaction.customId.split(':');
        if (ns === 'ticket' && action === 'create') return await createTicket(interaction, interaction.values[0]);
        return;
      }

      // --- Boutons ---
      if (interaction.isButton()) {
        const [ns, action, id, extra] = interaction.customId.split(':');
        if (ns === 'avis') return await handleAvisButton(interaction, action, id);
        if (ns === 'pay') return await handlePayButton(interaction, action, id);
        if (ns === 'order' && action === 'step') return await handleOrderStep(interaction, id, extra);
        if (ns === 'ticket') return await handleTicketButton(interaction, action);
        return;
      }

      // --- Modals ---
      if (interaction.isModalSubmit()) {
        const [ns, action, id] = interaction.customId.split(':');
        if (ns === 'avis' && action === 'rejectmodal') return await handleRejectModal(interaction, id);
        if (ns === 'pay' && action === 'rejectmodal') return await handlePayRejectModal(interaction, id);
        return;
      }
    } catch (err) {
      log.error('interaction', `Erreur sur ${interaction.commandName || interaction.customId || 'interaction'}`, err);
      if (interaction.guild) {
        log.event(interaction.guild, {
          level: 'error', scope: 'interaction', title: '⛔ Erreur d\'interaction',
          description: `\`${(err && err.message) || err}\``,
        });
      }
      const payload = { content: '⚠️ Une erreur est survenue.', flags: MessageFlags.Ephemeral };
      if (interaction.deferred || interaction.replied) interaction.followUp(payload).catch(() => {});
      else interaction.reply(payload).catch(() => {});
    }
  },
};
