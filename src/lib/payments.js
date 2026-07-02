// Flux paiement : déclaration client → validation staff → confirmation salon commandes + rôles.
const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, AttachmentBuilder,
} = require('discord.js');
const config = require('../../config');
const { db, save, nextId } = require('../storage');
const { isStaff } = require('./helpers');
const { V2, container, text, separator, fieldsText, file } = require('./components');
const { addClientTotal, syncCustomerTier, getClientTotal } = require('./customerTiers');
const log = require('./logger');

function paymentConfig(guildId) {
  const cfg = config.forGuild(guildId);
  const p = cfg.payment || {};
  return {
    paypal: p.paypal || '',
    revolut: p.revolut || '',
    validationChannelId: p.validationChannelId || cfg.reviewValidationChannelId,
    orderChannelId: cfg.orderChannelId,
  };
}

function validationRow(id) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`pay:approve:${id}`).setLabel('Accepter').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`pay:reject:${id}`).setLabel('Refuser').setStyle(ButtonStyle.Danger),
  );
}

/** Panneau d'info paiement (Components V2). */
function paymentInfoContainer(guildId) {
  const cfg = paymentConfig(guildId);
  const paypal = cfg.paypal || '—';
  const revolut = cfg.revolut || '—';
  return container()
    .addTextDisplayComponents(text('## Payer une commande'))
    .addTextDisplayComponents(text(
      'Choisis ton moyen de paiement, envoie le montant, puis déclare ton paiement avec **/payer declarer** '
      + '(joins une **capture ou un reçu** en preuve).\n'
      + 'Le staff vérifiera et tu recevras une confirmation.',
    ))
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(text(fieldsText([
      { name: 'PayPal', value: paypal },
      { name: 'Revolut', value: revolut },
    ])));
}

/** Message staff : paiement en attente. */
function paymentValidationContainer(payment) {
  const methodLabel = payment.method === 'revolut' ? 'Revolut' : 'PayPal';
  const c = container()
    .addTextDisplayComponents(text(`## Paiement #${payment.id} — en attente`))
    .addTextDisplayComponents(text(`<@${payment.userId}>`))
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(text(fieldsText([
      { name: 'Client', value: `<@${payment.userId}>` },
      { name: 'Montant', value: `${payment.amount} ${config.currency}` },
      { name: 'Méthode', value: methodLabel },
    ])));
  if (payment.note) c.addTextDisplayComponents(text(`**Note** — ${payment.note}`));
  if (payment.proofFileName) {
    c.addSeparatorComponents(separator())
      .addTextDisplayComponents(text('**Preuve de paiement**'))
      .addFileComponents(file(payment.proofFileName));
  }
  c.addActionRowComponents(validationRow(payment.id));
  return c;
}

/** Confirmation publique dans le salon commandes. */
function paymentConfirmedContainer(payment, tierName, total) {
  const methodLabel = payment.method === 'revolut' ? 'Revolut' : 'PayPal';
  return container(0x2ecc71)
    .addTextDisplayComponents(text(`## Paiement confirmé #${payment.id}`))
    .addTextDisplayComponents(text(`<@${payment.userId}>`))
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(text(fieldsText([
      { name: 'Montant', value: `${payment.amount} ${config.currency}` },
      { name: 'Méthode', value: methodLabel },
      { name: 'Total client', value: `${total} ${config.currency}` },
      { name: 'Palier', value: tierName || 'Customers' },
      { name: 'Validé par', value: `<@${payment.handledBy}>` },
    ])));
}

/** Crée une demande de paiement et l'envoie au staff. */
async function createPaymentRequest(guild, user, { amount, method, note, proofAttachment }) {
  const id = nextId('payment');
  const payment = {
    id,
    guildId: guild.id,
    userId: user.id,
    userTag: user.tag,
    amount,
    method,
    note: note || '',
    proofFileName: proofAttachment?.name || null,
    proofUrl: proofAttachment?.url || null,
    status: 'pending',
    createdAt: Date.now(),
  };
  if (!db.payments) db.payments = {};
  db.payments[id] = payment;
  save();

  const cfg = paymentConfig(guild.id);
  const valChannel = cfg.validationChannelId
    ? await guild.channels.fetch(cfg.validationChannelId).catch(() => null)
    : null;
  if (valChannel) {
    const payload = {
      components: [paymentValidationContainer(payment)],
      flags: V2,
      allowedMentions: { users: [user.id] },
    };
    if (payment.proofFileName && payment.proofUrl) {
      payload.files = [new AttachmentBuilder(payment.proofUrl, { name: payment.proofFileName })];
    }
    await valChannel.send(payload);
  }

  log.event(guild, {
    level: 'info', scope: 'paiement', title: `💳 Paiement #${id} déclaré`,
    fields: [
      { name: 'Client', value: `<@${user.id}>`, inline: true },
      { name: 'Montant', value: `${amount} ${config.currency}`, inline: true },
      { name: 'Méthode', value: method, inline: true },
    ],
  });

  return payment;
}

