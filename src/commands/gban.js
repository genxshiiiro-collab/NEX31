const {
  SlashCommandBuilder, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle,
} = require('discord.js');
const { db } = require('../storage');
const { V2, container, text, separator } = require('../lib/components');
const gb = require('../lib/globalBan');

const data = new SlashCommandBuilder()
  .setName('gban')
  .setDescription('Ban global : tous les serveurs du bot + alts liés')
  .addSubcommand((s) => s.setName('add').setDescription('Bannir un compte et ses alts partout')
    .addUserOption((o) => o.setName('utilisateur').setDescription('Compte à bannir (mention ou ID)').setRequired(true))
    .addStringOption((o) => o.setName('raison').setDescription('Raison'))
    .addStringOption((o) => o.setName('alts').setDescription('IDs d\'autres comptes à lier, séparés par espace ou virgule'))
    .addIntegerOption((o) => o.setName('supprimer_jours').setDescription('Supprimer ses messages des X derniers jours').setMinValue(0).setMaxValue(7)))
  .addSubcommand((s) => s.setName('remove').setDescription('Lever un ban global')
    .addStringOption((o) => o.setName('id').setDescription('Compte banni (tape un pseudo ou un ID)').setRequired(true).setAutocomplete(true))
    .addBooleanOption((o) => o.setName('alts').setDescription('Débannir aussi ses alts liés')))
  .addSubcommand((s) => s.setName('alt').setDescription('Lier un alt : si l\'un est banni, l\'autre aussi')
    .addUserOption((o) => o.setName('principal').setDescription('Compte principal').setRequired(true))
    .addUserOption((o) => o.setName('alt').setDescription('Compte alt').setRequired(true)))
  .addSubcommand((s) => s.setName('list').setDescription('Liste des bans globaux'))
  .addSubcommand((s) => s.setName('check').setDescription('Score de ressemblance d\'un compte avec les bannis')
    .addUserOption((o) => o.setName('utilisateur').setDescription('Compte à vérifier').setRequired(true)));

function card(title, body, color = 0xe74c3c) {
  const c = container(color).addTextDisplayComponents(text(`## ${title}`));
  if (body) c.addSeparatorComponents(separator()).addTextDisplayComponents(text(body));
  return { components: [c], flags: V2, allowedMentions: { parse: [] } };
}
const ephemeral = (payload) => ({ ...payload, flags: payload.flags | MessageFlags.Ephemeral });

