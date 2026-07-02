// File de renommage — secours quand setName() direct est rate-limité par Discord.
// Limite : 2 renommages / 10 min / salon.

const log = require('./logger');

const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 2;

const state = new Map();

function parseRetryAfter(err) {
  const ms = err?.rawError?.retry_after ?? err?.retryAfter ?? err?.data?.retry_after;
  if (typeof ms === 'number' && ms > 0) return Math.ceil(ms * 1000);
  if (err?.status === 429 || err?.code === 429 || err?.code === 500429) return 15_000;
  return 0;
}

const SET_NAME_TIMEOUT_MS = 12_000;

function withTimeout(promise, ms, label = 'operation') {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timeout (${ms}ms)`)), ms);
    }),
  ]);
}

/** Renomme un salon avec timeout + secours REST si le gateway ne répond pas. */
async function setChannelNameSafe(channel, name, reason = 'Pastille ticket') {
  const trimmed = String(name).slice(0, 100);
  try {
    return await withTimeout(channel.setName(trimmed, reason), SET_NAME_TIMEOUT_MS, 'setName');
  } catch (err) {
    const rest = channel.client?.rest;
    if (!rest || (err.status !== 429 && err.code !== 429 && !/timeout/i.test(err.message))) throw err;
    const { Routes } = require('discord.js');
    const updated = await withTimeout(
      rest.patch(Routes.channel(channel.id), { body: { name: trimmed } }),
      SET_NAME_TIMEOUT_MS,
      'REST rename',
    );
    if (updated?.name) channel.name = updated.name;
    return updated;
  }
}

function getState(channelId) {
  if (!state.has(channelId)) {
    state.set(channelId, { desired: null, applied: null, history: [], timer: null, inFlight: false });
  }
  return state.get(channelId);
}

function recordSuccessfulRename(channelId, name) {
  const s = getState(channelId);
  s.history.push(Date.now());
  s.applied = name;
  s.desired = name;
}

function slotFreeIn(s) {
  const now = Date.now();
  s.history = s.history.filter((t) => now - t < WINDOW_MS);
  if (s.history.length < MAX_PER_WINDOW) return 0;
  const oldest = Math.min(...s.history);
  return Math.max(0, WINDOW_MS - (now - oldest)) + 500;
}

function scheduleReconcile(channel, delayMs) {
  const s = getState(channel.id);
  if (s.timer) clearTimeout(s.timer);
  s.timer = setTimeout(() => {
    s.timer = null;
    reconcile(channel);
  }, delayMs);
}

async function applyName(channel, name) {
  const s = getState(channel.id);
  try {
    const updated = await setChannelNameSafe(channel, name);
    recordSuccessfulRename(channel.id, name);
    if (updated?.name) channel.name = updated.name;
    else channel.name = name;
    log.info('pastille', `File → ${name}`, { id: channel.id });
  } catch (err) {
    const retryMs = parseRetryAfter(err);
    if (retryMs > 0) scheduleReconcile(channel, retryMs);
    else log.warn('rename', 'File échouée', { id: channel.id, detail: err.message });
  }
}

function reconcile(channel) {
  const s = getState(channel.id);
  if (!s.desired || s.inFlight) return;

  if (channel.name === s.desired) {
    s.applied = s.desired;
    if (s.timer) { clearTimeout(s.timer); s.timer = null; }
    return;
  }

  const wait = slotFreeIn(s);
  if (wait > 0) {
    scheduleReconcile(channel, wait);
    return;
  }

  if (s.timer) { clearTimeout(s.timer); s.timer = null; }

  s.inFlight = true;
  applyName(channel, s.desired).finally(() => {
    s.inFlight = false;
    reconcile(channel);
  });
}

function requestRenameImmediate(channel, desiredName) {
  const s = getState(channel.id);
  s.desired = String(desiredName).slice(0, 100);
  if (channel.name === s.desired) {
    s.applied = s.desired;
    return;
  }
  reconcile(channel);
}

function requestRename(channel, desiredName) {
  requestRenameImmediate(channel, desiredName);
}

function resetChannel(channelId) {
  const s = state.get(channelId);
  if (!s) return;
  if (s.timer) clearTimeout(s.timer);
  state.delete(channelId);
}

module.exports = {
  requestRename,
  requestRenameImmediate,
  recordSuccessfulRename,
  parseRetryAfter,
  setChannelNameSafe,
  resetChannel,
};
