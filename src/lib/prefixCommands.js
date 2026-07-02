// Commandes texte à préfixe (ex : +commande).
// Nécessite l'intent privilégié MESSAGE CONTENT (voir README).
const config = require('../../config');
const { isStaff } = require('./helpers');
const { createOrder } = require('../commands/commande');

const USAGE =
  '⚠️ **Syntaxe :** `+commande @client <prix> <prestation> [@graphiste]`\n' +
  'Exemple : `+commande @Jean 25 Logo gaming + bannière @MonGraphiste`';

async function handlePrefix(message) {
  const body = message.content.slice(config.prefix.length).trim();
  const [cmd, ...rest] = body.split(/\s+/);
  if (cmd.toLowerCase() !== 'commande') return; // seule commande texte gérée

  if (!isStaff(message.member)) {
    return message.reply('❌ Seul le staff peut créer une commande.');
  }

  const argline = rest.join(' ');

  // Mentions dans l'ordre d'apparition : 1re = client, 2e = graphiste.
  const mentionIds = [...argline.matchAll(/<@!?(\d+)>/g)].map((m) => m[1]);
  const clientId = mentionIds[0];
  const graphisteId = mentionIds[1] || null;

  // On retire les mentions, puis on lit le 1er nombre = prix, le reste = prestation.
  const stripped = argline.replace(/<@!?\d+>/g, ' ').replace(/\s+/g, ' ').trim();
  const priceMatch = stripped.match(/\d+(?:[.,]\d+)?/);
  const prix = priceMatch ? parseFloat(priceMatch[0].replace(',', '.')) : null;
  const prestation = (priceMatch
    ? (stripped.slice(0, priceMatch.index) + stripped.slice(priceMatch.index + priceMatch[0].length))
    : stripped).replace(/\s+/g, ' ').trim();

  if (!clientId || prix === null || !prestation) {
    return message.reply(USAGE);
  }

  const client = await message.client.users.fetch(clientId).catch(() => null);
  if (!client) return message.reply('❌ Client introuvable.');

  const order = await createOrder(message.guild, {
    clientId, clientTag: client.tag, prestation, prix, graphisteId,
  });

  return message.reply(`✅ Commande **#${order.id}** créée pour <@${clientId}> — utilise **/setsuivi** dans le ticket pour afficher le suivi.`);
}

module.exports = { handlePrefix };
