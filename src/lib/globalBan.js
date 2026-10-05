// Ban global : blacklist partagée par tous les serveurs du bot + groupes d'alts
// liés + détection des comptes suspects à l'arrivée.
// Discord ne donne aucun lien entre comptes : la détection se fait par
// ressemblance (avatar, pseudo, âge du compte) et le staff tranche.
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const { db, save } = require('../storage');
const { isAdmin } = require('./adminGuard');
const { V2, container, text, separator } = require('./components');
const config = require('../../config');
const log = require('./logger');

// Seuils de suspicion (voir scoreAgainst).
const AUTO_BAN_SCORE = 100;
const QUARANTINE_SCORE = 60;
const QUARANTINE_MS = 28 * 86400e3;
const DAY = 86400e3;

// Qui peut bannir globalement : IDs listés dans GBAN_OWNERS (séparés par virgule),
// sinon tout administrateur du serveur où l'action est faite.
function canGlobalBan(interaction) {
  const owners = (process.env.GBAN_OWNERS || '').split(',').map((s) => s.trim()).filter(Boolean);
  return owners.length ? owners.includes(interaction.user.id) : isAdmin(interaction);
}

// --- Graphe des alts (chaque lien stocké dans les deux sens) ---

function link(a, b) {
  if (a === b) return;
  const add = (x, y) => {
    if (!db.altLinks[x]) db.altLinks[x] = [];
    if (!db.altLinks[x].includes(y)) db.altLinks[x].push(y);
  };
  add(a, b);
  add(b, a);
  save();
}

/** Tous les comptes reliés à `id`, lui compris. */
function cluster(id) {
  const seen = new Set([id]);
  const queue = [id];
  while (queue.length) {
    for (const next of db.altLinks[queue.shift()] || []) {
      if (!seen.has(next)) { seen.add(next); queue.push(next); }
    }
  }
  return [...seen];
}

const parseIds = (str) => (str || '').split(/[\s,]+/).map((s) => s.replace(/\D/g, '')).filter((s) => /^\d{17,20}$/.test(s));

// --- Détection d'alts ---

const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', '@': 'a', $: 's' };
const normalize = (name) => (name || '').toLowerCase()
  .normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .replace(/[013457@$]/g, (c) => LEET[c])
  .replace(/[^a-z]/g, '');

function levenshtein(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[b.length];
}

function namesMatch(a, b) {
  if (a.length < 4 || b.length < 4) return false;
  return a === b || a.includes(b) || b.includes(a)
    || levenshtein(a, b) <= Math.max(1, Math.floor(Math.min(a.length, b.length) / 5));
}

const snapshot = (user) => ({
  tag: user.tag,
  names: [...new Set([user.username, user.globalName].filter(Boolean))],
  avatar: user.avatar || null,
  createdAt: user.createdTimestamp,
});

/** Score de ressemblance d'un compte avec une entrée bannie + raisons lisibles. */
function scoreAgainst(user, ban) {
  const reasons = [];
  let score = 0;
  if (user.avatar && ban.avatar && user.avatar === ban.avatar) {
    score += 60; reasons.push('même avatar');
  }
  const mine = [user.username, user.globalName].filter(Boolean).map(normalize);
  const theirs = (ban.names || []).map(normalize);
  if (mine.some((a) => theirs.some((b) => namesMatch(a, b)))) {
    score += 40; reasons.push('pseudo proche');
  }
  const age = Date.now() - user.createdTimestamp;
  if (age < 7 * DAY) { score += 20; reasons.push('compte de moins de 7 jours'); } else if (age < 30 * DAY) { score += 10; reasons.push('compte de moins de 30 jours'); }
  if (user.createdTimestamp > ban.date && user.createdTimestamp - ban.date < 30 * DAY) {
    score += 15; reasons.push('créé juste après le ban');
  }
  return { score, reasons };
}

function bestMatch(user) {
  let best = null;
  for (const [id, ban] of Object.entries(db.globalBans)) {
    if (id === user.id) continue;
    const res = scoreAgainst(user, ban);
    if (!best || res.score > best.score) best = { id, ban, ...res };
  }
  return best;
}

// --- Actions ---

