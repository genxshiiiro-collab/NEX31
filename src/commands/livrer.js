const {
  SlashCommandBuilder, AttachmentBuilder, MessageFlags,
} = require('discord.js');
const config = require('../../config');
const { db, save } = require('../storage');
const { isStaff } = require('../lib/helpers');
const { V2, container, text, separator, fieldsText, file } = require('../lib/components');
const { postSuiviInTicket, LAST_STEP } = require('./commande');
const log = require('../lib/logger');

const data = new SlashCommandBuilder()
  .setName('livrer')
  .setDescription('Livrer une commande au client (fichier ou lien)')
  .addIntegerOption((o) => o.setName('commande').setDescription('Numéro de la commande (#id)').setRequired(true).setMinValue(1))
  .addAttachmentOption((o) => o.setName('fichier').setDescription('Fichier final (logo, .psd, .zip...)'))
  .addStringOption((o) => o.setName('lien').setDescription('Lien de téléchargement (WeTransfer, Drive, Dropbox...)').setMaxLength(500))
  .addStringOption((o) => o.setName('message').setDescription('Message accompagnant la livraison').setMaxLength(500));

function isValidUrl(raw) {
  try {
    const u = new URL(raw);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function buildDeliveryContainer(order, interaction, note, { att, link }) {
  const c = container(0x2ecc71)
    .addTextDisplayComponents(text(`## 📦 Livraison — Commande #${order.id}`))
    .addTextDisplayComponents(text(`<@${order.clientId}>`))
    .addTextDisplayComponents(text(note ? `>>> ${note}` : 'Voici ta commande, merci pour ta confiance ! 🙌'))
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(text(fieldsText([
      { name: 'Prestation', value: order.prestation },
      { name: 'Livré par', value: `<@${interaction.user.id}>` },
    ])));

  if (att) {
    c.addFileComponents(file(att.name));
  } else if (link) {
    c.addTextDisplayComponents(text(`**Téléchargement** — ${link}`));
  }

  return c;
}

async function execute(interaction) {
  if (!isStaff(interaction.member)) {
    return interaction.reply({ content: '❌ Réservé au staff.', flags: MessageFlags.Ephemeral });
  }

  const id = interaction.options.getInteger('commande');
  const order = db.orders[id];
  if (!order || order.guildId !== interaction.guild.id) {
    return interaction.reply({ content: `⚠️ Commande **#${id}** introuvable sur ce serveur.`, flags: MessageFlags.Ephemeral });
  }

  const att = interaction.options.getAttachment('fichier');
  const linkRaw = interaction.options.getString('lien')?.trim() || '';
  const note = interaction.options.getString('message');

  if (!att && !linkRaw) {
    return interaction.reply({
      content: '⚠️ Indique un **fichier** ou un **lien** de livraison.',
      flags: MessageFlags.Ephemeral,
    });
  }
  if (att && linkRaw) {
    return interaction.reply({
      content: '⚠️ Choisis **fichier** ou **lien**, pas les deux en même temps.',
      flags: MessageFlags.Ephemeral,
    });
  }
  if (linkRaw && !isValidUrl(linkRaw)) {
    return interaction.reply({
      content: '⚠️ Le lien doit commencer par `http://` ou `https://`.',
      flags: MessageFlags.Ephemeral,
    });
  }

  order.step = LAST_STEP;
  order.cancelled = false;
  order.deliveredAt = Date.now();
  order.deliveredFile = att ? att.name : null;
  order.deliveredLink = linkRaw || null;
  save();

  const c = buildDeliveryContainer(order, interaction, note, { att, link: linkRaw });
  const payload = {
    components: [c],
    flags: V2,
    allowedMentions: { users: [order.clientId] },
  };
  if (att) {
    payload.files = [new AttachmentBuilder(att.url, { name: att.name })];
  }

  if (order.ticketChannelId) {
    const ticketCh = await interaction.guild.channels.fetch(order.ticketChannelId).catch(() => null);
    if (ticketCh) {
      await ticketCh.send(payload).catch((e) => log.error('livraison', 'Envoi livraison ticket impossible', e));
      await postSuiviInTicket(ticketCh, order, { replace: true });
    }
  } else {
    const orderChannelId = config.forGuild(interaction.guild.id).orderChannelId;
    const orderChannel = orderChannelId ? await interaction.guild.channels.fetch(orderChannelId).catch(() => null) : null;
    if (orderChannel) {
      await orderChannel.send(payload).catch((e) => log.error('livraison', 'Envoi livraison impossible', e));
    }
  }

  const livraisonLabel = att ? `\`${att.name}\`` : linkRaw;
  log.event(interaction.guild, {
    level: 'success', scope: 'livraison', title: `📦 Commande #${order.id} livrée`,
    fields: [
      { name: 'Client', value: `<@${order.clientId}>`, inline: true },
      { name: 'Livré par', value: `<@${interaction.user.id}>`, inline: true },
      { name: att ? 'Fichier' : 'Lien', value: livraisonLabel, inline: false },
    ],
  });

  const dmExtra = linkRaw ? `\nLien : ${linkRaw}` : '';
  interaction.client.users.fetch(order.clientId)
    .then((u) => u.send(
      `Ta commande **#${order.id}** (${order.prestation}) est livrée.${dmExtra} `
      + 'N\'hésite pas à laisser un avis avec **/avis**.',
    ))
    .catch(() => {});

  const replyDetail = att ? `fichier \`${att.name}\`` : `lien ${linkRaw}`;
  return interaction.reply({
    content: `✅ Commande **#${order.id}** livrée à <@${order.clientId}> avec ${replyDetail}.`,
    flags: MessageFlags.Ephemeral,
  });
}

module.exports = { data, execute };
