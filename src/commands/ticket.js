const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const config = require('../../config');
const { db, save } = require('../storage');
const { isStaff, isTicketChannel, slugifyName } = require('../lib/helpers');
const { syncFromMeta } = require('../lib/ticketPastille');
const log = require('../lib/logger');

const data = new SlashCommandBuilder()
  .setName('ticket')
  .setDescription('Outils de gestion du ticket courant')
  .addSubcommand((s) => s.setName('add').setDescription('Ajouter un membre au ticket')
    .addUserOption((o) => o.setName('membre').setDescription('Membre à ajouter').setRequired(true)))
  .addSubcommand((s) => s.setName('remove').setDescription('Retirer un membre du ticket')
    .addUserOption((o) => o.setName('membre').setDescription('Membre à retirer').setRequired(true)))
  .addSubcommand((s) => s.setName('renommer').setDescription('Renommer le ticket (garde la pastille)')
    .addStringOption((o) => o.setName('nom').setDescription('Nouveau nom').setRequired(true).setMaxLength(80)));

async function execute(interaction) {
  if (!isStaff(interaction.member)) {
    return interaction.reply({ content: '❌ Réservé au staff.', flags: MessageFlags.Ephemeral });
  }
  if (!isTicketChannel(interaction.channel)) {
    return interaction.reply({ content: '❌ À utiliser dans un salon de ticket.', flags: MessageFlags.Ephemeral });
  }
  const sub = interaction.options.getSubcommand();

  if (sub === 'add' || sub === 'remove') {
    const member = interaction.options.getUser('membre');
    try {
      if (sub === 'add') {
        await interaction.channel.permissionOverwrites.edit(member.id, {
          ViewChannel: true, SendMessages: true, ReadMessageHistory: true, AttachFiles: true,
        });
        log.event(interaction.guild, {
          level: 'info', scope: 'ticket', title: '➕ Membre ajouté au ticket',
          fields: [
            { name: 'Salon', value: `${interaction.channel}`, inline: true },
            { name: 'Membre', value: `<@${member.id}>`, inline: true },
            { name: 'Par', value: `<@${interaction.user.id}>`, inline: true },
          ],
        });
        return interaction.reply({ content: `✅ <@${member.id}> a été ajouté au ticket.` });
      }
      await interaction.channel.permissionOverwrites.delete(member.id, 'Retiré du ticket');
      log.event(interaction.guild, {
        level: 'info', scope: 'ticket', title: '➖ Membre retiré du ticket',
        fields: [
          { name: 'Salon', value: `${interaction.channel}`, inline: true },
          { name: 'Membre', value: `<@${member.id}>`, inline: true },
          { name: 'Par', value: `<@${interaction.user.id}>`, inline: true },
        ],
      });
      return interaction.reply({ content: `✅ <@${member.id}> a été retiré du ticket.` });
    } catch (err) {
      return interaction.reply({ content: `⚠️ Action impossible : ${err.message}`, flags: MessageFlags.Ephemeral });
    }
  }

  if (sub === 'renommer') {
    const nom = interaction.options.getString('nom');
    const meta = db.tickets[interaction.channel.id];
    if (meta) {
      meta.ownerName = nom;
      meta.nameSlug = slugifyName(nom);
      save();
      if (config.pastillesEnabled !== false) {
        syncFromMeta(interaction.channel, meta).catch(() => {});
      } else {
        await interaction.channel.setName(slugifyName(nom)).catch(() => {});
      }
      return interaction.reply({ content: `✅ Ticket renommé.`, flags: MessageFlags.Ephemeral });
    }
    return interaction.reply({ content: '⚠️ Métadonnées du ticket introuvables.', flags: MessageFlags.Ephemeral });
  }
}

module.exports = { data, execute };
