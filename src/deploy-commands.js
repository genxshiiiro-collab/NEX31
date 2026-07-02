// Enregistre les commandes slash sur chaque serveur configure.
// Lance : npm run deploy   (a refaire apres ajout/modif de commande ou nouveau serveur)
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { REST, Routes } = require('discord.js');
const config = require('../config');
const { commandsForGuild } = require('./lib/commandAccess');

const { DISCORD_TOKEN, CLIENT_ID, GUILD_ID } = process.env;
if (!DISCORD_TOKEN || !CLIENT_ID) {
  console.error('❌ DISCORD_TOKEN et CLIENT_ID requis dans .env');
  process.exit(1);
}

const fromEnv = (GUILD_ID || '').split(',').map((s) => s.trim()).filter(Boolean);
const fromConfig = Object.keys(config.guilds || {});
const guildIds = [...new Set([...fromEnv, ...fromConfig])];

if (!guildIds.length) {
  console.error('❌ Aucun serveur : ajoute GUILD_ID dans .env ou un bloc dans config.js');
  process.exit(1);
}

console.log(`📋 Serveurs cibles (${guildIds.length}) :`, guildIds.join(', '));

const baseCommands = [];
const commandsDir = path.join(__dirname, 'commands');
for (const file of fs.readdirSync(commandsDir).filter((f) => f.endsWith('.js'))) {
  const cmd = require(path.join(commandsDir, file));
  if (cmd?.data) baseCommands.push(cmd.data.toJSON());
}

const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

(async () => {
  let ok = 0;
  let hadError = false;
  for (const gid of guildIds) {
    try {
      const body = commandsForGuild(baseCommands, gid);
      console.log(`\n⏳ Deploiement de ${body.length} commande(s) sur ${gid}...`);
      const registered = await rest.put(
        Routes.applicationGuildCommands(CLIENT_ID, gid),
        { body },
      );
      const staff = body.filter((c) => c.default_member_permissions).length;
      const pub = registered.length - staff;
      console.log(`✅ ${gid} : ${registered.length} commande(s) enregistree(s)`);
      console.log(`   Public : ${pub} | Staff (permission Gerer les salons) : ${staff}`);
      console.log(`   ${registered.map((c) => '/' + c.name).join(', ')}`);
      ok += 1;
    } catch (err) {
      hadError = true;
      const msg = err.message || String(err);
      console.error(`\n❌ Echec sur ${gid} : ${msg}`);
      if (err.status === 403 || /missing access/i.test(msg)) {
        console.error('   → Le bot n\'est pas sur ce serveur, ou pas invite avec applications.commands');
        console.error('   → Re-invite : https://discord.com/oauth2/authorize?client_id=' + CLIENT_ID + '&permissions=8&scope=bot%20applications.commands');
      }
    }
  }
  console.log(`\n📊 Resultat : ${ok}/${guildIds.length} serveur(s) OK`);
  if (hadError) process.exit(1);
})();
