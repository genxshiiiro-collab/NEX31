const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { ensureAdmin } = require('../lib/adminGuard');
const lockdown = require('../lib/lockdown');
const { securityAlert } = require('../lib/alert');

const data = new SlashCommandBuilder()
  .setName('lockdown')
  .setDescription('Verrouiller / déverrouiller tout le serveur')
  .addSubcommand((s) => s.setName('on').setDescription('Plus personne ne peut écrire ni rejoindre')
    .addStringOption((o) => o.setName('raison').setDescription('Raison')))
  .addSubcommand((s) => s.setName('off').setDescription('Remet le serveur comme avant le verrouillage'));

async function execute(interaction) {
  if (!(await ensureAdmin(interaction))) return;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const { guild, user } = interaction;

  if (interaction.options.getSubcommand() === 'on') {
    const reason = interaction.options.getString('raison') || `Manuel par ${user.tag}`;
    const res = await lockdown.lock(guild, reason);
    if (res.already) return interaction.editReply('Le serveur est déjà verrouillé. `/lockdown off` pour le rouvrir.');
    await securityAlert(guild, { level: 'warn', title: 'Serveur verrouillé', description: `Par <@${user.id}> — ${reason}` });
    return interaction.editReply(`Serveur verrouillé (${res.channels} salons, invitations coupées). \`/lockdown off\` pour rouvrir.`);
  }

  const res = await lockdown.unlock(guild, user.tag);
  if (res.notLocked) return interaction.editReply("Le serveur n'est pas verrouillé.");
  await securityAlert(guild, { level: 'warn', title: 'Serveur déverrouillé', description: `Par <@${user.id}>` });
  return interaction.editReply(`Serveur déverrouillé, permissions d'origine restaurées sur ${res.channels} salons.`);
}

module.exports = { data, execute };
