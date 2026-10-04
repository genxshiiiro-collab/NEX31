const { Events } = require('discord.js');
const { onChannelCreate } = require('../lib/verification');

// Vérification : tout nouveau salon est caché aux visiteurs.
module.exports = {
  name: Events.ChannelCreate,
  execute: (channel) => onChannelCreate(channel),
};
