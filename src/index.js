require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Collection, Partials } = require('discord.js');
const { load } = require('./storage');
const log = require('./lib/logger');

if (!process.env.DISCORD_TOKEN) {
  log.error('bot', 'DISCORD_TOKEN manquant. Copie .env.example en .env et remplis-le.');
  process.exit(1);
}

load();
const { ensureLegacySeeds } = require('./lib/reviewStats');
ensureLegacySeeds();
log.info('bot', 'Base de données chargée');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent, // intent privilégié — à activer dans le portail Discord
    // GuildMembers volontairement omis : intent privilégié souvent désactivé.
    // Les pastilles utilisent message.member + fetch ponctuel (ticketPastille.js).
  ],
  partials: [Partials.Channel, Partials.GuildMember, Partials.Message],
});

// --- Chargement des commandes ---
client.commands = new Collection();
const commandsDir = path.join(__dirname, 'commands');
for (const file of fs.readdirSync(commandsDir).filter((f) => f.endsWith('.js'))) {
  const cmd = require(path.join(commandsDir, file));
  if (cmd?.data && cmd?.execute) client.commands.set(cmd.data.name, cmd);
}
log.info('bot', `${client.commands.size} commande(s) chargée(s)`, { liste: [...client.commands.keys()].join(', ') });

// --- Chargement des événements ---
const eventsDir = path.join(__dirname, 'events');
let evtCount = 0;
for (const file of fs.readdirSync(eventsDir).filter((f) => f.endsWith('.js'))) {
  const evt = require(path.join(eventsDir, file));
  if (evt.once) client.once(evt.name, (...args) => evt.execute(...args));
  else client.on(evt.name, (...args) => evt.execute(...args));
  evtCount += 1;
}
log.info('bot', `${evtCount} événement(s) chargé(s)`);

process.on('unhandledRejection', (err) => log.error('process', 'unhandledRejection', err));
process.on('uncaughtException', (err) => log.error('process', 'uncaughtException', err));

client.on('error', (err) => log.error('client', 'Erreur client Discord', err));
client.on('warn', (msg) => log.warn('client', msg));
client.on('guildCreate', (g) => log.event(g, { level: 'success', scope: 'bot', title: '➕ Bot ajouté à un serveur', description: `**${g.name}** (${g.id})` }));

log.info('bot', 'Connexion à Discord...');
client.login(process.env.DISCORD_TOKEN).catch((err) => {
  log.error('bot', 'Connexion impossible', err);
  process.exit(1);
});
