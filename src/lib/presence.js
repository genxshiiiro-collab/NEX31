const { ActivityType } = require('discord.js');
const config = require('../../config');
const log = require('./logger');

const TYPE_MAP = {
  Playing: ActivityType.Playing,
  Watching: ActivityType.Watching,
  Listening: ActivityType.Listening,
  Competing: ActivityType.Competing,
  Custom: ActivityType.Custom,
};

function defaultActivities() {
  return [
    { name: '.gg/thirty1', type: 'Watching' },
    { name: 'Best graphics server : thirty1', type: 'Playing' },
    { name: 'discord.gg/thirty1', type: 'Watching' },
    { name: 'Logos • Bannières • Affiches', type: 'Playing' },
    { name: 'ThirtyOne Lab\'s — design pro', type: 'Watching' },
    { name: '/panel pour commander', type: 'Playing' },
  ];
}

function normalizeActivities(list) {
  const source = list?.length ? list : defaultActivities();
  return source
    .filter((a) => a?.name)
    .map((a) => {
      const type = TYPE_MAP[a.type] ?? ActivityType.Watching;
      const label = String(a.name).slice(0, 128);
      if (type === ActivityType.Custom) {
        return { type, name: 'Custom Status', state: label, label };
      }
      return { type, name: label, label };
    });
}

function typeLabel(type) {
  if (type === ActivityType.Playing) return 'Joue a';
  if (type === ActivityType.Listening) return 'Ecoute';
  if (type === ActivityType.Competing) return 'En competition';
  if (type === ActivityType.Custom) return 'Statut';
  return 'Regarde';
}

async function applyActivity(client, current) {
  if (current.type === ActivityType.Custom) {
    await client.user.setPresence({
      activities: [{
        name: current.name,
        type: ActivityType.Custom,
        state: current.state,
      }],
      status: 'online',
    });
  } else {
    await client.user.setActivity(current.name, { type: current.type });
  }
}

/** Statut Discord rotatif (sous le nom du bot dans la liste des membres). */
function startPresenceRotation(client) {
  const cfg = config.presenceRotation || {};
  if (cfg.enabled === false) return;

  const activities = normalizeActivities(cfg.activities);
  if (!activities.length) return;

  const intervalMs = Math.max(15, cfg.intervalSeconds || 30) * 1000;
  const startDelayMs = Math.max(0, cfg.startDelaySeconds ?? 5) * 1000;
  let index = 0;
  let running = false;

  const tick = async () => {
    if (running || !client.user) return;
    running = true;
    const current = activities[index % activities.length];
    index += 1;
    try {
      await applyActivity(client, current);
      console.log(`[presence] OK ${typeLabel(current.type)} ${current.label}`);
    } catch (err) {
      console.error(`[presence] ECHEC "${current.label}":`, err.message || err);
      if (current.type === ActivityType.Custom) {
        try {
          await client.user.setActivity(current.label, { type: ActivityType.Watching });
          console.log(`[presence] OK fallback Regarde ${current.label}`);
        } catch (e) {
          console.error('[presence] ECHEC fallback:', e.message || e);
        }
      }
    } finally {
      running = false;
    }
  };

  console.log(`[presence] Demarrage dans ${startDelayMs / 1000}s — ${activities.length} messages / ${intervalMs / 1000}s`);
  log.info('presence', `Statut rotatif : ${activities.length} messages / ${intervalMs / 1000}s`);

  setTimeout(() => {
    tick();
    setInterval(tick, intervalMs);
  }, startDelayMs);
}

module.exports = { startPresenceRotation, defaultActivities };
