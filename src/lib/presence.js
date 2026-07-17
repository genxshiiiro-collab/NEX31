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
    // — Marque / invitation
    { name: '.gg/thirty1', type: 'Watching' },
    { name: 'discord.gg/thirty1', type: 'Watching' },
    { name: 'ThirtyOne Lab\'s — design pro', type: 'Watching' },
    { name: 'Best graphics server : thirty1', type: 'Playing' },
    { name: 'ThirtyOne Studio', type: 'Watching' },
    { name: 'ThirtyOne Creative Lab', type: 'Watching' },

    // — Prestations
    { name: 'Logos • Bannières • Affiches', type: 'Playing' },
    { name: 'Loading Screens', type: 'Playing' },
    { name: 'UI • HUD • Interfaces', type: 'Playing' },
    { name: 'Overlays & Alertes', type: 'Playing' },
    { name: 'Habillage TikTok / YouTube', type: 'Playing' },
    { name: 'Motion Design', type: 'Playing' },
    { name: 'Visuels animés', type: 'Playing' },
    { name: 'Branding FiveM', type: 'Playing' },
    { name: 'Branding Discord', type: 'Playing' },
    { name: 'Identité visuelle', type: 'Playing' },
    { name: 'Direction artistique', type: 'Playing' },
    { name: 'UI / UX Design', type: 'Playing' },

    // — Process / accroches
    { name: 'Designing premium brands', type: 'Playing' },
    { name: 'Creating visual identities', type: 'Playing' },
    { name: 'Turning ideas into visuals', type: 'Playing' },
    { name: 'Building your project', type: 'Playing' },
    { name: 'Chaque pixel compte', type: 'Playing' },
    { name: 'Qualité avant quantité', type: 'Playing' },
    { name: 'Design Beyond Limits', type: 'Playing' },
    { name: 'Where Brands Begin', type: 'Playing' },

    // — Outils
    { name: 'Photoshop', type: 'Playing' },
    { name: 'After Effects', type: 'Playing' },
    { name: 'Illustrator', type: 'Playing' },
    { name: 'Figma', type: 'Playing' },

    // — Appels à l'action / statut boutique
    { name: '/panel pour commander', type: 'Playing' },
    { name: 'Commandes ouvertes', type: 'Watching' },
    { name: 'Support disponible', type: 'Watching' },
    { name: '48h de délais', type: 'Playing' },
    { name: 'les nouveaux projets', type: 'Watching' },
    { name: 'les avis clients ⭐', type: 'Watching' },
    { name: 'vos futures créations', type: 'Watching' },
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
