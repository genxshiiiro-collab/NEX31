// =====================================================================
//  SERVICE CHECKPOINTS — suivi de commandes clients + rappels privés.
//
//  Stockage : data/db.json -> db.checkpoints (via storage.js).
//  Dates    : stockées en epoch ms (non ambigu). Affichage en
//             Europe/Brussels via Intl (checkpointConfig.timezone).
//  Rappels  : envoyés en DM au responsable (sinon au créateur), jamais
//             dans un salon, jamais @everyone/@here.
//  Reprise  : aucun setTimeout long. runCheckpointCycle() est rappelé
//             périodiquement (ready.js) et recalcule ce qui est dû, en
//             s'appuyant sur remindersSent pour éviter les doublons.
// =====================================================================

const { db, save } = require('../storage');
const { checkpointConfig } = require('../config/packs');
const { V2, container, text, separator } = require('./components');
const log = require('./logger');

const DAY_MS = 24 * 60 * 60 * 1000;

const STATUS = {
  pending: 'En attente',
  in_progress: 'En cours',
  waiting_client: 'Attente client',
  completed: 'Terminé',
  cancelled: 'Annulé',
  overdue: 'En retard',
};

// Statuts "actifs" : produisent encore des rappels.
const ACTIVE_STATUSES = ['pending', 'in_progress', 'waiting_client', 'overdue'];
const TERMINAL_STATUSES = ['completed', 'cancelled'];

const PACK_LABEL = {
  starter: 'Starter', intermediate: 'Intermediate', advanced: 'Advanced', elite: 'Elite',
};

// ---------------------------------------------------------------------
//  Dates / fuseau horaire
// ---------------------------------------------------------------------

// nowMs isolé pour rester testable et éviter des appels Date.now() dispersés.
function nowMs() {
  return Date.now();
}

/** Formate un epoch ms en date lisible dans le fuseau configuré. */
function formatDate(ms) {
  if (!ms && ms !== 0) return '—';
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: checkpointConfig.timezone,
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(new Date(ms));
}

/** Timestamp Discord relatif (<t:sec:R>) — auto-localisé côté client. */
function relative(ms) {
  return `<t:${Math.floor(ms / 1000)}:R>`;
}

/**
 * Convertit une heure "murale" (année/mois/... dans le fuseau tz) en epoch ms.
 * Astuce standard : on devine en UTC, on lit l'heure murale que cette valeur
 * affiche dans tz, et on corrige l'écart.
 */
function zonedWallTimeToMs(y, mo, d, h, mi, tz) {
  const guess = Date.UTC(y, mo - 1, d, h, mi, 0);
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const parts = Object.fromEntries(dtf.formatToParts(new Date(guess)).map((p) => [p.type, p.value]));
  let hour = Number(parts.hour);
  if (hour === 24) hour = 0; // certains environnements renvoient 24:00
  const asUTC = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    hour, Number(parts.minute), Number(parts.second),
  );
  const offset = asUTC - guess;
  return guess - offset;
}

/**
 * Parse une date saisie manuellement : "YYYY-MM-DD" ou "YYYY-MM-DD HH:mm"
 * (aussi "YYYY-MM-DDTHH:mm"). Interprétée dans le fuseau configuré.
 * @returns {number|null} epoch ms ou null si invalide.
 */
function parseManualDate(input) {
  if (!input) return null;
  const m = String(input).trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?$/);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m;
  const ms = zonedWallTimeToMs(Number(y), Number(mo), Number(d), Number(h ?? 9), Number(mi ?? 0), checkpointConfig.timezone);
  return Number.isFinite(ms) ? ms : null;
}

// ---------------------------------------------------------------------
//  CRUD
// ---------------------------------------------------------------------

function all() {
  return Object.values(db.checkpoints || {});
}

function forGuild(guildId) {
  return all().filter((cp) => cp.guildId === guildId);
}

function get(id) {
  return (db.checkpoints || {})[id] || null;
}