/** Ban sur tous les serveurs du bot. Retourne le nombre de serveurs touchés. */
async function banEverywhere(client, id, reason, deleteSeconds = 0) {
  let ok = 0;
  for (const guild of client.guilds.cache.values()) {
    if (id === guild.ownerId) continue;
    try {
      await guild.members.ban(id, { reason: `[Ban global] ${reason}`.slice(0, 512), deleteMessageSeconds: deleteSeconds });
      ok += 1;
    } catch (err) {
      log.warn('gban', `Ban impossible sur ${guild.name}`, { id, detail: err.message });
    }
  }
  return ok;
}

/**
 * Après un ban global : passe en revue les membres de tous les serveurs et
 * bannit les comptes qui ressemblent aux bannis : chacun est lié et
 * banni partout avec lui (score de 60 ou plus).
 * Jamais : staff, bots, propriétaires des serveurs.
 */
async function sweepAlts(client, bannedIds) {
  const { isStaff } = require('./helpers');
  const found = new Map(); // userId -> { user, match }
  for (const guild of client.guilds.cache.values()) {
    const members = await guild.members.fetch().catch(() => guild.members.cache);
    for (const member of members.values()) {
      if (member.user.bot || member.id === guild.ownerId || db.globalBans[member.id] || isStaff(member)) continue;
      for (const id of bannedIds) {
        const ban = db.globalBans[id];
        if (!ban) continue;
        const res = scoreAgainst(member.user, ban);
        if (res.score >= QUARANTINE_SCORE && res.score > (found.get(member.id)?.match.score || 0)) {
          found.set(member.id, { user: member.user, match: { id, ban, ...res } });
        }
      }
    }
  }

  // Tout compte trouvé est lié au banni et banni partout avec lui.
  const sweep = { banned: [] };
  for (const [userId, { user, match }] of found) {
    link(match.id, userId);
    await globalBan(client, [userId], { reason: `Alt de ${match.id} — ${match.ban.reason}`, by: client.user.id, sweep: false });
    sweep.banned.push({ id: userId, tag: user.tag, of: match.id, why: match.reasons.join(', ') });
  }
  return sweep;
}

/**
 * Ajoute `ids` à la blacklist globale, les bannit partout, puis (sauf
 * sweep: false) cherche leurs autres comptes sur les serveurs du bot.
 * Le résultat porte `.sweep = { banned }`.
 */
async function globalBan(client, ids, { reason, by, deleteSeconds = 0, sweep = true }) {
  const results = [];
  for (const id of ids) {
    const user = await client.users.fetch(id, { force: true }).catch(() => null);
    db.globalBans[id] = {
      ...(user ? snapshot(user) : { tag: id, names: [], avatar: null }), reason, by, date: Date.now(),
    };
    save();
    results.push({ id, guilds: await banEverywhere(client, id, reason, deleteSeconds) });
  }
  results.sweep = sweep ? await sweepAlts(client, ids) : { banned: [] };
  const { banned } = results.sweep;
  if (banned.length) {
    const line = (a) => `<@${a.id}> (${a.tag}) — ressemble à \`${a.of}\` : ${a.why}`;
    logAll(client, {
      level: 'error', title: 'Autres comptes du banni bannis partout',
      fields: [{ name: `Comptes (${banned.length})`, value: banned.map(line).join('\n').slice(0, 1000) }],
    });
  }
  return results;
}

async function globalUnban(client, ids) {
  for (const id of ids) {
    delete db.globalBans[id];
    for (const guild of client.guilds.cache.values()) {
      await guild.members.unban(id, '[Ban global] levé').catch(() => {});
    }
  }
  save();
}

/** Log dans le salon de logs de chaque serveur du bot. */
function logAll(client, opts) {
  for (const guild of client.guilds.cache.values()) log.event(guild, { scope: 'gban', ...opts });
}

// --- Arrivée d'un membre ---

