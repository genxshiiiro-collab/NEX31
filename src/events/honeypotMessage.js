const { Events } = require('discord.js');
const { onMessage } = require('../lib/honeypot');
const log = require('../lib/logger');

// Salon piège : tout message posté dedans = ban global du compte et de ses alts.
module.exports = {
  name: Events.MessageCreate,
  async execute(message) {
    try {
      await onMessage(message);
    } catch (err) {
      log.error('honeypot', 'messageCreate', err);
    }
  },
};
