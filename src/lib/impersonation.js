// Anti-usurpation en direct : un non-staff qui prend le pseudo (ou l'avatar)
// d'un membre du staff, à l'arrivée ou en changeant de profil, voit son pseudo
// serveur réinitialisé, est rendu muet 1 h, et les propriétaires sont alertés.
const config = require('../../config');
const { isStaff } = require('./helpers');
const { securityAlert } = require('./alert');

const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', '@': 'a', $: 's' };
const normalize = (name) => (name || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .replace(/[013457@$]/g, (c) => LEET[c])
  .replace(/l/g, 'i') // l et I se confondent à l'écran
  .replace(/[^a-z]/g, '');

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

const namesOf = (member) => [member.user.username, member.user.globalName, member.nickname].filter(Boolean);
const handled = new Map(); // "guildId:userId" -> profil déjà traité

/** Membre du staff copié par ce profil, ou null. */
function copiedStaff(member) {
  const mine = namesOf(member).map(normalize).filter((n) => n.length >= 4);
  for (const staff of member.guild.members.cache.values()) {
    if (staff.id === member.id || staff.user.bot || !isStaff(staff)) continue;
    if (member.user.avatar && member.user.avatar === staff.user.avatar) return { staff, how: 'même avatar' };
    for (const theirs of namesOf(staff).map(normalize).filter((n) => n.length >= 4)) {
      if (mine.some((n) => n === theirs || (n.length >= 6 && levenshtein(n, theirs) <= 1))) return { staff, how: 'pseudo copié' };
    }
  }
  return null;
}

async function check(member) {
  if (config.protect?.impersonation?.enabled === false) return;
  if (member.user.bot || isStaff(member)) return;
  const hit = copiedStaff(member);
  if (!hit) return;

  const key = `${member.guild.id}:${member.id}`;
  const profile = `${namesOf(member).join('|')}|${member.user.avatar}`;
  if (handled.get(key) === profile) return;
  handled.set(key, profile);

  const before = member.displayName;
  await member.setNickname('Pseudo modéré', 'Usurpation du staff').catch(() => {});
  await member.timeout(60 * 60e3, `Usurpation de ${hit.staff.user.tag}`).catch(() => {});
  await securityAlert(member.guild, {
    level: 'warn',
    title: 'Usurpation du staff bloquée',
    fields: [
      { name: 'Compte', value: `<@${member.id}> (${member.user.tag}, \`${member.id}\`)` },
      { name: 'Imite', value: `<@${hit.staff.id}> — ${hit.how} (« ${before} »)` },
      { name: 'Action', value: "Pseudo réinitialisé, muet 1 h. `/gban add` si c'est un arnaqueur." },
    ],
  });
}

async function onUpdate(oldMember, newMember) {
  const changed = oldMember.partial
    || oldMember.nickname !== newMember.nickname
    || oldMember.user.username !== newMember.user.username
    || oldMember.user.globalName !== newMember.user.globalName
    || oldMember.user.avatar !== newMember.user.avatar;
  if (changed) await check(newMember);
}

module.exports = { check, onUpdate };
