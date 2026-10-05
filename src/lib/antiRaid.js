// Anti-raid : trop d'arrivées en peu de temps = serveur verrouillé, arrivants
// du raid bannis (bannissement local), alerte aux propriétaires. Pendant
// RAID_WINDOW_MS après la détection, tout nouvel arrivant est aussi banni.
const config = require('../../config');
const lockdown = require('./lockdown');
const { securityAlert } = require('./alert');

const RAID_WINDOW_MS = 10 * 60e3;
const recent = new Map();    // guildId -> [{ id, at }]
const raidUntil = new Map(); // guildId -> timestamp

const settings = () => ({ joins: 8, seconds: 15, banJoiners: true, ...(config.protect?.raid || {}) });

const banRaider = (guild, id) => guild.members.ban(id, { reason: 'Anti-raid', deleteMessageSeconds: 3600 }).then(() => true).catch(() => false);

async function onJoin(member) {
  if (member.user.bot) return;
  const { guild } = member;
  const { joins, seconds, banJoiners } = settings();
  const now = Date.now();

  if ((raidUntil.get(guild.id) || 0) > now) {
    if (banJoiners) await banRaider(guild, member.id);
    return;
  }

  const list = (recent.get(guild.id) || []).filter((j) => now - j.at < seconds * 1000);
  list.push({ id: member.id, at: now });
  recent.set(guild.id, list);
  if (list.length < joins) return;

  recent.set(guild.id, []);
  raidUntil.set(guild.id, now + RAID_WINDOW_MS);
  const reason = `Raid détecté : ${list.length} arrivées en ${seconds} s`;
  await lockdown.lock(guild, reason);

  let banned = 0;
  if (banJoiners) for (const j of list) if (await banRaider(guild, j.id)) banned += 1;

  await securityAlert(guild, {
    title: 'Raid détecté — serveur verrouillé',
    description: `${reason}. Invitations coupées, salons en lecture seule.`,
    fields: [
      { name: 'Arrivants bannis', value: banJoiners ? `${banned}/${list.length}` : 'non (banJoiners désactivé)' },
      { name: 'Ensuite', value: 'Les arrivants des 10 prochaines minutes sont bannis aussi. `/lockdown off` pour rouvrir.' },
    ],
  });
}

module.exports = { onJoin };
