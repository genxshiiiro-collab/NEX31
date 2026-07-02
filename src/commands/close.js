const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { closeTicket } = require('../lib/tickets');
const { isStaff } = require('../lib/helpers');

const data = new SlashCommandBuilder()
  .setName('close')
  .setDescription('Fermer le ticket courant (réservé au staff)')
  .addStringOption((o) => o.setName('raison').setDescription('Raison de fermeture').setMaxLength(200));

async function execute(interaction) {
  if (!isStaff(interaction.member)) {
    return interaction.reply({ content: '❌ Réservé au staff.', flags: MessageFlags.Ephemeral });
  }
  const raison = interaction.options.getString('raison') || 'Non précisée';
  return closeTicket(interaction, raison);
}

module.exports = { data, execute };
