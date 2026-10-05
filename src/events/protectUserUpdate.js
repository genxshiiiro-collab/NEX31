const { Events } = require('discord.js');
const impersonation = require('../lib/impersonation');
const log = require('../lib/logger');

// Changement de pseudo Discord / avatar global : contrôle sur chaque serveur commun.
module.exports = {
  name: Events.UserUpdate,
  async execute(oldUser, newUser) {
    for (const guild of newUser.client.guilds.cache.values()) {
      const member = guild.members.cache.get(newUser.id);
      if (member) await impersonation.check(member).catch((err) => log.error('protect', 'usurpation', err));
    }
  },
};
