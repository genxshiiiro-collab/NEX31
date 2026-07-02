const {
  SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags,
} = require('discord.js');
const config = require('../../config');
const { db, nextId, save } = require('../storage');
const { isStaff, isTicketChannel } = require('../lib/helpers');
const { V2, container, text, separator, fieldsText } = require('../lib/components');
const log = require('../lib/logger');
const { addClientTotal, syncCustomerTier } = require('../lib/customerTiers');

// --- Les 4 étapes d'une commande (dans l'ordre) ---------------------
const STEPS = [
  { key: 'recue', label: 'Commande reçue', emoji: '📥' },
  { key: 'cours', label: 'En cours de création', emoji: '🎨' },
  { key: 'revision', label: 'En révision', emoji: '🔍' },
  { key: 'livree', label: 'Livrée', emoji: '✅' },
];
const LAST_STEP = STEPS.length - 1;

function progressBar(step) {
  return STEPS.map((_, i) => (i <= step ? '🟩' : '⬜')).join('');
}

/** Conteneur V2 de suivi (lecture seule — visible par le client). */
function orderContainer(order) {
  const color = order.cancelled ? 0xe74c3c : (order.step === LAST_STEP ? 0x2ecc71 : config.brandColor);
  const c = container(color);

  if (order.cancelled) {
    c.addTextDisplayComponents(text(`## Commande #${order.id} — Annulée`))
      .addTextDisplayComponents(text('Cette commande a été annulée.'));
  } else {
    const cur = STEPS[order.step];
    const checklist = STEPS.map((s, i) => {
      if (i < order.step) return `✅ ~~${s.label}~~`;
      if (i === order.step) return `${s.emoji} **${s.label}**  ← étape actuelle`;
      return `⬜ ${s.label}`;
    }).join('\n');
    c.addTextDisplayComponents(text(`## Suivi commande #${order.id} — ${cur.label}`))
      .addTextDisplayComponents(text(`${progressBar(order.step)}  **Étape ${order.step + 1}/4**\n\n${checklist}`));
  }

  c.addSeparatorComponents(separator())
    .addTextDisplayComponents(text(fieldsText([
      { name: 'Client', value: `<@${order.clientId}>` },
      { name: 'Graphiste', value: order.graphisteId ? `<@${order.graphisteId}>` : '—' },
      { name: 'Prix', value: `${order.prix} ${config.currency}` },
      { name: 'Prestation', value: order.prestation },
    ])))
    .addTextDisplayComponents(text('-# Suivi mis à jour par le staff'));

  return c;
}

/** Boutons staff (seul le staff peut interagir — vérifié dans interactionCreate). */
function orderStaffComponents(order) {
  if (order.cancelled) {
    return [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`order:step:${order.id}:prev`)
        .setLabel('Réactiver').setStyle(ButtonStyle.Secondary),
    )];
  }
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`order:step:${order.id}:prev`)
      .setLabel('Étape précédente').setStyle(ButtonStyle.Secondary)
      .setDisabled(order.step === 0),
    new ButtonBuilder().setCustomId(`order:step:${order.id}:next`)
      .setLabel('Étape suivante').setStyle(ButtonStyle.Success)
      .setDisabled(order.step === LAST_STEP),
    new ButtonBuilder().setCustomId(`order:step:${order.id}:cancel`)
      .setLabel('Annuler').setStyle(ButtonStyle.Danger),
  )];
}

/** Alias exporté pour compatibilité. */
const orderComponents = orderStaffComponents;

async function ensureCustomerRole(guild, userId, prix = 0) {
  try {
    if (prix > 0) addClientTotal(guild.id, userId, prix);
    await syncCustomerTier(guild, userId, { reason: 'Commande enregistrée' });
  } catch (err) {
    log.warn('commande', 'Impossible de mettre à jour le palier client', { detail: err.message });
  }
}

/** Trouve la commande liée à un salon ticket. */
function orderForTicket(channelId) {
  return Object.values(db.orders).find((o) => o.ticketChannelId === channelId) || null;
}

/** Publie ou met à jour le suivi dans le salon ticket. */
async function postSuiviInTicket(channel, order, { replace = true } = {}) {
  if (replace && order.trackMsgId) {
    await channel.messages.delete(order.trackMsgId).catch(() => {});
  }

  const msg = await channel.send({
    components: [orderContainer(order), ...orderStaffComponents(order)],
    flags: V2,
    allowedMentions: { parse: [] },
  }).catch((err) => {
    log.error('suivi', 'Publication suivi ticket impossible', err);
    return null;
  });

  if (msg) {
    order.trackMsgId = msg.id;
    order.trackChannelId = channel.id;
    order.ticketChannelId = channel.id;
    save();
  }
  return msg;
}

