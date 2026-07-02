// Pastilles ticket — nom du salon uniquement (🔴/🟢-pseudo).
// Source de verite : dernier message humain du ticket (sync + messageCreate).

const config = require('../../config');
const { db, save } = require('../storage');
const { isStaff, isStaffMember, isTicketChannel, stripPastille, slugifyName } = require('./helpers');
const { requestRenameImmediate, recordSuccessfulRename, parseRetryAfter, setChannelNameSafe } = require('./renameQueue');
const log = require('./logger');

function pastillesEnabled() {
  return config.pastillesEnabled !== false;
}

const WAITING = 'waiting';
const ANSWERED = 'answered';

function emojiForStatus(status) {
  return status === ANSWERED ? config.emoji.answered : config.emoji.waiting;
}

function normalizeStatus(status) {
  return status === ANSWERED ? ANSWERED : WAITING;
}

function ticketSlug(meta, channel) {
  if (meta?.nameSlug) return meta.nameSlug;
  if (meta?.ownerName) return slugifyName(meta.ownerName);
  return slugifyName(stripPastille(channel?.name || ''));
}

function buildTicketName(meta, channel) {
  const status = normalizeStatus(meta?.status);
  return `${emojiForStatus(status)}-${ticketSlug(meta, channel)}`;
}

function pastilleFromChannelName(name) {
  if (!name) return null;
  if (name.startsWith(config.emoji.answered)) return ANSWERED;
  if (name.startsWith(config.emoji.waiting)) return WAITING;
  return null;
}

function ensureMeta(channel, guildId, defaults = {}) {
  let meta = db.tickets[channel.id];
  if (!meta) {
    meta = {
      guildId,
      ownerId: defaults.ownerId || null,
      ownerName: defaults.ownerName || stripPastille(channel.name) || channel.name,
      nameSlug: defaults.nameSlug || slugifyName(defaults.ownerName || stripPastille(channel.name)),
      status: WAITING,
      lastUserAt: Date.now(),
      relanceSent: false,
      closed: false,
    };
    db.tickets[channel.id] = meta;
  } else {
    if (!meta.guildId) meta.guildId = guildId;
    if (!meta.nameSlug) meta.nameSlug = slugifyName(meta.ownerName || stripPastille(channel.name));
    if (meta.status == null) meta.status = WAITING;
  }
  return meta;
}

/** Lit les derniers messages du ticket pour savoir qui a parle en dernier. */
async function inferStatusFromHistory(channel) {
  const batch = await channel.messages.fetch({ limit: 30 }).catch(() => null);
  if (!batch?.size) return null;

  const last = [...batch.values()]
    .filter((m) => !m.author.bot)
    .sort((a, b) => b.createdTimestamp - a.createdTimestamp)[0];
  if (!last) return null;

  const staff = await isStaffMember(channel.guild, last.author.id, last.member);
  return staff ? ANSWERED : WAITING;
}

async function syncChannelName(channel, meta) {
  if (!channel || !meta || meta.closed) return false;

  const expected = buildTicketName(meta, channel);
  if (channel.name === expected) return false;

  try {
    const updated = await setChannelNameSafe(channel, expected, 'Pastille ticket');
    recordSuccessfulRename(channel.id, expected);
    channel.name = updated?.name || expected;
    log.info('pastille', `Renomme: ${expected}`, { id: channel.id });
    return true;
  } catch (err) {
    const retryMs = parseRetryAfter(err);
    requestRenameImmediate(channel, expected);
    log.warn('pastille', retryMs > 0
      ? `Rate limit ${Math.ceil(retryMs / 1000)}s - file: ${expected}`
      : `Echec: ${err.message}`, { id: channel.id, voulu: expected });
    return false;
  }
}

/** Met a jour le statut selon l'auteur (message ou interaction). */
async function applyStatusForUser(channel, guild, userId, memberHint = null) {
  if (!channel?.id || !guild || !userId) return;

  const staff = await isStaffMember(guild, userId, memberHint);
  const meta = ensureMeta(channel, guild.id, {
    ownerId: staff ? undefined : userId,
    ownerName: memberHint?.displayName || memberHint?.user?.username,
    nameSlug: memberHint ? slugifyName(memberHint.displayName || memberHint.user?.username) : undefined,
  });

  if (!meta.ownerId && !staff) {
    meta.ownerId = userId;
    meta.ownerName = memberHint?.displayName || memberHint?.user?.username || meta.ownerName;
    meta.nameSlug = slugifyName(meta.ownerName);
  }

  const newStatus = staff ? ANSWERED : WAITING;
  if (newStatus === WAITING) {
    meta.lastUserAt = Date.now();
    meta.relanceSent = false;
  }
  meta.status = newStatus;
  save();

  await syncChannelName(channel, meta);
}

async function updateFromMessage(message) {
  if (!pastillesEnabled()) return;
  if (message.author.bot || !message.guild) return;
  const channel = message.channel?.partial
    ? await message.channel.fetch().catch(() => message.channel)
    : message.channel;
  if (!isTicketChannel(channel)) return;

  await applyStatusForUser(channel, message.guild, message.author.id, message.member);
}

async function applyPastilleFromInteraction(interaction) {
  if (!pastillesEnabled()) return;
  if (!interaction.guild || !interaction.channel || interaction.user?.bot) return;
  if (!isTicketChannel(interaction.channel)) return;
  await applyStatusForUser(
    interaction.channel,
    interaction.guild,
    interaction.user.id,
    interaction.member,
  );
}

async function syncFromMeta(channel, meta) {
  if (!pastillesEnabled()) return;
  if (!meta?.nameSlug) meta.nameSlug = slugifyName(meta.ownerName || stripPastille(channel?.name));
  await syncChannelName(channel, meta);
}

async function cleanupLegacyStatusMessages(client) {
  let cleaned = 0;
  for (const [channelId, meta] of Object.entries(db.tickets)) {
    if (!meta.statusMsgId) continue;
    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (channel) await channel.messages.delete(meta.statusMsgId).catch(() => {});
    delete meta.statusMsgId;
    cleaned += 1;
  }
  if (cleaned > 0) save();
}

/** Refresh complet : lit l'historique Discord + corrige le nom. */
async function syncAllOpen(client) {
  if (!pastillesEnabled()) return;
  let fixed = 0;
  let dirty = false;
  for (const [channelId, meta] of Object.entries(db.tickets)) {
    if (meta.closed) continue;

    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel?.guild) {
      if (!channel) delete db.tickets[channelId];
      continue;
    }

    if (!meta.nameSlug) {
      meta.nameSlug = slugifyName(meta.ownerName || stripPastille(channel.name));
      dirty = true;
    }

    const inferred = await inferStatusFromHistory(channel);
    if (inferred && inferred !== meta.status) {
      meta.status = inferred;
      dirty = true;
    }

    const expected = buildTicketName(meta, channel);
    if (channel.name !== expected) {
      const ok = await syncChannelName(channel, meta);
      if (ok) fixed += 1;
    }
  }
  if (dirty) save();
  if (fixed > 0) log.info('pastille', `Refresh: ${fixed} salon(s) corrige(s)`);
}

module.exports = {
  pastillesEnabled,
  WAITING,
  ANSWERED,
  buildTicketName,
  pastilleFromChannelName,
  updateFromMessage,
  applyPastilleFromInteraction,
  syncFromMeta,
  syncAllOpen,
  cleanupLegacyStatusMessages,
  inferStatusFromHistory,
};
