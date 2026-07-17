// Stockage simple en JSON (aucune base de données à installer).
// Les données sont écrites dans data/db.json.
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'db.json');

const DEFAULT_DB = {
  tickets: {},   // channelId -> { guildId, ownerId, ownerName, status, lastUserAt, relanceSent, claimedBy }
  reviews: {},   // reviewId  -> { id, guildId, authorId, authorTag, note, prestation, comment, status, createdAt }
  orders: {},    // orderId   -> { id, guildId, clientId, clientTag, prestation, prix, graphisteId, step, createdAt }
  blacklist: {}, // guildId   -> [ userId, ... ]  (bloqués pour /avis et ouverture de ticket)
  panels: {},    // channelId -> messageId du dernier panneau publié
  legacyReviews: {}, // id -> avis historiques (salon NSH / seed)
  payments: {},    // paymentId -> { id, guildId, userId, amount, method, status, ... }
  clientTotals: {}, // guildId -> { userId -> total dépensé }
  counters: { review: 0, order: 0, payment: 0 },
};

/** L'utilisateur est-il blacklisté sur ce serveur ? */
function isBlacklisted(guildId, userId) {
  return (db.blacklist[guildId] || []).includes(userId);
}

let db = structuredClone(DEFAULT_DB);
let saveTimer = null;

function migrateTickets() {
  const { slugifyName } = require('./lib/helpers');
  let dirty = false;
  for (const meta of Object.values(db.tickets)) {
    if (!meta || meta.closed || meta.nameSlug) continue;
    meta.nameSlug = slugifyName(meta.ownerName || 'client');
    dirty = true;
  }
  if (dirty) persistNow();
}

function load() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    const isNewDb = !fs.existsSync(DB_PATH);
    const fresh = structuredClone(DEFAULT_DB);
    if (!isNewDb) {
      const raw = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
      Object.assign(fresh, raw);
    } else {
      const config = require('../config');
      if (config.initialOrderCounter > 0) {
        fresh.counters.order = config.initialOrderCounter;
      }
    }
    for (const k of Object.keys(DEFAULT_DB)) {
      if (fresh[k] === undefined) fresh[k] = structuredClone(DEFAULT_DB[k]);
    }
    // Plancher du numéro de commande : la prochaine /commande sera au minimum ce
    // numéro. Appliqué à CHAQUE démarrage (même sur une base existante), donc
    // valable "à partir de maintenant". Ne fait jamais reculer un compteur déjà plus haut.
    const orderFloor = require('../config').orderNumberFloor;
    if (orderFloor > 0) {
      if (!fresh.counters) fresh.counters = structuredClone(DEFAULT_DB.counters);
      if ((fresh.counters.order || 0) < orderFloor - 1) {
        fresh.counters.order = orderFloor - 1;
      }
    }
    // Réassigner les clés sur l'objet exporté (module.exports.db) — ne pas remplacer la référence.
    for (const key of Object.keys(db)) delete db[key];
    Object.assign(db, fresh);
    migrateTickets();
  } catch (err) {
    console.error('[storage] Lecture impossible, repart sur une base vide :', err.message);
    for (const key of Object.keys(db)) delete db[key];
    Object.assign(db, structuredClone(DEFAULT_DB));
  }
  return db;
}

function persistNow() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = DB_PATH + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
    fs.renameSync(tmp, DB_PATH); // écriture atomique
  } catch (err) {
    console.error('[storage] Écriture impossible :', err.message);
  }
}

// écriture différée (regroupe les sauvegardes rapprochées)
function save() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    persistNow();
  }, 400);
}

function nextId(kind) {
  db.counters[kind] = (db.counters[kind] || 0) + 1;
  save();
  return db.counters[kind];
}

module.exports = { db, load, save, persistNow, nextId, isBlacklisted };
