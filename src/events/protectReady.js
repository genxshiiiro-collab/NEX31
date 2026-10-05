const { Events } = require('discord.js');
const antiPhishing = require('../lib/antiPhishing');
const backup = require('../lib/backup');
const log = require('../lib/logger');

// Démarrage de la protection : membres en cache (usurpation), listes de
// phishing, sauvegarde quotidienne.
module.exports = {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    for (const guild of client.guilds.cache.values()) {
      await guild.members.fetch().catch((err) => log.warn('protect', `Membres non chargés : ${guild.name}`, { detail: err.message }));
    }
    antiPhishing.start();
    backup.startSchedule(client);
  },
};
