// /scan : analyse les profils de tous les membres et classe les plus suspects.
// Lecture seule : aucune sanction automatique, le staff décide (/gban add).
const { SlashCommandBuilder, MessageFlags, AttachmentBuilder } = require('discord.js');
const { db } = require('../storage');
const { ensureAdmin } = require('../lib/adminGuard');
const { isStaff } = require('../lib/helpers');
const { V2, container, text, separator, file } = require('../lib/components');
const gb = require('../lib/globalBan');

const DAY = 86400e3;
const SHOWN = 15;

const data = new SlashCommandBuilder()
  .setName('scan')
  .setDescription('Analyse les profils des membres et liste les comptes suspects')
  .addIntegerOption((o) => o.setName('seuil').setDescription('Score minimum pour apparaître (défaut 30)').setMinValue(1).setMaxValue(200));

// Pseudos typiques des bots d'arnaque / spam.
const SCAM_NAME = /(nitro|free|gift|giveaway|airdrop|steam|crypto|nft|onlyfans|support|moderat|admin|discord\.gg|https?:|\.com|\.gg)/i;

// "seg0vex", "Seg_ovex" et "segovex" donnent la même clé (usurpations).
const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', '@': 'a', $: 's' };
const normalize = (name) => (name || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .replace(/[013457@$]/g, (c) => LEET[c])
  .replace(/[^a-z]/g, '');

/** Noms normalisés du staff (pour repérer les usurpations). */
function staffNames(members) {
  const map = new Map();
  for (const m of members.values()) {
    if (m.user.bot || !isStaff(m)) continue;
    for (const n of [m.user.username, m.user.globalName, m.nickname]) {
      const k = normalize(n);
      if (k.length >= 4) map.set(k, m.id);
    }
  }
  return map;
}

function analyse(member, staff, verifRoleId) {
  const u = member.user;
  const flags = [];
  let score = 0;
  const add = (pts, why) => { score += pts; flags.push(why); };

  if (db.globalBans[u.id]) add(200, 'banni globalement mais présent');

  const ageDays = Math.floor((Date.now() - u.createdTimestamp) / DAY);
  if (ageDays < 7) add(40, `compte de ${ageDays} j`);
  else if (ageDays < 30) add(25, `compte de ${ageDays} j`);
  else if (ageDays < 90) add(10, `compte de ${ageDays} j`);

  if (!u.avatar) add(10, "pas d'avatar");

  if (member.joinedTimestamp && member.joinedTimestamp - u.createdTimestamp < DAY) add(20, 'a rejoint le jour de sa création');

  const names = [u.username, u.globalName, member.nickname].filter(Boolean);
  if (names.some((n) => SCAM_NAME.test(n))) add(30, 'pseudo de type arnaque');

  if (!isStaff(member)) {
    const copied = names.map(normalize).find((n) => staff.has(n) && staff.get(n) !== u.id);
    if (copied) add(60, `usurpe le pseudo d'un staff (<@${staff.get(copied)}>)`);
  }

  const match = gb.bestMatch(u);
  if (match && match.score >= 40) add(match.score, `ressemble au banni \`${match.id}\` (${match.reasons.join(', ')})`);

  if (verifRoleId && member.roles.cache.has(verifRoleId)) add(5, 'Visiteur non vérifié');

  return { member, ageDays, score, flags };
}

const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

async function execute(interaction) {
  if (!(await ensureAdmin(interaction))) return;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const minScore = interaction.options.getInteger('seuil') || 30;
  const members = await interaction.guild.members.fetch();
  const humans = members.filter((m) => !m.user.bot);
  const staff = staffNames(humans);
  const verifRoleId = db.verif?.[interaction.guild.id]?.roleId;

  const results = humans.map((m) => analyse(m, staff, verifRoleId)).sort((a, b) => b.score - a.score);
  const flagged = results.filter((r) => r.score >= minScore);
  const count = (pred) => results.filter(pred).length;

  const summary = [
    `**Membres analysés** — ${results.length}`,
    `**Suspects (score ${minScore}+)** — ${flagged.length}`,
    `**Comptes de moins de 30 jours** — ${count((r) => r.ageDays < 30)}`,
    `**Sans avatar** — ${count((r) => !r.member.user.avatar)}`,
    `**Usurpations de staff** — ${count((r) => r.flags.some((f) => f.startsWith('usurpe')))}`,
    `**Ressemblent à un banni** — ${count((r) => r.flags.some((f) => f.startsWith('ressemble')))}`,
  ].join('\n');

  // Un message V2 est limité à 4000 caractères de texte au total.
  const top = [];
  let budget = 2800;
  for (const [i, r] of flagged.slice(0, SHOWN).entries()) {
    const line = `**${i + 1}.** <@${r.member.id}> \`${r.member.id}\` — **${r.score}**\n-# ${r.flags.join(' · ')}`.slice(0, 400);
    if ((budget -= line.length + 1) < 0) break;
    top.push(line);
  }

  const csv = [
    ['id', 'pseudo', 'age_jours', 'score', 'signaux'].map(csvCell).join(','),
    ...results.map((r) => [r.member.id, r.member.user.tag, r.ageDays, r.score, r.flags.join(' | ')].map(csvCell).join(',')),
  ].join('\n');
  const name = `scan-${interaction.guild.id}-${new Date().toISOString().slice(0, 10)}.csv`;

  const c = container(flagged.length ? 0xf39c12 : 0x2ecc71)
    .addTextDisplayComponents(text(`## Scan des profils — ${interaction.guild.name}`))
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(text(summary))
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(text(top.length
      ? `### Les ${top.length} plus suspects\n${top.join('\n')}`
      : 'Aucun compte au-dessus du seuil.'))
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(text('-# Rapport complet en pièce jointe. Aucune sanction automatique : utilise /gban add pour agir.'))
    .addFileComponents(file(name));

  return interaction.editReply({
    components: [c],
    files: [new AttachmentBuilder(Buffer.from(`﻿${csv}`, 'utf8'), { name })],
    flags: V2,
    allowedMentions: { parse: [] },
  });
}

module.exports = { data, execute };
