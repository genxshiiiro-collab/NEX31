const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { db, save, isBlacklisted } = require('../storage');
const { isStaff } = require('../lib/helpers');
const { V2, container, text, separator } = require('../lib/components');
const log = require('../lib/logger');

const data = new SlashCommandBuilder()
  .setName('blacklist')
  .setDescription('Gérer les clients bloqués (avis + tickets)')
  .addSubcommand((s) => s.setName('add').setDescription('Bloquer un utilisateur')
    .addUserOption((o) => o.setName('utilisateur').setDescription('Personne à bloquer').setRequired(true)))
  .addSubcommand((s) => s.setName('remove').setDescription('Débloquer un utilisateur')
    .addUserOption((o) => o.setName('utilisateur').setDescription('Personne à débloquer').setRequired(true)))
  .addSubcommand((s) => s.setName('list').setDescription('Voir la liste des bloqués'));

async function execute(interaction) {
  if (!isStaff(interaction.member)) {
    return interaction.reply({ content: '❌ Réservé au staff.', flags: MessageFlags.Ephemeral });
  }
  const gid = interaction.guild.id;
  if (!db.blacklist[gid]) db.blacklist[gid] = [];
  const sub = interaction.options.getSubcommand();

  if (sub === 'add') {
    const user = interaction.options.getUser('utilisateur');
    if (isBlacklisted(gid, user.id)) {
      return interaction.reply({ content: `ℹ️ <@${user.id}> est déjà blacklisté.`, flags: MessageFlags.Ephemeral });
    }
    db.blacklist[gid].push(user.id);
    save();
    log.event(interaction.guild, {
      level: 'warn', scope: 'blacklist', title: '🚫 Utilisateur blacklisté',
      fields: [
        { name: 'Utilisateur', value: `<@${user.id}>`, inline: true },
        { name: 'Par', value: `<@${interaction.user.id}>`, inline: true },
      ],
    });
    return interaction.reply({ content: `🚫 <@${user.id}> a été **blacklisté** (ne peut plus ouvrir de ticket ni laisser d'avis).`, flags: MessageFlags.Ephemeral });
  }

  if (sub === 'remove') {
    const user = interaction.options.getUser('utilisateur');
    db.blacklist[gid] = db.blacklist[gid].filter((id) => id !== user.id);
    save();
    log.event(interaction.guild, {
      level: 'info', scope: 'blacklist', title: '✅ Utilisateur débloqué',
      fields: [
        { name: 'Utilisateur', value: `<@${user.id}>`, inline: true },
        { name: 'Par', value: `<@${interaction.user.id}>`, inline: true },
      ],
    });
    return interaction.reply({ content: `✅ <@${user.id}> a été **débloqué**.`, flags: MessageFlags.Ephemeral });
  }

  // list
  const ids = db.blacklist[gid];
  const c = container()
    .addTextDisplayComponents(text('## 🚫 Clients bloqués'))
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(text(ids.length ? ids.map((id) => `<@${id}>`).join('\n') : 'Aucun.'));
  return interaction.reply({ components: [c], flags: MessageFlags.Ephemeral | V2, allowedMentions: { parse: [] } });
}

module.exports = { data, execute };
