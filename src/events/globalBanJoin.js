const { Events } = require('discord.js');
const { onJoin } = require('../lib/globalBan');
const log = require('../lib/logger');

// Ban global : rebannit un compte blacklisté et repère les alts à l'arrivée.
module.exports = {
  name: Events.GuildMemberAdd,
  async execute(member) {
    try {
      await onJoin(member);
    } catch (err) {
      log.error('gban', 'guildMemberAdd', err);
    }
  },
};
