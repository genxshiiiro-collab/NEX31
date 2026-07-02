const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const config = require('../../config');
const { db, isBlacklisted } = require('../storage');
const { isStaff, stars } = require('../lib/helpers');
const { V2, container, text, separator, thumbSection, fieldsText } = require('../lib/components');

const data = new SlashCommandBuilder()
  .setName('profil')
  .setDescription('Consulter la fiche d\'un client (réservé au staff)')
  .addUserOption((o) => o.setName('client').setDescription('Le client à consulter').setRequired(true));

async function execute(interaction) {
  if (!isStaff(interaction.member)) {
    return interaction.reply({ content: '❌ Réservé au staff.', flags: MessageFlags.Ephemeral });
  }

  const gid = interaction.guild.id;
  const target = interaction.options.getUser('client');

  const orders = Object.values(db.orders).filter((o) => o.guildId === gid && o.clientId === target.id);
  const delivered = orders.filter((o) => !o.cancelled && o.step === 3);
  const active = orders.filter((o) => !o.cancelled && o.step < 3);
  const totalSpent = delivered.reduce((s, o) => s + (o.prix || 0), 0);

  const reviews = Object.values(db.reviews).filter((r) => r.guildId === gid && r.authorId === target.id);
  const approved = reviews.filter((r) => r.status === 'approved');
  const avg = approved.length ? approved.reduce((s, r) => s + r.note, 0) / approved.length : 0;

  const recent = orders.sort((a, b) => b.id - a.id).slice(0, 5)
    .map((o) => {
      const st = o.cancelled ? '🚫' : (o.step === 3 ? '✅' : '🎨');
      return `${st} \`#${o.id}\` ${o.prestation} — ${o.prix}${config.currency}`;
    }).join('\n') || 'Aucune commande.';

  const blacklisted = isBlacklisted(gid, target.id);
  const c = container(blacklisted ? 0xe74c3c : config.brandColor)
    .addTextDisplayComponents(text(`## Fiche client — ${target.username}`))
    .addSeparatorComponents(separator())
    .addSectionComponents(thumbSection([
      `**Commandes** — ${orders.length} au total · ${delivered.length} livrées · ${active.length} en cours`,
      `**Total dépensé** — ${totalSpent} ${config.currency}`,
      `**Avis** — ${approved.length ? `${approved.length} · moy. ${stars(Math.round(avg))} ${avg.toFixed(1)}/5` : 'Aucun'}`,
    ], target.displayAvatarURL()))
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(text(`**Dernières commandes**\n${recent}`));

  if (blacklisted) c.addSeparatorComponents(separator()).addTextDisplayComponents(text('-# 🚫 Client blacklisté'));

  return interaction.reply({ components: [c], flags: MessageFlags.Ephemeral | V2, allowedMentions: { parse: [] } });
}

module.exports = { data, execute };