function nextCheckpointId() {
  if (!db.counters) db.counters = {};
  db.counters.checkpoint = (db.counters.checkpoint || 0) + 1;
  return `CP-${String(db.counters.checkpoint).padStart(4, '0')}`;
}

function durationMsForPack(pack) {
  const days = checkpointConfig.durationsInDays[pack];
  return (days || 0) * DAY_MS;
}

function pushHistory(cp, action, performedBy, extra = {}) {
  if (!cp.history) cp.history = [];
  cp.history.push({ action, performedBy, createdAt: nowMs(), ...extra });
}

/**
 * Crée un checkpoint.
 * @param {object} opts { guildId, client, type, pack, orderDescription,
 *   responsibleUserId, reminderRecipientUserId, createdBy, startAt?, notes? }
 */
function createCheckpoint(opts) {
  if (!db.checkpoints) db.checkpoints = {};
  const id = nextCheckpointId();
  const startAt = opts.startAt || nowMs();
  const deadlineAt = startAt + durationMsForPack(opts.pack);
  const cp = {
    id,
    guildId: opts.guildId,
    client: opts.client,
    type: opts.type,
    pack: opts.pack,
    orderDescription: opts.orderDescription,
    responsibleUserId: opts.responsibleUserId || null,
    reminderRecipientUserId: opts.reminderRecipientUserId || opts.responsibleUserId || opts.createdBy,
    status: 'pending',
    startAt,
    deadlineAt,
    completedAt: null,
    remindersSent: { halfway: false, approaching: false, urgent: false, deadline: false, lastOverdueReminderAt: null },
    notes: opts.notes || '',
    history: [],
    createdBy: opts.createdBy,
    createdAt: nowMs(),
    updatedAt: nowMs(),
  };
  pushHistory(cp, 'created', opts.createdBy, { pack: opts.pack, type: opts.type, deadlineAt });
  db.checkpoints[id] = cp;
  save();
  return cp;
}

function setStatus(cp, status, performedBy) {
  const old = cp.status;
  cp.status = status;
  cp.updatedAt = nowMs();
  if (status === 'completed' && !cp.completedAt) cp.completedAt = nowMs();
  pushHistory(cp, 'status_changed', performedBy, { oldValue: old, newValue: status });
  save();
  return cp;
}

function setResponsible(cp, userId, performedBy) {
  const old = cp.responsibleUserId;
  cp.responsibleUserId = userId;
  cp.reminderRecipientUserId = userId || cp.createdBy;
  cp.updatedAt = nowMs();
  pushHistory(cp, 'responsible_changed', performedBy, { oldValue: old, newValue: userId });
  save();
  return cp;
}

/**
 * Modifie la date limite et recalcule les rappels futurs.
 * Un rappel dont le seuil retombe DANS LE FUTUR est réarmé ; un rappel déjà
 * passé n'est pas renvoyé (sauf s'il redevient futur).
 */
function updateDeadline(cp, newDeadlineMs, reason, performedBy) {
  const old = cp.deadlineAt;
  cp.deadlineAt = newDeadlineMs;
  cp.updatedAt = nowMs();

  const now = nowMs();
  const total = cp.deadlineAt - cp.startAt;
  const r = checkpointConfig.reminders;
  const thresholds = {
    halfway: cp.startAt + total * (r.halfwayPercentage / 100),
    approaching: cp.startAt + total * (r.approachingPercentage / 100),
    urgent: cp.deadlineAt - r.urgentHoursBeforeDeadline * 60 * 60 * 1000,
    deadline: cp.deadlineAt,
  };
  for (const k of Object.keys(thresholds)) {
    if (thresholds[k] > now) cp.remindersSent[k] = false; // redevenu futur -> réarmé
  }
  // Sortie de l'état "en retard" si la nouvelle deadline est future.
  if (cp.status === 'overdue' && cp.deadlineAt > now) cp.status = 'in_progress';
  cp.remindersSent.lastOverdueReminderAt = null;

  pushHistory(cp, 'deadline_updated', performedBy, {
    oldValue: new Date(old).toISOString(),
    newValue: new Date(newDeadlineMs).toISOString(),
    reason: reason || null,
  });
  save();
  return cp;
}

