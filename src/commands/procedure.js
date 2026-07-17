const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const config = require('../../config');
const { V2, container, text, separator } = require('../lib/components');

// Commande réservée au serveur ThirtyOne (procédure propre à ce graphiste).
const THIRTYONE_GUILD = '1486375983434174516';

/** Message explicatif "Comment se passe une commande" (Components V2, public). */
function procedureContainer(guildId) {
  const cfg = config.forGuild(guildId);
  const reviews = cfg.reviewPublicChannelId ? `<#${cfg.reviewPublicChannelId}>` : 'le salon des avis';

  return container()
    .addTextDisplayComponents(text('## Comment se passe une commande'))
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(text(
      'Je travaille en **paiement avant prestation**. '
      + "C'est simple, clair, et ça nous protège tous les deux.",
    ))
    .addTextDisplayComponents(text(
      `Si tu as la moindre crainte, tu peux consulter les **avis de mes clients** dans ${reviews} `
      + 'avant de te lancer.',
    ))
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(text('**Pour régler ta commande, deux commandes :**'))
    .addTextDisplayComponents(text(
      '- `/payer info` — mes moyens de paiement (PayPal / Revolut)\n'
      + '- `/payer declarer` — déclare ton paiement en joignant la **capture** comme preuve',
    ))
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(text(
      'Une fois ton paiement **déclaré et vérifié**, on est couverts tous les deux '
      + 'et je lance ta commande. Merci de ta confiance.',
    ));
}

const data = new SlashCommandBuilder()
  .setName('procedure')
  .setDescription('Explique la procédure de commande (paiement avant prestation)');

async function execute(interaction) {
  if (interaction.guild?.id !== THIRTYONE_GUILD) {
    return interaction.reply({
      content: 'ℹ️ Cette commande est propre au serveur ThirtyOne.',
      flags: MessageFlags.Ephemeral,
    });
  }

  // Message public : visible par tout le monde ayant accès au salon (le ticket).
  return interaction.reply({
    components: [procedureContainer(interaction.guild.id)],
    flags: V2,
    allowedMentions: { parse: [] },
  });
}

module.exports = { data, execute, procedureContainer };
