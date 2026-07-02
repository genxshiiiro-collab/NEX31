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
  .setDescription('Livrer une commande au client avec le fichier final')
  .addIntegerOption((o) => o.setName('commande').setDescription('Numéro de la commande (#id)').setRequired(true).setMinValue(1))
  .addAttachmentOption((o) => o.setName('fichier').setDescription('Le fichier à livrer (logo, .psd, .zip...)').setRequired(true))
  .addStringOption((o) => o.setName('message').setDescription('Message accompagnant la livraison').setMaxLength(500));

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
  const note = interaction.options.getString('message');

  // Marque la commande comme livrée (étape 4/4).
  order.step = LAST_STEP;
  order.cancelled = false;
  order.deliveredAt = Date.now();
  order.deliveredFile = att.name;
  save();

  const attachment = new AttachmentBuilder(att.url, { name: att.name });

  const c = container(0x2ecc71)
    .addTextDisplayComponents(text(`## 📦 Livraison — Commande #${order.id}`))
    .addTextDisplayComponents(text(`<@${order.clientId}>`))
    .addTextDisplayComponents(text(note ? `>>> ${note}` : 'Voici ta commande, merci pour ta confiance ! 🙌'))
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(text(fieldsText([
      { name: 'Prestation', value: order.prestation },
      { name: 'Livré par', value: `<@${interaction.user.id}>` },
    ])))
    .addFileComponents(file(att.name));

  if (order.ticketChannelId) {
    const ticketCh = await interaction.guild.channels.fetch(order.ticketChannelId).catch(() => null);
    if (ticketCh) {
      await ticketCh.send({
        components: [c], files: [attachment], flags: V2,
        allowedMentions: { users: [order.clientId] },
      }).catch((e) => log.error('livraison', 'Envoi livraison ticket impossible', e));
      await postSuiviInTicket(ticketCh, order, { replace: true });
    }
  } else {
    const orderChannelId = config.forGuild(interaction.guild.id).orderChannelId;
    const orderChannel = orderChannelId ? await interaction.guild.channels.fetch(orderChannelId).catch(() => null) : null;
    if (orderChannel) {
      await orderChannel.send({
        components: [c], files: [attachment], flags: V2,
        allowedMentions: { users: [order.clientId] },
      }).catch((e) => log.error('livraison', 'Envoi livraison impossible', e));
    }
  }

  log.event(interaction.guild, {
    level: 'success', scope: 'livraison', title: `📦 Commande #${order.id} livrée`,
    fields: [
      { name: 'Client', value: `<@${order.clientId}>`, inline: true },
      { name: 'Livré par', value: `<@${interaction.user.id}>`, inline: true },
      { name: 'Fichier', value: `\`${att.name}\``, inline: true },
    ],
  });

  // 2) Notifie le client en MP (sans le fichier : il est déjà dans le salon commandes).
  interaction.client.users.fetch(order.clientId)
    .then((u) => u.send(
      `Ta commande **#${order.id}** (${order.prestation}) est livrée. `
      + 'N\'hésite pas à laisser un avis avec **/avis**.',
    ))
    .catch(() => {});

  return interaction.reply({ content: `✅ Commande **#${order.id}** livrée à <@${order.clientId}> avec le fichier \`${att.name}\`.`, flags: MessageFlags.Ephemeral });
}

module.exports = { data, execute };
