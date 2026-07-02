const {
  SlashCommandBuilder, MessageFlags,
} = require('discord.js');
const { db, save } = require('../storage');
const { isStaff } = require('../lib/helpers');
const {
  createOrder, orderForTicket, postSuiviInTicket, STEPS,
} = require('./commande');

const data = new SlashCommandBuilder()
  .setName('setsuivi')
  .setDescription('Publier le suivi de commande dans ce salon (staff)')
  .addUserOption((o) =>
    o.setName('client').setDescription('Client (obligatoire si nouveau suivi hors ticket)'))
  .addStringOption((o) =>
    o.setName('prestation').setDescription('Prestation (obligatoire si nouveau suivi)').setMaxLength(200))
  .addNumberOption((o) =>
    o.setName('prix').setDescription('Prix (obligatoire si nouveau suivi)').setMinValue(0))
  .addUserOption((o) =>
    o.setName('graphiste').setDescription('Graphiste assigné'))
  .addIntegerOption((o) =>
    o.setName('commande').setDescription('Numéro d\'une commande existante (#id)').setMinValue(1));

async function execute(interaction) {
  if (!isStaff(interaction.member)) {
    return interaction.reply({ content: '❌ Réservé au staff.', flags: MessageFlags.Ephemeral });
  }

  const channel = interaction.channel;
  const ticketMeta = db.tickets[channel.id];
  const existing = orderForTicket(channel.id);

  const orderId = interaction.options.getInteger('commande');
  const clientUser = interaction.options.getUser('client');
  const prestation = interaction.options.getString('prestation');
  const prix = interaction.options.getNumber('prix');
  const graphiste = interaction.options.getUser('graphiste');

  let order = existing;

  if (orderId) {
    order = db.orders[orderId];
    if (!order || order.guildId !== interaction.guild.id) {
      return interaction.reply({ content: `⚠️ Commande **#${orderId}** introuvable.`, flags: MessageFlags.Ephemeral });
    }
    order.ticketChannelId = channel.id;
    if (prestation) order.prestation = prestation;
    if (prix != null) order.prix = prix;
    if (graphiste) order.graphisteId = graphiste.id;
    save();
  } else if (!order) {
    const clientId = clientUser?.id || ticketMeta?.ownerId;
    if (!clientId) {
      return interaction.reply({
        content: '⚠️ Indique le **client** (ou utilise la commande dans un ticket ouvert).',
        flags: MessageFlags.Ephemeral,
      });
    }
    if (!prestation || prix == null) {
      return interaction.reply({
        content: '⚠️ Pour un **nouveau** suivi, indique `prestation` et `prix`.',
        flags: MessageFlags.Ephemeral,
      });
    }
    const client = clientUser || await interaction.client.users.fetch(clientId).catch(() => null);
    order = await createOrder(interaction.guild, {
      clientId,
      clientTag: client?.tag || ticketMeta?.ownerName || 'Client',
      prestation,
      prix,
      graphisteId: graphiste?.id || null,
      ticketChannelId: channel.id,
    });
  } else {
    if (prestation) order.prestation = prestation;
    if (prix != null) order.prix = prix;
    if (graphiste) order.graphisteId = graphiste.id;
    save();
  }

  await postSuiviInTicket(channel, order, { replace: true });

  const stepLabel = order.cancelled ? 'Annulée' : STEPS[order.step].label;
  return interaction.reply({
    content: `✅ Suivi **#${order.id}** publié dans ${channel} (${stepLabel}). Seul le staff peut modifier les étapes.`,
    flags: MessageFlags.Ephemeral,
  });
}

module.exports = { data, execute };
