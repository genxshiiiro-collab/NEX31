const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { studio, DELIVERY_NOTE } = require('../config/packs');
const { ensureAdmin } = require('../lib/adminGuard');
const { V2, container, text, separator } = require('../lib/components');
const { buildContentBlocks } = require('../lib/packContent');
const log = require('../lib/logger');

const data = new SlashCommandBuilder()
  .setName('studiocontent')
  .setDescription('Afficher le contenu détaillé des packs Studio (administrateurs)')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

async function execute(interaction) {
  if (!(await ensureAdmin(interaction))) return;
  try {
    const c = container(studio.color)
      .addTextDisplayComponents(text('## Contenu des packs Studio'));
    for (const block of buildContentBlocks(studio)) {
      c.addSeparatorComponents(separator()).addTextDisplayComponents(text(block));
    }
    c.addSeparatorComponents(separator()).addTextDisplayComponents(text(`-# ${DELIVERY_NOTE}`));
    return interaction.reply({
      components: [c],
      flags: MessageFlags.Ephemeral | V2,
      allowedMentions: { parse: [] },
    });
  } catch (err) {
    log.error('studiocontent', "Erreur d'exécution", err);
    const payload = { content: "Une erreur est survenue pendant l'exécution de la commande.", flags: MessageFlags.Ephemeral };
    if (interaction.deferred || interaction.replied) return interaction.followUp(payload).catch(() => {});
    return interaction.reply(payload).catch(() => {});
  }
}

module.exports = { data, execute };
