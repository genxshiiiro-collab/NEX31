const config = require('../../config');
const { handlePrefix } = require('../lib/prefixCommands');
const { updateFromMessage } = require('../lib/ticketPastille');
const log = require('../lib/logger');

module.exports = {
  name: 'messageCreate',
  async execute(message) {
    if (message.author.bot || !message.guild) return;

    if (message.partial) {
      message = await message.fetch().catch(() => message);
    }

    if (config.prefix && message.content.startsWith(config.prefix)) {
      handlePrefix(message).catch((err) => log.error('prefix', 'Commande préfixe', err));
      return;
    }

    try {
      await updateFromMessage(message);
    } catch (err) {
      log.error('pastille', 'Mise à jour pastille impossible', err);
    }
  },
};
