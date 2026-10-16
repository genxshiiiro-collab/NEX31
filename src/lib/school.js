// 31 School : rôle dédié + catégorie SCHOOL privée.
// La catégorie est invisible pour @everyone, visible pour le rôle 31 School.
// Salons "lecture" : seuls le staff et le bot écrivent ; salons "discussion" : les membres écrivent.
// setup() est idempotent : relancé, il recrée ce qui manque et remet les permissions.
const { ChannelType, PermissionFlagsBits: P } = require('discord.js');
const { db, save } = require('../storage');

const ROLE_NAME = '31 School';
const ROLE_COLOR = 0xd9a94e;
const CATEGORY_NAME = 'SCHOOL';

/** @type {{ name: string, topic: string, readOnly: boolean }[]} */
const CHANNELS = [
  { name: 'annonces-school', topic: 'Annonces et nouveautés 31 School', readOnly: true },
  { name: 'ressources', topic: 'Pack Photoshop, brushes et fichiers 31 LABS', readOnly: true },
  { name: 'formation-ia', topic: 'La formation IA 31 LABS', readOnly: true },
  { name: 'nouvelles-features', topic: 'Les nouveaux outils et ressources, dès leur sortie', readOnly: true },
  { name: 'entraide', topic: 'Questions et entraide entre membres 31 School', readOnly: false },
  { name: 'vos-creations', topic: 'Partage tes créations', readOnly: false },
];

const cfgFor = (guildId) => (db.school || {})[guildId];

/** Rôles staff du serveur (config.js) : lecture et écriture partout dans SCHOOL. */
function staffRoleIds(guildId) {
  const cfg = require('../../config').forGuild(guildId) || {};
  return [...(cfg.staffRoleIds || [])].filter(Boolean);
}

function categoryOverwrites(guild, roleId) {
  const me = guild.members.me;
  return [
    { id: guild.roles.everyone.id, deny: [P.ViewChannel] },
    { id: roleId, allow: [P.ViewChannel, P.ReadMessageHistory] },
    ...staffRoleIds(guild.id).map((id) => ({ id, allow: [P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.ManageMessages] })),
    { id: me.id, allow: [P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.ManageChannels, P.EmbedLinks, P.AttachFiles] },
  ];
}

function channelOverwrites(guild, roleId, readOnly) {
  const memberPerms = readOnly
    ? { allow: [P.ViewChannel, P.ReadMessageHistory, P.AddReactions], deny: [P.SendMessages, P.CreatePublicThreads, P.CreatePrivateThreads] }
    : { allow: [P.ViewChannel, P.ReadMessageHistory, P.SendMessages, P.AttachFiles, P.EmbedLinks, P.AddReactions] };
  return categoryOverwrites(guild, roleId).map((o) => (o.id === roleId ? { id: roleId, ...memberPerms } : o));
}

/** Crée/retrouve le rôle, la catégorie et les salons, puis remet les permissions. */
async function setup(guild) {
  let role = guild.roles.cache.find((r) => r.name === ROLE_NAME && !r.managed);
  const roleCreated = !role;
  if (!role) {
    role = await guild.roles.create({ name: ROLE_NAME, color: ROLE_COLOR, hoist: true, mentionable: false, permissions: [], reason: '31 School' });
  }

  let category = guild.channels.cache.find((c) => c.type === ChannelType.GuildCategory && c.name.toUpperCase() === CATEGORY_NAME);
  if (!category) {
    category = await guild.channels.create({
      name: CATEGORY_NAME, type: ChannelType.GuildCategory, permissionOverwrites: categoryOverwrites(guild, role.id), reason: '31 School',
    });
  } else {
    await category.permissionOverwrites.set(categoryOverwrites(guild, role.id), '31 School');
  }

  const created = [];
  const channels = {};
  for (const def of CHANNELS) {
    const overwrites = channelOverwrites(guild, role.id, def.readOnly);
    let ch = guild.channels.cache.find((c) => c.type === ChannelType.GuildText && c.parentId === category.id && c.name === def.name);
    if (!ch) {
      ch = await guild.channels.create({
        name: def.name, type: ChannelType.GuildText, parent: category.id, topic: def.topic, permissionOverwrites: overwrites, reason: '31 School',
      });
      created.push(ch);
    } else {
      await ch.permissionOverwrites.set(overwrites, '31 School');
    }
    channels[def.name] = ch.id;
  }

  if (!db.school) db.school = {};
  db.school[guild.id] = { roleId: role.id, categoryId: category.id, channels };
  save();
  return { role, roleCreated, category, created, total: CHANNELS.length };
}

/** Donne ou retire le rôle 31 School. */
async function setMember(guild, member, give) {
  const cfg = cfgFor(guild.id);
  if (!cfg) throw new Error('31 School n\'est pas configurée : lance /school setup.');
  if (give) await member.roles.add(cfg.roleId, '31 School : accès donné');
  else await member.roles.remove(cfg.roleId, '31 School : accès retiré');
  return cfg.roleId;
}

module.exports = { setup, setMember, cfgFor, ROLE_NAME, CATEGORY_NAME, CHANNELS };
