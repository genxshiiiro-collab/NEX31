const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { studio } = require('../config/packs');
const { ensureAdmin } = require('../lib/adminGuard');
const { V2, container, text, separator } = require('../lib/components');
const log = require('../lib/logger');

const data = new SlashCommandBuilder()
  .setName('studioprices')
  .setDescription('Afficher les prix des packs Studio (administrateurs)')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

async function execute(interaction) {
  if (!(await ensureAdmin(interaction))) return;
  try {
    const c = container(studio.color)
      .addTextDisplayComponents(text('## Tarifs des packs Studio'));

    for (const key of studio.order) {
      const p = studio.items[key];
      c.addSeparatorComponents(separator())
        .addTextDisplayComponents(text(
          `**${p.name}** — ${p.price}\n-# Livraison : ${p.delivery}`,
        ));
    }

    return interaction.reply({
      components: [c],
      flags: MessageFlags.Ephemeral | V2,
      allowedMentions: { parse: [] },
    });
  } catch (err) {
    log.error('studioprices', "Erreur d'exécution", err);
    const payload = { content: "Une erreur est survenue pendant l'exécution de la commande.", flags: MessageFlags.Ephemeral };
    if (interaction.deferred || interaction.replied) return interaction.followUp(payload).catch(() => {});
    return interaction.reply(payload).catch(() => {});
  }
}

module.exports = { data, execute };