async function onJoin(member) {
  if (member.user.bot) return;
  const ban = db.globalBans[member.id];

  if (ban) {
    await member.ban({ reason: `[Ban global] ${ban.reason}`.slice(0, 512) })
      .catch((err) => log.warn('gban', 'Ban à l\'arrivée impossible', { id: member.id, detail: err.message }));
    log.event(member.guild, {
      level: 'warn', scope: 'gban', title: 'Compte blacklisté bloqué à l\'arrivée',
      fields: [
        { name: 'Compte', value: `<@${member.id}> (${member.user.tag})` },
        { name: 'Raison', value: ban.reason },
      ],
    });
    return;
  }

  // Chargé ici : verification.js importe déjà ce module.
  const verifConfigured = await require('./verification').giveVisitorRole(member);

  const user = await member.client.users.fetch(member.id, { force: true }).catch(() => member.user);
  const match = bestMatch(user);
  if (!match || match.score < QUARANTINE_SCORE) return;

  const fields = [
    { name: 'Compte', value: `<@${member.id}> (${user.tag}, \`${member.id}\`)` },
    { name: 'Ressemble à', value: `\`${match.id}\` (${match.ban.tag})` },
    { name: 'Score', value: `${match.score} — ${match.reasons.join(', ')}` },
  ];

  if (match.score >= AUTO_BAN_SCORE) {
    link(match.id, member.id);
    await globalBan(member.client, [member.id], { reason: `Alt de ${match.id} — ${match.ban.reason}`, by: member.client.user.id });
    logAll(member.client, { level: 'error', title: 'Alt détecté et banni partout', fields });
    return;
  }
  // Vérification en place : le rôle Visiteur suffit, le tri se fait au bouton "Vérifier".
  if (verifConfigured) return;

  await member.timeout(QUARANTINE_MS, `Alt suspect de ${match.id}`)
    .catch((err) => log.warn('gban', 'Quarantaine impossible', { id: member.id, detail: err.message }));

  // Alerte avec boutons de décision dans le salon de logs du serveur.
  const channelId = config.forGuild(member.guild.id).logChannelId;
  const channel = channelId ? await member.client.channels.fetch(channelId).catch(() => null) : null;
  if (!channel) {
    log.event(member.guild, { level: 'warn', scope: 'gban', title: 'Alt suspect en quarantaine', fields });
    return;
  }
  const c = container(0xf39c12)
    .addTextDisplayComponents(text('## Alt suspect — décision requise'))
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(text(fields.map((f) => `**${f.name}** — ${f.value}`).join('\n')))
    .addTextDisplayComponents(text('-# Membre rendu muet 28 jours en attendant.'))
    .addActionRowComponents(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`gban:ban:${member.id}:${match.id}`).setLabel('Bannir partout').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`gban:ok:${member.id}`).setLabel('Faux positif').setStyle(ButtonStyle.Secondary),
    ));
  await channel.send({ components: [c], flags: V2, allowedMentions: { parse: [] } }).catch(() => {});
}

// --- Boutons de l'alerte ---

async function handleButton(interaction, action, id, of) {
  if (!canGlobalBan(interaction)) {
    return interaction.reply({ content: "Vous n'avez pas la permission d'utiliser cette commande.", flags: MessageFlags.Ephemeral });
  }
  const done = (title, body, color) => interaction.update({
    components: [container(color).addTextDisplayComponents(text(`## ${title}`)).addTextDisplayComponents(text(body))],
    flags: V2,
    allowedMentions: { parse: [] },
  });

  if (action === 'ban') {
    await done('Alt banni partout', `<@${id}> lié à \`${of}\` — par <@${interaction.user.id}>`, 0xe74c3c);
    link(of, id);
    await globalBan(interaction.client, [id], {
      reason: `Alt de ${of} — ${db.globalBans[of]?.reason || 'ban global'}`, by: interaction.user.id,
    });
    return;
  }
  if (action === 'unban') {
    const ids = cluster(id).filter((x) => db.globalBans[x]);
    if (!ids.length) {
      return interaction.reply({ content: "Ce compte n'est plus banni globalement.", flags: MessageFlags.Ephemeral });
    }
    const mentions = ids.map((x) => `<@${x}>`).join(', ');
    await done('Ban global levé', `${mentions} — par <@${interaction.user.id}>`, 0x2ecc71);
    await globalUnban(interaction.client, ids);
    logAll(interaction.client, { level: 'info', title: 'Ban global levé', description: `${mentions} par <@${interaction.user.id}>` });
    return;
  }
  if (action === 'ok') {
    const member = await interaction.guild.members.fetch(id).catch(() => null);
    await member?.timeout(null, 'Faux positif alt').catch(() => {});
    return done('Faux positif', `<@${id}> libéré par <@${interaction.user.id}>`, 0x2ecc71);
  }
}

module.exports = {
  canGlobalBan, link, cluster, parseIds, bestMatch, globalBan, globalUnban, logAll, onJoin, handleButton,
  AUTO_BAN_SCORE, QUARANTINE_SCORE,
};
