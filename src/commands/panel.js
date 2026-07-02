const {
  SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags,
} = require('discord.js');
const { db, save } = require('../storage');
const { isStaff } = require('../lib/helpers');
const { V2, container, text, separator } = require('../lib/components');
const log = require('../lib/logger');

const data = new SlashCommandBuilder()
  .setName('panel')
  .setDescription('Publier le panneau pour passer une commande dans ce salon');

/** Construit le panneau (Components V2) avec un unique bouton "Passer une commande". */
function buildPanel() {
  const button = new ButtonBuilder()
    .setCustomId('ticket:new')
    .setLabel('Passer une commande')
    .setEmoji('🛒')
    .setStyle(ButtonStyle.Success);

  const c = container()
    .addTextDisplayComponents(text('## 🛒 Passer une commande'))
    .addTextDisplayComponents(text(
      'Envie de lancer un projet ? Clique sur le bouton ci-dessous pour ouvrir un ' +
      '**ticket privé** avec le staff et discuter de ta commande.',
    ))
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(text('Un salon rien que pour toi sera créé — on te répond au plus vite ! 🚀'))
    .addActionRowComponents(new ActionRowBuilder().addComponents(button));

  return { components: [c], flags: V2 };
}

/** Un message est-il un ancien panneau du bot ? (contient notre bouton/menu de tickets) */
function looksLikePanel(message, botId) {
  if (message.author?.id !== botId) return false;
  try {
    const raw = JSON.stringify(message.components ?? []);
    return raw.includes('ticket:new') || raw.includes('ticket:create');
  } catch {
    return false;
  }
}

async function execute(interaction) {
  if (!isStaff(interaction.member)) {
    return interaction.reply({ content: '❌ Réservé au staff.', flags: MessageFlags.Ephemeral });
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const channel = interaction.channel;
  const botId = interaction.client.user.id;

  // 1) Nettoie les anciens panneaux du bot dans ce salon -> évite les doublons
  //    (cause des "plusieurs messages" quand /panel est relancé).
  let cleaned = 0;
  try {
    const recent = await channel.messages.fetch({ limit: 50 });
    for (const m of recent.values()) {
      if (looksLikePanel(m, botId)) {
        await m.delete().catch(() => {});
        cleaned += 1;
      }
    }
  } catch (err) {
    log.warn('panel', 'Nettoyage des anciens panneaux impossible', { detail: err.message });
  }

  // 2) Publie un unique panneau et mémorise son id.
  try {
    const msg = await channel.send(buildPanel());
    db.panels = db.panels || {};
    db.panels[channel.id] = msg.id;
    save();

    log.event(interaction.guild, {
      level: 'info', scope: 'panel', title: '🎫 Panneau de tickets publié',
      fields: [
        { name: 'Salon', value: `${channel}`, inline: true },
        { name: 'Par', value: `<@${interaction.user.id}>`, inline: true },
        { name: 'Anciens supprimés', value: `${cleaned}`, inline: true },
      ],
    });
    return interaction.editReply({
      content: `✅ Panneau publié.${cleaned ? ` ${cleaned} ancien(s) panneau(x) nettoyé(s).` : ''}`,
    });
  } catch (err) {
    log.error('panel', 'Publication du panneau impossible', err);
    return interaction.editReply({ content: '⚠️ Impossible de publier le panneau ici (vérifie mes permissions).' });
  }
}

module.exports = { data, execute, buildPanel };