function deleteCheckpoint(id) {
  if (!db.checkpoints || !db.checkpoints[id]) return false;
  delete db.checkpoints[id];
  save();
  return true;
}

function isActive(cp) {
  return ACTIVE_STATUSES.includes(cp.status);
}

// ---------------------------------------------------------------------
//  Rendu (embeds V2)
// ---------------------------------------------------------------------

function packLabel(cp) {
  return PACK_LABEL[cp.pack] || cp.pack;
}

function remainingLabel(cp, now = nowMs()) {
  const diff = cp.deadlineAt - now;
  const days = Math.floor(Math.abs(diff) / DAY_MS);
  const hours = Math.floor((Math.abs(diff) % DAY_MS) / (60 * 60 * 1000));
  const txt = `${days} j ${hours} h`;
  return diff >= 0 ? txt : `en retard de ${txt}`;
}

/** Container récapitulatif d'un checkpoint (view / confirmation création). */
function summaryContainer(cp) {
  const resp = cp.reminderRecipientUserId ? `<@${cp.reminderRecipientUserId}>` : '—';
  const c = container()
    .addTextDisplayComponents(text(`## Checkpoint ${cp.id}`))
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(text([
      `**Client** — ${cp.client}`,
      `**Type** — ${cp.type === 'studio' ? 'Studio' : 'Server'}`,
      `**Pack** — ${packLabel(cp)}`,
      `**Commande** — ${cp.orderDescription}`,
      `**Responsable** — ${cp.responsibleUserId ? `<@${cp.responsibleUserId}>` : '—'}`,
      `**Statut** — ${STATUS[cp.status] || cp.status}`,
      `**Début** — ${formatDate(cp.startAt)}`,
      `**Date limite** — ${formatDate(cp.deadlineAt)} (${relative(cp.deadlineAt)})`,
      `**Temps restant** — ${remainingLabel(cp)}`,
      `**Rappels privés** — ${resp}`,
    ].join('\n')));
  if (cp.notes) c.addSeparatorComponents(separator()).addTextDisplayComponents(text(`-# Notes : ${cp.notes}`));
  if (cp.completedAt) {
    const realDays = ((cp.completedAt - cp.startAt) / DAY_MS).toFixed(1);
    c.addSeparatorComponents(separator()).addTextDisplayComponents(text(`-# Terminé le ${formatDate(cp.completedAt)} · durée réelle ${realDays} j`));
  }
  return c;
}

// ---------------------------------------------------------------------
//  Rappels
// ---------------------------------------------------------------------

const REMINDER_TITLES = {
  halfway: 'Checkpoint — Mi-parcours',
  approaching: 'Checkpoint — Date limite proche',
  urgent: 'Checkpoint urgent — Moins de 24 heures',
  deadline: 'Checkpoint arrivé à échéance',
  overdue: 'Checkpoint en retard',
};

function reminderContainer(cp, kind, now = nowMs()) {
  const lines = [
    `**Client** — ${cp.client}`,
    `**Pack** — ${packLabel(cp)}`,
    `**Commande** — ${cp.orderDescription}`,
    `**Date limite** — ${formatDate(cp.deadlineAt)} (${relative(cp.deadlineAt)})`,
    `**Temps restant** — ${remainingLabel(cp, now)}`,
  ];
  if (cp.responsibleUserId) lines.push(`**Responsable** — <@${cp.responsibleUserId}>`);
  return container()
    .addTextDisplayComponents(text(`## ${REMINDER_TITLES[kind] || 'Checkpoint'}`))
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(text(lines.join('\n')));
}

/** Envoie un DM (V2). @returns {Promise<boolean>} succès. */
async function sendDM(client, userId, componentContainer) {
  if (!userId) return false;
  try {
    const user = await client.users.fetch(userId);
    await user.send({ components: [componentContainer], flags: V2, allowedMentions: { parse: [] } });
    return true;
  } catch (err) {
    log.warn('checkpoint', `DM impossible pour ${userId}`, { detail: err.message });
    return false;
  }
}