async function execute(interaction) {
  if (!gb.canGlobalBan(interaction)) {
    return interaction.reply({ content: "Vous n'avez pas la permission d'utiliser cette commande.", flags: MessageFlags.Ephemeral });
  }
  const sub = interaction.options.getSubcommand();
  const { client } = interaction;

  if (sub === 'add') {
    const user = interaction.options.getUser('utilisateur');
    const reason = interaction.options.getString('raison') || 'Aucune raison';
    if (user.id === interaction.user.id || user.id === client.user.id) {
      return interaction.reply(ephemeral(card('Action refusée', 'Cible invalide.', 0xf39c12)));
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    for (const alt of gb.parseIds(interaction.options.getString('alts'))) gb.link(user.id, alt);
    const ids = gb.cluster(user.id);
    const results = await gb.globalBan(client, ids, {
      reason, by: interaction.user.id, deleteSeconds: (interaction.options.getInteger('supprimer_jours') || 0) * 86400,
    });
    const lines = results.map((r) => `<@${r.id}> (\`${r.id}\`) — ${r.guilds}/${client.guilds.cache.size} serveur(s)`).join('\n');
    gb.logAll(client, {
      level: 'error', title: 'Ban global',
      fields: [
        { name: 'Comptes', value: lines },
        { name: 'Par', value: `<@${interaction.user.id}>`, inline: true },
        { name: 'Raison', value: reason, inline: true },
      ],
    });
    const { banned } = results.sweep;
    const sweepLine = banned.length
      ? `\n\n**Autres comptes trouvés et bannis partout** — ${banned.map((a) => `<@${a.id}>`).join(', ')}`
      : '\n\nAucun autre compte ressemblant trouvé sur les serveurs.';
    const reply = card('Ban global appliqué', `${lines}\n\nRaison : ${reason}${sweepLine}`);
    reply.components[0].addActionRowComponents(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`gban:unban:${user.id}`).setLabel('Lever ce gban').setStyle(ButtonStyle.Secondary),
    ));
    return interaction.editReply(reply);
  }

  if (sub === 'remove') {
    const id = interaction.options.getString('id').replace(/\D/g, '');
    if (!db.globalBans[id]) {
      return interaction.reply(ephemeral(card('Introuvable', 'Ce compte n\'est pas dans le ban global.', 0xf39c12)));
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const ids = interaction.options.getBoolean('alts') ? gb.cluster(id).filter((x) => db.globalBans[x]) : [id];
    await gb.globalUnban(client, ids);
    const list = ids.map((x) => `\`${x}\``).join(', ');
    gb.logAll(client, {
      level: 'info', title: 'Ban global levé',
      fields: [{ name: 'Comptes', value: list }, { name: 'Par', value: `<@${interaction.user.id}>`, inline: true }],
    });
    return interaction.editReply(card('Ban global levé', list, 0x2ecc71));
  }

  if (sub === 'alt') {
    const main = interaction.options.getUser('principal');
    const alt = interaction.options.getUser('alt');
    if (main.id === alt.id) return interaction.reply(ephemeral(card('Action refusée', 'Même compte.', 0xf39c12)));
    gb.link(main.id, alt.id);
    const group = gb.cluster(main.id);
    const banned = group.find((x) => db.globalBans[x]);
    if (!banned) {
      return interaction.reply(ephemeral(card('Alt lié', `Groupe : ${group.map((x) => `<@${x}>`).join(', ')}\nSi l'un est banni globalement, tous le seront.`, 0x3498db)));
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const toBan = group.filter((x) => !db.globalBans[x]);
    await gb.globalBan(client, toBan, { reason: `Alt de ${banned} — ${db.globalBans[banned].reason}`, by: interaction.user.id });
    return interaction.editReply(card('Alt lié et banni', `${toBan.map((x) => `<@${x}>`).join(', ')} rejoint le ban de \`${banned}\`.`));
  }

  if (sub === 'list') {
    const entries = Object.entries(db.globalBans);
    const lines = entries.slice(-25).reverse()
      .map(([id, b]) => `\`${id}\` ${b.tag} — ${b.reason} <t:${Math.floor(b.date / 1000)}:d>`);
    return interaction.reply(ephemeral(card(`Bans globaux (${entries.length})`, lines.join('\n') || 'Aucun.', 0x95a5a6)));
  }

  // check
  const user = await client.users.fetch(interaction.options.getUser('utilisateur').id, { force: true });
  if (db.globalBans[user.id]) {
    return interaction.reply(ephemeral(card('Banni globalement', `Raison : ${db.globalBans[user.id].reason}`)));
  }
  const m = gb.bestMatch(user);
  const body = m && m.score > 0
    ? `Score **${m.score}** contre \`${m.id}\` (${m.ban.tag})\n${m.reasons.join(', ')}`
    : 'Aucune ressemblance avec un compte banni.';
  return interaction.reply(ephemeral(card(`Vérification de ${user.tag}`, body, m?.score >= gb.QUARANTINE_SCORE ? 0xf39c12 : 0x95a5a6)));
}

/** /gban remove : propose les comptes bannis (pseudo ou ID). */
async function autocomplete(interaction) {
  const query = interaction.options.getFocused().toLowerCase();
  const choices = Object.entries(db.globalBans)
    .filter(([id, b]) => id.includes(query) || (b.tag || '').toLowerCase().includes(query))
    .slice(-25).reverse()
    .map(([id, b]) => ({ name: `${b.tag} — ${b.reason}`.slice(0, 100), value: id }));
  return interaction.respond(choices);
}

module.exports = { data, execute, autocomplete };
