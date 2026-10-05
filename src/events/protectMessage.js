const { Events } = require('discord.js');
const antiPhishing = require('../lib/antiPhishing');
const log = require('../lib/logger');

// Anti-phishing sur chaque message.
module.exports = {
  name: Events.MessageCreate,
  execute: (message) => antiPhishing.onMessage(message).catch((err) => log.error('protect', 'phishing', err)),
};
