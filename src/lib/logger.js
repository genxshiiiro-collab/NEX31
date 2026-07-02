// Backend de logs : console structuree + evenements Discord (salon logs).
const config = require('../../config');
const { V2, container, text, separator, fieldsText } = require('./components');

const RESET = '\x1b[0m';
const DIM = '\x1b[2m';

const LEVELS = {
  debug:   { tag: 'DEBUG', ansi: '\x1b[90m', color: 0x95a5a6 },
  info:    { tag: 'INFO ', ansi: '\x1b[36m', color: 0x3498db },
  success: { tag: 'OK   ', ansi: '\x1b[32m', color: 0x2ecc71 },
  warn:    { tag: 'WARN ', ansi: '\x1b[33m', color: 0xf39c12 },
  error:   { tag: 'ERROR', ansi: '\x1b[31m', color: 0xe74c3c },
};

let clientRef = null;
const queues = new Map();

/** Retire les emoji des messages de log (console + Discord). */
function stripLogEmojis(str) {
  if (str == null) return '';
  return String(str)
    .replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{200D}]/gu, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function attach(client) {
  clientRef = client;
}

function now() {
  return new Date().toLocaleString('fr-FR', { hour12: false });
}

function toConsole(level, scope, message, data) {
  const lvl = LEVELS[level] || LEVELS.info;
  const head = `${DIM}[${now()}]${RESET} ${lvl.ansi}${lvl.tag}${RESET} ${DIM}[${scope}]${RESET}`;
  const extra = data && Object.keys(data).length
    ? ` ${DIM}${safeInline(data)}${RESET}`
    : '';
  const line = `${head} ${stripLogEmojis(message)}${extra}`;
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

function safeInline(data) {
  try {
    return Object.entries(data)
      .map(([k, v]) => `${k}=${typeof v === 'string' ? stripLogEmojis(v) : JSON.stringify(v)}`)
      .join(' ');
  } catch {
    return '';
  }
}

function logLine(level, scope, message, data) {
  toConsole(level, scope, message, data);
}

const info = (scope, msg, data) => logLine('info', scope, msg, data);
const success = (scope, msg, data) => logLine('success', scope, msg, data);
const warn = (scope, msg, data) => logLine('warn', scope, msg, data);
const debug = (scope, msg, data) => { if (config.debugLogs) logLine('debug', scope, msg, data); };
const error = (scope, msg, err) => {
  const detail = err instanceof Error ? err.stack || err.message : err;
  logLine('error', scope, msg, detail ? { detail: stripLogEmojis(detail) } : undefined);
};

function event(guildOrId, opts) {
  const guildId = typeof guildOrId === 'string' ? guildOrId : guildOrId?.id;
  const level = opts.level || 'info';
  const lvl = LEVELS[level] || LEVELS.info;
  const title = stripLogEmojis(opts.title || 'Evenement');

  logLine(level, opts.scope || 'event', title, opts.data);

  if (!clientRef || !guildId) return;
  const logChannelId = config.forGuild(guildId).logChannelId;
  if (!logChannelId || logChannelId.startsWith('ID_')) return;

  const c = container(lvl.color)
    .addTextDisplayComponents(text(`## ${title}`));
  if (opts.description) c.addTextDisplayComponents(text(stripLogEmojis(opts.description)));
  if (opts.fields?.length) {
    c.addSeparatorComponents(separator())
      .addTextDisplayComponents(text(fieldsText(opts.fields.slice(0, 25))));
  }
  c.addSeparatorComponents(separator())
    .addTextDisplayComponents(text(`-# ${opts.footer || `Log - ${lvl.tag.trim()}`} - ${now()}`));

  enqueue(logChannelId, c);
}

function enqueue(channelId, component) {
  let q = queues.get(channelId);
  if (!q) { q = { items: [], running: false }; queues.set(channelId, q); }
  q.items.push(component);
  if (!q.running) drain(channelId).catch(() => {});
}

async function drain(channelId) {
  const q = queues.get(channelId);
  if (!q || q.running) return;
  q.running = true;
  try {
    const channel = await clientRef.channels.fetch(channelId).catch(() => null);
    if (!channel) { q.items = []; q.running = false; return; }
    while (q.items.length) {
      const batch = q.items.splice(0, 10);
      await channel.send({ components: batch, flags: V2, allowedMentions: { parse: [] } }).catch((e) => {
        logLine('warn', 'logger', 'Envoi log Discord impossible', { detail: e.message });
      });
      if (q.items.length) await sleep(750);
    }
  } finally {
    q.running = false;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = { attach, info, success, warn, error, debug, event, LEVELS, stripLogEmojis };
