const { Events } = require('discord.js');
const { ensureAll } = require('../lib/honeypot');

// Salon piège : créé (ou retrouvé) sur chaque serveur au démarrage.
module.exports = {
  name: Events.ClientReady,
  once: true,
  execute: (client) => ensureAll(client),
};
