const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { ensureAdmin } = require('../lib/adminGuard');
const verification = require('../lib/verification');

const data = new SlashCommandBuilder()
  .setName('verif')
  .setDescription('Vérification des nouveaux membres (rôle Visiteur)')
  .addSubcommand((s) => s.setName('setup').setDescription('Crée le rôle Visiteur et #vérification, cache les autres salons, poste le panneau'));

async function execute(interaction) {
  if (!(await ensureAdmin(interaction))) return;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const { role, channel, hidden, failed } = await verification.setup(interaction.guild);
  return interaction.editReply([
    `Vérification en place : rôle <@&${role.id}>, salon <#${channel.id}>.`,
    `${hidden} salon(s) cachés aux visiteurs${failed ? `, ${failed} en échec (permissions du bot ?)` : ''}.`,
    'Les nouveaux arrivants reçoivent Visiteur. Les membres actuels ne sont pas touchés.',
  ].join('\n'));
}

module.exports = { data, execute };
