// Agrégation + publication des avis historiques (salon NSH → Components V2).
const config = require('../../config');
const { db, save, persistNow } = require('../storage');
const { seeds: LEGACY_SEEDS, CHANNEL_AVIS } = require('../data/legacy-reviews');
const { publicContainer } = require('../commands/avis');
const { V2 } = require('./components');
const log = require('./logger');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Convertit une note lue sur /10 (ou /5) vers l'échelle /5 du bot. */
function normalizeNote(value, max = 10) {
  const v = Number(value);
  const m = Number(max) || 10;
  if (!Number.isFinite(v) || v <= 0) return 0;
  const out = (v / m) * 5;
  return Math.round(Math.min(5, Math.max(0, out)) * 10) / 10;
}

function cleanLine(s) {
  return (s || '')
    .replace(/[\u{1F300}-\u{1FAFF}\u2600-\u27BF\uFE0F]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Texte de commentaire après la ligne Note (si pas de "Avis :"). */
function commentAfterNote(raw) {
  const noteIdx = raw.search(/Note\s*:\s*\d+(?:[.,]\d+)?\s*\/\s*\d+/i);
  if (noteIdx < 0) return '';
  let rest = raw.slice(noteIdx).replace(/^Note\s*:\s*\d+(?:[.,]\d+)?\s*\/\s*\d+[^\n]*/i, '').trim();
  rest = rest.replace(/^Rapport\s*,?\s*Qualité\s*,?\s*Prix\s*:\s*\d+(?:[.,]\d+)?\s*\/\s*\d+[^\n]*\n?/i, '').trim();
  // Retire les lignes qui ne contiennent que des emojis / étoiles.
  rest = rest.split('\n').filter((line) => cleanLine(line).length > 0).join('\n').trim();
  return rest.slice(0, 900);
}

/**
 * Parse un message Discord au format historique "NSH : AVIS".
 * Gère aussi les messages sans "Avis :" (commentaire directement après Note).
 */
function parseLegacyMessage(content) {
  if (!content || typeof content !== 'string') return null;
  const raw = content.replace(/\r/g, '').trim();
  if (!/NSH\s*:\s*AVIS|Note\s*:/i.test(raw)) return null;

  const noteMatch = raw.match(/Note\s*:\s*(\d+(?:[.,]\d+)?)\s*\/\s*(\d+)/i);
  if (!noteMatch) return null;

  const achatMatch = raw.match(/Achat\s*:\s*(.+)/i);
  const prestation = cleanLine((achatMatch?.[1] || 'Non précisé').split('\n')[0]) || 'Non précisé';

  const avisMatch = raw.match(/Avis\s*:\s*([\s\S]+)/i);
  let comment = avisMatch
    ? avisMatch[1].trim().split(/\n\s*Rapport\s*,?\s*Qualité\s*,?\s*Prix\s*:/i)[0].trim()
    : commentAfterNote(raw);

  if (!comment) return null;
  comment = comment.replace(/\s+/g, ' ').trim().slice(0, 900);

  return {
    prestation,
    note: normalizeNote(noteMatch[1].replace(',', '.'), noteMatch[2]),
    comment: comment.slice(0, 900),
  };
}

/** Injecte / met à jour les avis seed (id stable). */
function ensureLegacySeeds() {
  if (!db.legacyReviews) db.legacyReviews = {};
  let added = 0;
  for (const seed of LEGACY_SEEDS) {
    if (!db.legacyReviews[seed.id]) {
      db.legacyReviews[seed.id] = { ...seed, importedAt: Date.now() };
      added += 1;
    } else {
      // Complète les champs manquants sans écraser publishedMessageId.
      const cur = db.legacyReviews[seed.id];
      for (const [k, v] of Object.entries(seed)) {
        if (cur[k] == null || cur[k] === '') cur[k] = v;
      }
    }
  }
  if (added) {
    save();
    log.info('avis', `${added} avis historique(s) seed importé(s)`);
  }
}

/**
 * Lit les messages du salon d'avis public et les enregistre en base.
 */
async function syncLegacyReviewsFromChannels(client) {
  ensureLegacySeeds();
  if (!db.legacyReviews) db.legacyReviews = {};

  for (const [guildId, guildCfg] of Object.entries(config.guilds || {})) {
    const channelId = guildCfg.reviewPublicChannelId;
    if (!channelId || String(channelId).startsWith('ID_')) continue;

    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel?.messages?.fetch) continue;

    let batch;
    let lastId;
    let imported = 0;

    for (let page = 0; page < 20; page++) {
      batch = await channel.messages.fetch({ limit: 100, ...(lastId && { before: lastId }) }).catch(() => null);
      if (!batch?.size) break;

      for (const msg of batch.values()) {
        if (msg.author?.bot) continue;
        const key = `msg-${msg.id}`;
        const parsed = parseLegacyMessage(msg.content);
        if (!parsed) continue;

        const entry = {
          id: key,
          guildId,
          channelId,
          messageId: msg.id,
          authorTag: msg.author?.tag || msg.author?.username || 'Inconnu',
          authorId: msg.author?.id || null,
          prestation: parsed.prestation,
          note: parsed.note,
          comment: parsed.comment,
          status: 'approved',
          source: 'channel',
          createdAt: msg.createdTimestamp || Date.now(),
          importedAt: Date.now(),
        };

        if (!db.legacyReviews[key]) {
          db.legacyReviews[key] = entry;
          imported += 1;
        } else {
          Object.assign(db.legacyReviews[key], entry, {
            publishedMessageId: db.legacyReviews[key].publishedMessageId,
          });
        }
      }

      lastId = batch.last()?.id;
      if (batch.size < 100) break;
    }

    if (imported) {
      save();
      log.info('avis', `${imported} avis importé(s) depuis <#${channelId}>`);
    }
  }
}

/** Lie les messages bot déjà présents dans le salon (évite les doublons). */
async function reconcilePublishedReviews(channel) {
  if (!channel?.messages?.fetch || !db.legacyReviews) return;
  const batch = await channel.messages.fetch({ limit: 100 }).catch(() => null);
  if (!batch) return;

  let linked = 0;
  for (const msg of batch.values()) {
    if (!msg.author?.bot) continue;
    let raw = '';
    try { raw = JSON.stringify(msg.components ?? []); } catch { continue; }
    for (const review of Object.values(db.legacyReviews)) {
      if (review.publishedMessageId) continue;
      if (raw.includes(String(review.id))) {
        review.publishedMessageId = msg.id;
        review.publishedAt = msg.createdTimestamp || Date.now();
        linked += 1;
      }
    }
  }
  if (linked) {
    save();
    persistNow();
    log.info('avis', `${linked} avis historique(s) relié(s) à des messages déjà publiés`);
  }
}

/**
 * Publie les avis historiques non publiés dans le salon public (Components V2).
 */
async function publishLegacyReviewsToChannel(client) {
  ensureLegacySeeds();
  if (!db.legacyReviews) return 0;

  const channel = await client.channels.fetch(CHANNEL_AVIS).catch(() => null);
  if (!channel?.send) {
    log.warn('avis', 'Salon avis public introuvable pour publication');
    return 0;
  }

  await reconcilePublishedReviews(channel);

  const pending = Object.values(db.legacyReviews)
    .filter((r) => r.channelId === CHANNEL_AVIS && r.status === 'approved' && !r.publishedMessageId)
    .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));

  let published = 0;
  for (const review of pending) {
    try {
      let avatar = null;
      if (review.authorId) {
        const user = await client.users.fetch(review.authorId).catch(() => null);
        avatar = user?.displayAvatarURL?.() || null;
      }

      const msg = await channel.send({
        components: [publicContainer(review, avatar)],
        flags: V2,
        allowedMentions: { parse: [] },
      });

      review.publishedMessageId = msg.id;
      review.publishedAt = Date.now();
      published += 1;
      save();
      await sleep(800);
    } catch (err) {
      log.error('avis', `Publication avis ${review.id} impossible`, err);
    }
  }

  if (published) {
    save();
    persistNow();
    log.success('avis', `${published} avis publié(s) en Components V2 dans <#${CHANNEL_AVIS}>`);
  }
  return published;
}