/** Staff accepte un paiement. */
async function approvePayment(interaction, id) {
  if (!isStaff(interaction.member)) {
    return interaction.reply({ content: '❌ Réservé au staff.', flags: MessageFlags.Ephemeral });
  }
  const payment = db.payments?.[id];
  if (!payment || payment.guildId !== interaction.guild.id) {
    return interaction.reply({ content: '⚠️ Paiement introuvable.', flags: MessageFlags.Ephemeral });
  }
  if (payment.status !== 'pending') {
    return interaction.reply({ content: `ℹ️ Paiement déjà **${payment.status}**.`, flags: MessageFlags.Ephemeral });
  }

  payment.status = 'approved';
  payment.handledBy = interaction.user.id;
  payment.handledAt = Date.now();
  addClientTotal(payment.guildId, payment.userId, payment.amount);
  save();

  const tierResult = await syncCustomerTier(interaction.guild, payment.userId, {
    reason: `Paiement #${payment.id} accepté`,
  });
  const total = getClientTotal(payment.guildId, payment.userId);
  const tierName = tierResult?.tier?.name || 'Customers';

  const cfg = paymentConfig(interaction.guild.id);
  const orderChannel = cfg.orderChannelId
    ? await interaction.guild.channels.fetch(cfg.orderChannelId).catch(() => null)
    : null;
  if (orderChannel) {
    await orderChannel.send({
      components: [paymentConfirmedContainer(payment, tierName, total)],
      flags: V2,
      allowedMentions: { users: [payment.userId] },
    });
  }

  payment.status = 'approved';
  await interaction.update({
    components: [container(0x2ecc71)
      .addTextDisplayComponents(text(`## Paiement #${payment.id} — accepté par <@${interaction.user.id}>`))
      .addTextDisplayComponents(text(fieldsText([
        { name: 'Client', value: `<@${payment.userId}>` },
        { name: 'Palier', value: tierName },
        { name: 'Total', value: `${total} ${config.currency}` },
      ])))],
    flags: V2,
  });

  interaction.client.users.fetch(payment.userId)
    .then((u) => u.send(
      `Ton paiement de **${payment.amount}${config.currency}** a été confirmé. `
      + `Palier actuel : **${tierName}**. Merci !`,
    ))
    .catch(() => {});

  log.event(interaction.guild, {
    level: 'success', scope: 'paiement', title: `✅ Paiement #${payment.id} accepté`,
    fields: [
      { name: 'Client', value: `<@${payment.userId}>`, inline: true },
      { name: 'Montant', value: `${payment.amount} ${config.currency}`, inline: true },
      { name: 'Palier', value: tierName, inline: true },
    ],
  });
}

/** Staff refuse un paiement. */
async function rejectPayment(interaction, id, reason = 'Non précisée') {
  if (!isStaff(interaction.member)) {
    return interaction.reply({ content: '❌ Réservé au staff.', flags: MessageFlags.Ephemeral });
  }
  const payment = db.payments?.[id];
  if (!payment || payment.guildId !== interaction.guild.id) {
    return interaction.reply({ content: '⚠️ Paiement introuvable.', flags: MessageFlags.Ephemeral });
  }
  if (payment.status !== 'pending') {
    return interaction.reply({ content: `ℹ️ Paiement déjà **${payment.status}**.`, flags: MessageFlags.Ephemeral });
  }

  payment.status = 'rejected';
  payment.handledBy = interaction.user.id;
  payment.rejectReason = reason;
  save();

  await interaction.update({
    components: [container(0xe74c3c)
      .addTextDisplayComponents(text(`## Paiement #${payment.id} — refusé`))
      .addTextDisplayComponents(text(`**Raison** — ${reason}`))],
    flags: V2,
  });

  interaction.client.users.fetch(payment.userId)
    .then((u) => u.send(`Ton paiement #${payment.id} n'a pas été validé.\n**Raison :** ${reason}`))
    .catch(() => {});
}

module.exports = {
  paymentConfig,
  paymentInfoContainer,
  paymentValidationContainer,
  createPaymentRequest,
  approvePayment,
  rejectPayment,
};
