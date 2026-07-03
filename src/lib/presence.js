const { ActivityType } = require('discord.js');
const config = require('../../config');
const log = require('./logger');

const TYPE_MAP = {
  Playing: ActivityType.Playing,
  Watching: ActivityType.Watching,
  Listening: ActivityType.Listening,
  Competing: ActivityType.Competing,
};

function defaultActivities() {
  return [
    { name: '.gg/thirty1', type: 'Watching' },
    { name: 'Best graphics server : thirty1', type: 'Playing' },
    { name: 'Logos • Bannières • Affiches', type: 'Watching' },
    { name: 'ThirtyOne Lab\'s — design pro', type: 'Playing' },
    { name: 'Rejoins-nous 👉 .gg/thirty1', type: 'Watching' },
    { name: 'Créations graphiques sur mesure', type: 'Playing' },
    { name: 'Premium visuals 🎨', type: 'Watching' },
    { name: '/panel pour commander', type: 'Playing' },
    { name: 'Ton identité visuelle, notre passion', type: 'Watching' },
    { name: 'discord.gg/thirty1', type: 'Playing' },
  ];
}

function normalizeActivities(list) {
  const source = list?.length ? list : defaultActivities();
  return source
    .filter((a) => a?.name)
    .map((a) => ({
      name: String(a.name).slice(0, 128),
      type: TYPE_MAP[a.type] ?? ActivityType.Watching,
    }));
}

/** Fait tourner le statut Discord du bot (sous le nom, pas la bio profil). */
function startPresenceRotation(client) {
  const cfg = config.presenceRotation || {};
  const activities = normalizeActivities(cfg.activities);
  if (!activities.length) return;

  const intervalMs = Math.max(15, cfg.intervalSeconds || 45) * 1000;
  let index = 0;

  const tick = () => {
    const current = activities[index % activities.length];
    index += 1;
    client.user.setPresence({
      activities: [{ name: current.name, type: current.type }],
      status: 'online',
    }).catch((err) => log.warn('presence', 'Mise a jour statut', { detail: err.message }));
  };

  tick();
  setInterval(tick, intervalMs);
  log.info('presence', `Statut rotatif : ${activities.length} messages / ${intervalMs / 1000}s`);
}

module.exports = { startPresenceRotation, defaultActivities };