/** Import complet : sync salon + publication V2. */
async function importAndPublishLegacyReviews(client) {
  await syncLegacyReviewsFromChannels(client);
  return publishLegacyReviewsToChannel(client);
}

/**
 * Filet de sécurité : publie les avis "bot" (db.reviews) approuvés mais jamais
 * postés dans le salon public (ex. approuvés quand reviewPublicChannelId n'était
 * pas encore configuré). Réconciliation anti-doublon sur "Avis #<id>".
 */
async function publishApprovedBotReviews(client) {
  if (!db.reviews) return 0;

  const pending = Object.values(db.reviews)
    .filter((r) => r.status === 'approved' && !r.publishedMessageId)
    .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  if (!pending.length) return 0;

  let published = 0;
  const seenByChannel = new Map(); // channelId -> Map(reviewId -> messageId)

  for (const review of pending) {
    const channelId = config.forGuild(review.guildId).reviewPublicChannelId;
    if (!channelId || String(channelId).startsWith('ID_')) continue;

    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel?.send) continue;

    // Réconciliation : repère les avis déjà publiés (messages bot "Avis #<id>").
    if (!seenByChannel.has(channelId)) {
      const seen = new Map();
      const batch = await channel.messages.fetch({ limit: 100 }).catch(() => null);
      if (batch) {
        for (const msg of batch.values()) {
          if (!msg.author?.bot) continue;
          let raw = '';
          try { raw = JSON.stringify(msg.components ?? []); } catch { continue; }
          for (const tag of raw.match(/Avis #(\d+)/g) || []) {
            seen.set(tag.replace('Avis #', ''), msg.id);
          }
        }
      }
      seenByChannel.set(channelId, seen);
    }
    const seen = seenByChannel.get(channelId);

    if (seen.has(String(review.id))) {
      review.publishedMessageId = seen.get(String(review.id));
      review.publishedAt = review.publishedAt || Date.now();
      save();
      continue;
    }

    let avatar = null;
    if (review.authorId) {
      const user = await client.users.fetch(review.authorId).catch(() => null);
      avatar = user?.displayAvatarURL?.() || null;
    }
    try {
      const msg = await channel.send({
        components: [publicContainer(review, avatar)],
        flags: V2,
        allowedMentions: { parse: [] },
      });
      review.publishedMessageId = msg.id;
      review.publishedAt = Date.now();
      seen.set(String(review.id), msg.id);
      published += 1;
      save();
      await sleep(800);
    } catch (err) {
      log.error('avis', `Publication avis bot #${review.id} impossible`, err);
    }
  }

  if (published) {
    persistNow();
    log.success('avis', `${published} avis bot publié(s) dans le salon public`);
  }
  return published;
}

function getApprovedReviews(guildId) {
  ensureLegacySeeds();
  const bot = Object.values(db.reviews || {})
    .filter((r) => r.guildId === guildId && r.status === 'approved');
  const legacy = Object.values(db.legacyReviews || {})
    .filter((r) => r.guildId === guildId && r.status === 'approved');
  return [...bot, ...legacy];
}

function getPendingReviews(guildId) {
  return Object.values(db.reviews || {})
    .filter((r) => r.guildId === guildId && r.status === 'pending');
}

function averageNote(reviews) {
  if (!reviews.length) return 0;
  return reviews.reduce((s, r) => s + (r.note || 0), 0) / reviews.length;
}

function topPrestations(reviews) {
  const counts = new Map();
  for (const r of reviews) {
    const p = (r.prestation || 'Autre').trim();
    counts.set(p, (counts.get(p) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, n]) => `${name} (${n})`);
}

module.exports = {
  parseLegacyMessage,
  ensureLegacySeeds,
  syncLegacyReviewsFromChannels,
  publishLegacyReviewsToChannel,
  importAndPublishLegacyReviews,
  publishApprovedBotReviews,
  getApprovedReviews,
  getPendingReviews,
  averageNote,
  topPrestations,
  normalizeNote,
};
