const { Events } = require('discord.js');
const impersonation = require('../lib/impersonation');
const log = require('../lib/logger');

// Changement de pseudo serveur / avatar : contrôle d'usurpation du staff.
module.exports = {
  name: Events.GuildMemberUpdate,
  execute: (oldMember, newMember) => impersonation.onUpdate(oldMember, newMember)
    .catch((err) => log.error('protect', 'usurpation', err)),
};
