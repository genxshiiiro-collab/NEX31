const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { stars } = require('../lib/helpers');
const { V2, container, text } = require('../lib/components');
const { getApprovedReviews, averageNote } = require('../lib/reviewStats');

const data = new SlashCommandBuilder()
  .setName('stats')
  .setDescription('Note moyenne des avis du serveur');

async function execute(interaction) {
  const approved = getApprovedReviews(interaction.guild.id);
  const avg = averageNote(approved);

  const noteLine = approved.length
    ? `${stars(Math.round(avg))} ${avg.toFixed(2)}/5 (${approved.length} avis)`
    : 'Aucun avis';

  const c = container()
    .addTextDisplayComponents(text('## Statistiques'))
    .addTextDisplayComponents(text(`**Note moyenne** — ${noteLine}`));

  return interaction.reply({ components: [c], flags: MessageFlags.Ephemeral | V2, allowedMentions: { parse: [] } });
}

module.exports = { data, execute };