/** Met à jour le message de suivi existant (sans reposter). */
async function updateSuiviMessage(interaction, order) {
  await interaction.update({
    components: [orderContainer(order), ...orderStaffComponents(order)],
    flags: V2,
    allowedMentions: { parse: [] },
  });
  order.trackMsgId = interaction.message.id;
  order.trackChannelId = interaction.message.channelId;
  save();
}

/** Crée une commande en base (sans poster de suivi automatique). */
async function createOrder(guild, { clientId, clientTag, prestation, prix, graphisteId, ticketChannelId = null }) {
  const id = nextId('order');
  const order = {
    id, guildId: guild.id, clientId, clientTag, prestation, prix,
    graphisteId: graphisteId || null, step: 0, cancelled: false, createdAt: Date.now(),
    trackMsgId: null, trackChannelId: null, ticketChannelId,
  };
  db.orders[id] = order;
  save();

  await ensureCustomerRole(guild, clientId, prix);

  log.event(guild, {
    level: 'success', scope: 'commande', title: `Commande #${id} créée`,
    fields: [
      { name: 'Client', value: `<@${clientId}>`, inline: true },
      { name: 'Prix', value: `${prix} ${config.currency}`, inline: true },
      { name: 'Prestation', value: prestation, inline: false },
    ],
  });
  return order;
}

const data = new SlashCommandBuilder()
  .setName('commande')
  .setDescription('Gérer les commandes graphistes')
  .addSubcommand((s) =>
    s.setName('creer').setDescription('Créer une commande')
      .addUserOption((o) => o.setName('client').setDescription('Le client').setRequired(true))
      .addStringOption((o) => o.setName('prestation').setDescription('Ce qui est commandé').setRequired(true).setMaxLength(200))
      .addNumberOption((o) => o.setName('prix').setDescription('Prix').setRequired(true).setMinValue(0))
      .addUserOption((o) => o.setName('graphiste').setDescription('Graphiste assigné')))
  .addSubcommand((s) =>
    s.setName('liste').setDescription('Lister les commandes')
      .addUserOption((o) => o.setName('client').setDescription('Filtrer par client')));

async function execute(interaction) {
  if (!isStaff(interaction.member)) {
    return interaction.reply({ content: '❌ Réservé au staff.', flags: MessageFlags.Ephemeral });
  }
  const sub = interaction.options.getSubcommand();

  if (sub === 'creer') {
    const client = interaction.options.getUser('client');
    const order = await createOrder(interaction.guild, {
      clientId: client.id,
      clientTag: client.tag,
      prestation: interaction.options.getString('prestation'),
      prix: interaction.options.getNumber('prix'),
      graphisteId: interaction.options.getUser('graphiste')?.id || null,
    });
    return interaction.reply({
      content: `✅ Commande **#${order.id}** créée. Utilise **/setsuivi** pour afficher le suivi.`,
      flags: MessageFlags.Ephemeral,
    });
  }

  if (sub === 'liste') {
    const client = interaction.options.getUser('client');
    let orders = Object.values(db.orders).filter((o) => o.guildId === interaction.guild.id);
    if (client) orders = orders.filter((o) => o.clientId === client.id);
    orders.sort((a, b) => b.id - a.id);

    if (orders.length === 0) {
      return interaction.reply({ content: 'Aucune commande.', flags: MessageFlags.Ephemeral });
    }
    const lines = orders.slice(0, 25).map((o) => {
      const tag = o.cancelled ? 'Annulée' : `${STEPS[o.step].label} (${o.step + 1}/4)`;
      return `\`#${o.id}\` ${tag} — <@${o.clientId}> · ${o.prestation} · ${o.prix}${config.currency}`;
    });
    const c = container()
      .addTextDisplayComponents(text('## Commandes'))
      .addSeparatorComponents(separator())
      .addTextDisplayComponents(text(lines.join('\n')));
    return interaction.reply({ components: [c], flags: MessageFlags.Ephemeral | V2, allowedMentions: { parse: [] } });
  }
}

module.exports = {
  data, execute, createOrder, orderContainer, orderStaffComponents, orderComponents,
  postSuiviInTicket, updateSuiviMessage, orderForTicket, STEPS, LAST_STEP,
};
