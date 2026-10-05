const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { ensureAdmin } = require('../lib/adminGuard');
const backup = require('../lib/backup');
const { securityAlert } = require('../lib/alert');

const data = new SlashCommandBuilder()
  .setName('backup')
  .setDescription('Sauvegarde des rôles, salons et permissions du serveur')
  .addSubcommand((s) => s.setName('create').setDescription('Faire une sauvegarde maintenant'))
  .addSubcommand((s) => s.setName('list').setDescription('Voir les sauvegardes disponibles'))
  .addSubcommand((s) => s.setName('restore').setDescription('Recréer ce qui manque depuis une sauvegarde (ne supprime rien)')
    .addStringOption((o) => o.setName('sauvegarde').setDescription('Date de la sauvegarde').setRequired(true).setAutocomplete(true)));

async function execute(interaction) {
  if (!(await ensureAdmin(interaction))) return;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const { guild } = interaction;
  const sub = interaction.options.getSubcommand();

  if (sub === 'create') {
    const r = await backup.snapshot(guild);
    return interaction.editReply(`Sauvegarde \`${r.file}\` : ${r.roles} rôles, ${r.channels} salons, rôles de ${r.members} membres.`);
  }
  if (sub === 'list') {
    const files = backup.list(guild.id);
    return interaction.editReply(files.length
      ? `Sauvegardes (une par jour, ${files.length} gardées) :\n${files.map((f) => `- \`${f}\``).join('\n')}`
      : 'Aucune sauvegarde. `/backup create` pour en faire une.');
  }

  const file = interaction.options.getString('sauvegarde');
  if (!backup.list(guild.id).includes(file)) return interaction.editReply('Sauvegarde introuvable.');
  const r = await backup.restore(guild, file);
  await securityAlert(guild, {
    level: 'warn',
    title: 'Sauvegarde restaurée',
    description: `\`${file}\` par <@${interaction.user.id}> : ${r.roles} rôles et ${r.channels} salons recréés, ${r.reassigned} rôles redonnés.`,
  });
  return interaction.editReply(`Restauration de \`${file}\` terminée : ${r.roles} rôles et ${r.channels} salons recréés, ${r.reassigned} rôles redonnés aux membres. Rien n'a été supprimé.`);
}

async function autocomplete(interaction) {
  const query = interaction.options.getFocused();
  return interaction.respond(backup.list(interaction.guild.id)
    .filter((f) => f.includes(query)).slice(0, 25).map((f) => ({ name: f, value: f })));
}

module.exports = { data, execute, autocomplete };
