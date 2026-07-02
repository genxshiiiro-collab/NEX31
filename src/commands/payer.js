const {
  SlashCommandBuilder, MessageFlags,
} = require('discord.js');
const { V2 } = require('../lib/components');
const { paymentInfoContainer, paymentConfig, createPaymentRequest } = require('../lib/payments');

const data = new SlashCommandBuilder()
  .setName('payer')
  .setDescription('Informations de paiement et déclaration')
  .addSubcommand((s) => s.setName('info').setDescription('Voir PayPal et Revolut'))
  .addSubcommand((s) =>
    s.setName('declarer').setDescription('Déclarer un paiement effectué (après envoi)')
      .addNumberOption((o) => o.setName('montant').setDescription('Montant payé').setRequired(true).setMinValue(0.01))
      .addStringOption((o) =>
        o.setName('methode').setDescription('Moyen de paiement').setRequired(true)
          .addChoices(
            { name: 'PayPal', value: 'paypal' },
            { name: 'Revolut', value: 'revolut' },
          ))
      .addAttachmentOption((o) =>
        o.setName('preuve').setDescription('Capture / reçu de paiement (image ou PDF)').setRequired(true))
      .addStringOption((o) => o.setName('note').setDescription('Référence ou précision (optionnel)').setMaxLength(200)));

async function execute(interaction) {
  const sub = interaction.options.getSubcommand();
  const cfg = paymentConfig(interaction.guild.id);

  if (sub === 'info') {
    if (!cfg.paypal && !cfg.revolut) {
      return interaction.reply({
        content: '⚠️ Paiements non configurés sur ce serveur.',
        flags: MessageFlags.Ephemeral,
      });
    }
    return interaction.reply({
      components: [paymentInfoContainer(interaction.guild.id)],
      flags: MessageFlags.Ephemeral | V2,
    });
  }

  if (sub === 'declarer') {
    if (!cfg.validationChannelId) {
      return interaction.reply({
        content: '⚠️ Salon de validation des paiements introuvable. Préviens un admin.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const amount = interaction.options.getNumber('montant');
    const method = interaction.options.getString('methode');
    const note = interaction.options.getString('note') || '';
    const preuve = interaction.options.getAttachment('preuve');

    const allowed = ['image/', 'application/pdf'];
    if (!allowed.some((t) => preuve.contentType?.startsWith(t))) {
      return interaction.reply({
        content: '⚠️ La preuve doit être une **image** ou un **PDF**.',
        flags: MessageFlags.Ephemeral,
      });
    }

    await createPaymentRequest(interaction.guild, interaction.user, {
      amount, method, note, proofAttachment: preuve,
    });

    return interaction.reply({
      content: `✅ Paiement de **${amount}€** (${method === 'revolut' ? 'Revolut' : 'PayPal'}) déclaré. `
        + 'Le staff va vérifier et tu seras notifié une fois confirmé.',
      flags: MessageFlags.Ephemeral,
    });
  }
}

module.exports = { data, execute };
