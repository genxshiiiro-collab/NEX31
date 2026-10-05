// Anti-phishing : supprime les liens d'arnaque (faux Nitro, faux Steam, token
// grabbers) et bannit globalement l'auteur et ses alts (compte piraté ou arnaqueur).
// Sources : deux listes publiques maintenues par la communauté, rechargées toutes
// les 6 h, + détection des sosies de domaines officiels (d1scord.com, steamcommunlty...).
const { db } = require('../storage');
const { isStaff } = require('./helpers');
const gb = require('./globalBan');
const { securityAlert } = require('./alert');
const config = require('../../config');
const log = require('./logger');

const SOURCES = [
  { url: 'https://raw.githubusercontent.com/nikolaischunk/discord-phishing-links/main/domain-list.json', pick: (j) => j.domains },
  { url: 'https://raw.githubusercontent.com/Discord-AntiScam/scam-links/main/list.json', pick: (j) => j },
];
const REFRESH_MS = 6 * 3600e3;

// Domaines officiels : jamais signalés, même s'ils ressemblent à une marque.
const OFFICIAL = [
  'discord.com', 'discord.gg', 'discord.gift', 'discord.media', 'discord.new', 'discordapp.com', 'discordapp.net',
  'discordstatus.com', 'discord.dev', 'discord.co', 'steamcommunity.com', 'steampowered.com', 'steamstatic.com',
  'epicgames.com', 'roblox.com', 'twitch.tv', 'youtube.com', 'youtu.be',
];
const BRANDS = ['discord', 'discordapp', 'steamcommunity', 'steampowered', 'discordnitro'];

const enabled = () => config.protect?.phishing?.enabled !== false;
let domains = new Set();

async function refresh() {
  const next = new Set();
  for (const src of SOURCES) {
    try {
      const res = await fetch(src.url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      for (const d of src.pick(await res.json()) || []) if (typeof d === 'string') next.add(d.toLowerCase().trim());
    } catch (err) {
      log.warn('phishing', `Liste indisponible : ${src.url}`, { detail: err.message });
    }
  }
  if (next.size) domains = next;
  log.info('phishing', `${domains.size} domaines d'arnaque chargés`);
}

function start() {
  if (!enabled()) return;
  refresh();
  setInterval(refresh, REFRESH_MS).unref();
}

const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't' };
const squash = (s) => s.replace(/[013457]/g, (c) => LEET[c]).replace(/l/g, 'i').replace(/rn/g, 'm').replace(/[^a-z]/g, '');

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

/**
 * Pourquoi ce domaine est une arnaque, ou null. Les sosies ne sont cherchés que
 * dans les vrais liens (http/https) : "discord.js" écrit dans une phrase n'est pas un lien.
 */
function verdict(host, isLink = true) {
  if (OFFICIAL.some((o) => host === o || host.endsWith(`.${o}`))) return null;
  const parts = host.split('.');
  for (let i = 0; i < parts.length - 1; i++) {
    if (domains.has(parts.slice(i).join('.'))) return "domaine d'arnaque connu";
  }
  if (!isLink) return null;
  const label = squash(parts.length >= 2 ? parts[parts.length - 2] : host);
  for (const brand of BRANDS) {
    const b = squash(brand);
    if (label === b || (label.length >= 7 && levenshtein(label, b) <= 1)) return `imitation de ${brand}`;
  }
  return null;
}

const HOST_RE = /\b(https?:\/\/)?((?:[a-z0-9-]+\.)+[a-z]{2,})(?=[/:\s?#)>"']|$)/gi;
const hostsIn = (content) => [...content.matchAll(HOST_RE)].map((m) => ({ host: m[2].toLowerCase(), isLink: Boolean(m[1]) }));

async function onMessage(message) {
  if (!enabled() || !message.guild || message.author.bot) return false;
  const content = [message.content, ...message.embeds.map((e) => e.url || '')].join(' ');
  const hit = hostsIn(content).map((h) => ({ host: h.host, why: verdict(h.host, h.isLink) })).find((x) => x.why);
  if (!hit) return false;

  await message.delete().catch(() => {});
  const member = message.member || await message.guild.members.fetch(message.author.id).catch(() => null);
  const fields = [
    { name: 'Compte', value: `<@${message.author.id}> (${message.author.tag}, \`${message.author.id}\`)` },
    { name: 'Lien', value: `\`${hit.host}\` — ${hit.why}` },
    { name: 'Salon', value: `<#${message.channelId}>` },
  ];

  if (member && isStaff(member)) {
    await securityAlert(message.guild, {
      title: "Lien d'arnaque envoyé par un staff",
      description: 'Message supprimé. Le compte est probablement piraté : vérifie-le et retire-lui ses rôles si besoin.',
      fields,
    });
    return true;
  }

  // L'auteur est banni ; ses autres comptes sont expulsés par globalBan.
  if (!db.globalBans[message.author.id]) {
    await gb.globalBan(message.client, [message.author.id], { reason: `Lien de phishing (${hit.host})`, by: message.client.user.id, deleteSeconds: 3600 });
  }
  gb.logAll(message.client, { level: 'error', title: 'Phishing : ban global', fields });
  return true;
}

module.exports = { start, onMessage, verdict, refresh };
