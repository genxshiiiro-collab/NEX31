// Sauvegarde serveur : photo quotidienne des rôles, salons, permissions et des
// rôles de chaque membre (data/backups/<serveur>/<date>.json, 7 gardées).
// La restauration recrée ce qui manque (rôles, catégories, salons, permissions)
// et redonne les rôles recréés aux membres qui les avaient. Elle ne supprime rien.
const fs = require('fs');
const path = require('path');
const { ChannelType, OverwriteType } = require('discord.js');
const config = require('../../config');
const log = require('./logger');

const ROOT = path.join(__dirname, '..', '..', 'data', 'backups');
const DAY = 86400e3;
const keep = () => config.protect?.backup?.keep || 7;
const dirOf = (guildId) => path.join(ROOT, guildId);

function list(guildId) {
  try {
    return fs.readdirSync(dirOf(guildId)).filter((f) => f.endsWith('.json')).sort().reverse();
  } catch {
    return [];
  }
}

async function snapshot(guild) {
  const members = await guild.members.fetch().catch(() => guild.members.cache);
  const data = {
    at: new Date().toISOString(),
    guild: { id: guild.id, name: guild.name },
    roles: guild.roles.cache.filter((r) => !r.managed && r.id !== guild.id)
      .map((r) => ({ id: r.id, name: r.name, color: r.color, hoist: r.hoist, mentionable: r.mentionable, permissions: r.permissions.bitfield.toString(), position: r.position })),
    channels: guild.channels.cache.filter((c) => !c.isThread())
      .map((c) => ({
        id: c.id, name: c.name, type: c.type, parentId: c.parentId, position: c.rawPosition,
        topic: c.topic || null, nsfw: Boolean(c.nsfw), rateLimitPerUser: c.rateLimitPerUser || 0,
        bitrate: c.bitrate || null, userLimit: c.userLimit || null,
        overwrites: c.permissionOverwrites.cache.map((o) => ({ id: o.id, type: o.type, allow: o.allow.bitfield.toString(), deny: o.deny.bitfield.toString() })),
      })),
    memberRoles: Object.fromEntries(members.filter((m) => !m.user.bot)
      .map((m) => [m.id, m.roles.cache.filter((r) => !r.managed && r.id !== guild.id).map((r) => r.id)])),
  };

  fs.mkdirSync(dirOf(guild.id), { recursive: true });
  const file = `${data.at.slice(0, 10)}.json`;
  fs.writeFileSync(path.join(dirOf(guild.id), file), JSON.stringify(data));
  for (const old of list(guild.id).slice(keep())) fs.rmSync(path.join(dirOf(guild.id), old), { force: true });
  return { file, roles: data.roles.length, channels: data.channels.length, members: Object.keys(data.memberRoles).length };
}

async function restore(guild, file) {
  const data = JSON.parse(fs.readFileSync(path.join(dirOf(guild.id), path.basename(file)), 'utf8'));
  const roleMap = new Map([[guild.id, guild.id]]);
  const created = { roles: [], channels: 0, reassigned: 0 };

  // 1. Rôles (du plus bas au plus haut pour garder l'ordre relatif).
  for (const r of [...data.roles].sort((a, b) => a.position - b.position)) {
    const existing = guild.roles.cache.get(r.id) || guild.roles.cache.find((x) => x.name === r.name && !x.managed);
    if (existing) { roleMap.set(r.id, existing.id); continue; }
    const role = await guild.roles.create({
      name: r.name, color: r.color, hoist: r.hoist, mentionable: r.mentionable, permissions: BigInt(r.permissions), reason: 'Restauration de sauvegarde',
    }).catch((e) => log.warn('backup', `Rôle ${r.name}`, { detail: e.message }));
    if (role) { roleMap.set(r.id, role.id); created.roles.push({ old: r.id, role, position: r.position }); }
  }
  if (created.roles.length) {
    await guild.roles.setPositions(created.roles.map((c) => ({ role: c.role.id, position: c.position }))).catch(() => {});
  }

  // 2. Catégories d'abord, puis salons, avec leurs permissions.
  const channelMap = new Map();
  const mapOverwrites = (ows) => ows
    .map((o) => ({ id: o.type === OverwriteType.Role ? roleMap.get(o.id) : o.id, type: o.type, allow: BigInt(o.allow), deny: BigInt(o.deny) }))
    .filter((o) => o.id);
  const isCat = (c) => (c.type === ChannelType.GuildCategory ? 0 : 1);
  for (const c of [...data.channels].sort((a, b) => isCat(a) - isCat(b))) {
    const existing = guild.channels.cache.get(c.id) || guild.channels.cache.find((x) => x.name === c.name && x.type === c.type);
    if (existing) { channelMap.set(c.id, existing.id); continue; }
    const ch = await guild.channels.create({
      name: c.name, type: c.type, topic: c.topic || undefined, nsfw: c.nsfw, rateLimitPerUser: c.rateLimitPerUser || undefined,
      bitrate: c.bitrate || undefined, userLimit: c.userLimit || undefined,
      parent: c.parentId ? channelMap.get(c.parentId) : undefined,
      position: c.position, permissionOverwrites: mapOverwrites(c.overwrites), reason: 'Restauration de sauvegarde',
    }).catch((e) => log.warn('backup', `Salon ${c.name}`, { detail: e.message }));
    if (ch) { channelMap.set(c.id, ch.id); created.channels += 1; }
  }

  // 3. Rôles recréés : redonnés aux membres qui les avaient.
  for (const { old, role } of created.roles) {
    for (const [userId, roles] of Object.entries(data.memberRoles)) {
      if (!roles.includes(old)) continue;
      const member = await guild.members.fetch(userId).catch(() => null);
      if (await member?.roles.add(role, 'Restauration de sauvegarde').catch(() => null)) created.reassigned += 1;
    }
  }
  return { roles: created.roles.length, channels: created.channels, reassigned: created.reassigned, at: data.at };
}

/** Sauvegarde quotidienne de chaque serveur (au démarrage si la dernière a plus de 20 h). */
function startSchedule(client) {
  const run = async (force) => {
    for (const guild of client.guilds.cache.values()) {
      const last = list(guild.id)[0];
      const age = last ? Date.now() - fs.statSync(path.join(dirOf(guild.id), last)).mtimeMs : Infinity;
      if (!force && age < 20 * 3600e3) continue;
      await snapshot(guild).then((r) => log.info('backup', `${guild.name} : ${r.file}`))
        .catch((e) => log.warn('backup', `Sauvegarde impossible : ${guild.name}`, { detail: e.message }));
    }
  };
  run(false);
  setInterval(() => run(true), DAY).unref();
}

module.exports = { snapshot, restore, list, startSchedule };
