const { Events } = require('discord.js');
const { onAuditEntry } = require('../lib/antiNuke');
const log = require('../lib/logger');

// Anti-nuke : chaque entrée du journal d'audit (intent GuildModeration + permission
// "Voir les logs du serveur" requis).
module.exports = {
  name: Events.GuildAuditLogEntryCreate,
  execute: (entry, guild) => onAuditEntry(entry, guild).catch((err) => log.error('protect', 'anti-nuke', err)),
};
