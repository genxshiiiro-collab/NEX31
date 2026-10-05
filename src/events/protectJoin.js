const { Events } = require('discord.js');
const antiRaid = require('../lib/antiRaid');
const impersonation = require('../lib/impersonation');
const log = require('../lib/logger');

// Protection à l'arrivée : anti-raid + usurpation du staff.
module.exports = {
  name: Events.GuildMemberAdd,
  async execute(member) {
    await antiRaid.onJoin(member).catch((err) => log.error('protect', 'anti-raid', err));
    await impersonation.check(member).catch((err) => log.error('protect', 'usurpation', err));
  },
};
