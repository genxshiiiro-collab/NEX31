const { Events } = require('discord.js');
const log = require('../lib/logger');
const { importAndPublishLegacyReviews } = require('../lib/reviewStats');
const { syncAllOpen, cleanupLegacyStatusMessages } = require('../lib/ticketPastille');
const { db, save } = require('../storage');
const config = require('../../config');
const { startPresenceRotation } = require('../lib/presence');
const { deployCommands } = require('../lib/deployCommands');

/** Relance le staff sur les tickets restés "rouge" trop longtemps. */
async function checkRelances(client) {
  if (config.pastillesEnabled === false) return;
  if (!config.relanceAfterMinutes || config.relanceAfterMinutes <= 0) return;
  const limit = config.relanceAfterMinutes * 60 * 1000;
  const now = Date.now();

  for (const [channelId, meta] of Object.entries(db.tickets)) {
    if (meta.status !== 'waiting' || meta.relanceSent) continue;
    if (!meta.lastUserAt || now - meta.lastUserAt < limit) continue;

    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel) { delete db.tickets[channelId]; continue; }

    const staffRoleIds = channel.guild ? config.forGuild(channel.guild.id).staffRoleIds : [];
    const ping = staffRoleIds.map((r) => `<@&${r}>`).join(' ');
    await channel.send(
      `🔴 ${ping} Ce ticket attend une réponse depuis plus de **${config.relanceAfterMinutes} min**.`
    ).catch(() => {});
    meta.relanceSent = true;
  }
  save();
}

module.exports = {
  name: Events.ClientReady,
  once: true,
  execute(client) {
    log.attach(client);
    log.success('bot', `Connecté en tant que ${client.user.tag}`, { serveurs: client.guilds.cache.size });
    startPresenceRotation(client);

    if (config.deployOnStartup !== false) {
      const memberOf = [...client.guilds.cache.keys()];
      deployCommands((msg) => log.info('deploy', msg), { onlyMemberOf: memberOf })
        .catch((e) => log.error('deploy', 'Auto-deploy', e));
    }

    importAndPublishLegacyReviews(client).catch((e) => log.error('avis', 'Import/publication avis historiques', e));

    cleanupLegacyStatusMessages(client).catch((e) => log.error('pastille', 'Nettoyage bandeaux', e));
    if (config.pastillesEnabled !== false) {
      syncAllOpen(client).catch((e) => log.error('pastille', 'Sync initiale', e));
      const syncSec = config.pastilleSyncIntervalSeconds || 60;
      if (syncSec > 0) {
        log.info('pastille', `Refresh pastilles toutes les ${syncSec}s`);
        setInterval(() => syncAllOpen(client).catch((e) => log.error('pastille', 'Sync periodique', e)), syncSec * 1000);
      }
    }

    checkRelances(client).catch((e) => log.error('relance', 'checkRelances', e));
    setInterval(() => checkRelances(client).catch((e) => log.error('relance', 'checkRelances', e)), 60 * 1000);
  },
};
