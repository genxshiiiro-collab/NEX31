// Enregistre les commandes slash sur ton serveur + visibilité par grade.
// Lance : npm run deploy   (à refaire si tu ajoutes/modifies une commande)
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { REST, Routes } = require('discord.js');
const { commandsForGuild } = require('./lib/commandAccess');

const { DISCORD_TOKEN, CLIENT_ID, GUILD_ID } = process.env;
if (!DISCORD_TOKEN || !CLIENT_ID || !GUILD_ID) {
  console.error('❌ DISCORD_TOKEN, CLIENT_ID et GUILD_ID sont requis dans .env');
  process.exit(1);
}

const guildIds = GUILD_ID.split(',').map((s) => s.trim()).filter(Boolean);

const baseCommands = [];
const commandsDir = path.join(__dirname, 'commands');
for (const file of fs.readdirSync(commandsDir).filter((f) => f.endsWith('.js'))) {
  const cmd = require(path.join(commandsDir, file));
  if (cmd?.data) baseCommands.push(cmd.data.toJSON());
}

const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

(async () => {
  let hadError = false;
  for (const gid of guildIds) {
    try {
      const body = commandsForGuild(baseCommands, gid);
      console.log(`⏳ Déploiement de ${body.length} commande(s) sur le serveur ${gid}...`);
      const registered = await rest.put(
        Routes.applicationGuildCommands(CLIENT_ID, gid),
        { body },
      );
      const staff = body.filter((c) => c.default_member_permissions).length;
      console.log(`✅ ${gid} :`, registered.map((c) => '/' + c.name).join(', '));
      if (staff > 0) console.log(`   🔒 ${staff} commande(s) staff (permission Discord requise)`);
    } catch (err) {
      hadError = true;
      console.error(`❌ Échec sur ${gid} :`, err.message || err);
    }
  }
  if (hadError) process.exit(1);
})();