/**
 * Un cycle de vérification : à appeler périodiquement.
 * Recalcule les rappels dus, envoie le plus urgent (fusion), marque l'envoi,
 * bascule en overdue à échéance, gère les rappels de retard (max 1/jour).
 */
async function runCheckpointCycle(client) {
  const now = nowMs();
  const r = checkpointConfig.reminders;
  let dirty = false;

  for (const cp of all()) {
    if (!isActive(cp)) continue;
    if (!cp.remindersSent) cp.remindersSent = { halfway: false, approaching: false, urgent: false, deadline: false, lastOverdueReminderAt: null };

    const total = cp.deadlineAt - cp.startAt;
    if (total <= 0) continue;

    const thresholds = {
      halfway: cp.startAt + total * (r.halfwayPercentage / 100),
      approaching: cp.startAt + total * (r.approachingPercentage / 100),
      urgent: cp.deadlineAt - r.urgentHoursBeforeDeadline * 60 * 60 * 1000,
      deadline: cp.deadlineAt,
    };

    // Seuils atteints et non encore envoyés, du moins urgent au plus urgent.
    const order = ['halfway', 'approaching', 'urgent', 'deadline'];
    const due = order.filter((k) => now >= thresholds[k] && !cp.remindersSent[k]);

    let justSentDeadline = false;
    if (due.length) {
      const highest = due[due.length - 1]; // le dernier = le plus urgent (fusion)
      const ok = await sendDM(client, cp.reminderRecipientUserId, reminderContainer(cp, highest, now));
      if (ok) {
        for (const k of due) cp.remindersSent[k] = true; // marque tous les dus (dont fusionnés)
        pushHistory(cp, 'reminder_sent', 'system', { kind: highest, merged: due });
        if (due.includes('deadline')) justSentDeadline = true;
        dirty = true;
      } else {
        // Échec DM : ne rien marquer, prévenir le créateur si différent, retenter au prochain cycle.
        if (cp.createdBy && cp.createdBy !== cp.reminderRecipientUserId) {
          await sendDM(client, cp.createdBy,
            container().addTextDisplayComponents(text(`## Rappel non délivré — ${cp.id}`))
              .addSeparatorComponents(separator())
              .addTextDisplayComponents(text(`Le rappel du checkpoint **${cp.id}** (${cp.client}) n'a pas pu être envoyé au responsable (MP fermés).`)));
        }
      }
    }

    // Échéance dépassée -> statut overdue.
    if (now >= cp.deadlineAt && !TERMINAL_STATUSES.includes(cp.status) && cp.status !== 'overdue') {
      cp.status = 'overdue';
      cp.updatedAt = now;
      pushHistory(cp, 'overdue', 'system', {});
      dirty = true;
    }

    // Rappel de retard récurrent (max 1/jour), jamais dans le même cycle que le rappel d'échéance.
    if (now > cp.deadlineAt && cp.remindersSent.deadline && !justSentDeadline) {
      const last = cp.remindersSent.lastOverdueReminderAt;
      const intervalMs = r.overdueReminderIntervalHours * 60 * 60 * 1000;
      if (!last || now - last >= intervalMs) {
        const ok = await sendDM(client, cp.reminderRecipientUserId, reminderContainer(cp, 'overdue', now));
        if (ok) {
          cp.remindersSent.lastOverdueReminderAt = now;
          pushHistory(cp, 'reminder_sent', 'system', { kind: 'overdue' });
          dirty = true;
        }
      }
    }
  }

  if (dirty) save();
}

module.exports = {
  STATUS, ACTIVE_STATUSES, TERMINAL_STATUSES, PACK_LABEL,
  formatDate, relative, parseManualDate, zonedWallTimeToMs,
  all, forGuild, get, createCheckpoint, setStatus, setResponsible,
  updateDeadline, deleteCheckpoint, isActive, durationMsForPack,
  summaryContainer, remainingLabel, packLabel, runCheckpointCycle,
};
