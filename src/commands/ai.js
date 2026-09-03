const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { ensureAdmin } = require('../lib/adminGuard');
const { isAiEnabled, setAiEnabled } = require('../lib/aiSupport');
const config = require('../../config');
const log = require('../lib/logger');

const data = new SlashCommandBuilder()
  .setName('ai')
  .setDescription('Support IA : réponses autonomes dans les tickets (administrateurs)')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand((s) => s.setName('on').setDescription("Activer l'IA sur ce serveur"))
  .addSubcommand((s) => s.setName('off').setDescription("Désactiver l'IA sur ce serveur"))
  .addSubcommand((s) => s.setName('status').setDescription("État de l'IA sur ce serveur"));

async function execute(interaction) {
  if (!(await ensureAdmin(interaction))) return;
  try {
    const sub = interaction.options.getSubcommand();
    const gid = interaction.guild.id;

    if (sub === 'on' || sub === 'off') {
      setAiEnabled(gid, sub === 'on');
      return interaction.reply({
        content: sub === 'on'
          ? '✅ IA activée : elle répondra dans les tickets non pris en charge.'
          : '⏸️ IA désactivée sur ce serveur.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const enabled = isAiEnabled(gid);
    const hasKey = !!process.env.OPENAI_API_KEY;
    const lines = [
      `**Support IA** — ${enabled ? '🟢 activé' : '🔴 désactivé'}`,
      `-# Clé OpenAI : ${hasKey ? '✅ présente' : '❌ manquante (OPENAI_API_KEY dans .env)'}`,
      `-# Modèle : ${config.ai?.model || 'gpt-4o-mini'}`,
      `-# Répond aux tickets non pris en charge ; se tait après un claim staff.`,
    ];
    if (enabled && !hasKey) lines.push('⚠️ Activé mais sans clé : aucune réponse ne sera générée.');
    return interaction.reply({ content: lines.join('\n'), flags: MessageFlags.Ephemeral });
  } catch (err) {
    log.error('ai', "Erreur d'exécution", err);
    const payload = { content: "Une erreur est survenue pendant l'exécution de la commande.", flags: MessageFlags.Ephemeral };
    if (interaction.deferred || interaction.replied) return interaction.followUp(payload).catch(() => {});
    return interaction.reply(payload).catch(() => {});
  }
}

module.exports = { data, execute };
