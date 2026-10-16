const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { ensureAdmin } = require('../lib/adminGuard');
const school = require('../lib/school');

const data = new SlashCommandBuilder()
  .setName('school')
  .setDescription('31 School : catégorie privée et rôle dédié')
  .addSubcommand((s) => s.setName('setup').setDescription('Crée le rôle 31 School, la catégorie SCHOOL et ses salons'))
  .addSubcommand((s) => s.setName('donner').setDescription('Donne l\'accès 31 School à un membre')
    .addUserOption((o) => o.setName('membre').setDescription('Membre').setRequired(true)))
  .addSubcommand((s) => s.setName('retirer').setDescription('Retire l\'accès 31 School à un membre')
    .addUserOption((o) => o.setName('membre').setDescription('Membre').setRequired(true)));

async function execute(interaction) {
  if (!(await ensureAdmin(interaction))) return;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const sub = interaction.options.getSubcommand();

  if (sub === 'setup') {
    const { role, roleCreated, category, created, total } = await school.setup(interaction.guild);
    return interaction.editReply([
      `31 School en place : rôle <@&${role.id}>${roleCreated ? ' (créé)' : ''}, catégorie **${category.name}**.`,
      created.length
        ? `${created.length}/${total} salon(s) créé(s) : ${created.map((c) => `<#${c.id}>`).join(' ')}`
        : `Les ${total} salons existaient déjà : permissions remises à jour.`,
      'Seuls les membres avec le rôle voient la catégorie. Annonces, ressources, formation et features sont en lecture seule.',
    ].join('\n'));
  }

  const user = interaction.options.getUser('membre', true);
  const member = await interaction.guild.members.fetch(user.id).catch(() => null);
  if (!member) return interaction.editReply('Ce membre n\'est pas sur le serveur.');
  try {
    const roleId = await school.setMember(interaction.guild, member, sub === 'donner');
    return interaction.editReply(sub === 'donner'
      ? `Accès 31 School donné à <@${user.id}> (<@&${roleId}>).`
      : `Accès 31 School retiré à <@${user.id}>.`);
  } catch (err) {
    return interaction.editReply(err.message);
  }
}

module.exports = { data, execute };
