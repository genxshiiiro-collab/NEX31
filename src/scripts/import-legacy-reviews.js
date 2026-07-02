// Importe les avis historiques du salon 1487131838131736708
// et les publie en Components V2 (one-shot ou relance manuelle).
require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const { load, persistNow } = require('../storage');
const { importAndPublishLegacyReviews, getApprovedReviews } = require('../lib/reviewStats');
const { GUILD_31LABS } = require('../data/legacy-reviews');

if (!process.env.DISCORD_TOKEN) {
  console.error('DISCORD_TOKEN manquant');
  process.exit(1);
}

load();

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('clientReady', async () => {
  try {
    const n = await importAndPublishLegacyReviews(client);
    const total = getApprovedReviews(GUILD_31LABS).length;
    console.log(`Terminé : ${n} avis publié(s) dans le salon. Total en base : ${total}`);
  } catch (err) {
    console.error('Erreur import avis :', err);
    process.exitCode = 1;
  } finally {
    persistNow();
    client.destroy();
    process.exit(process.exitCode || 0);
  }
});

client.login(process.env.DISCORD_TOKEN);
