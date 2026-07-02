// Deploiement des commandes slash sur tous les serveurs configures.
const fs = require('fs');
const path = require('path');
const { REST, Routes } = require('discord.js');
const config = require('../../config');
const { commandsForGuild } = require('./commandAccess');

function loadBaseCommands() {
  const baseCommands = [];
  const commandsDir = path.join(__dirname, '..', 'commands');
  for (const file of fs.readdirSync(commandsDir).filter((f) => f.endsWith('.js'))) {
    const cmd = require(path.join(commandsDir, file));
    if (cmd?.data) baseCommands.push(cmd.data.toJSON());
  }
  return baseCommands;
}

function targetGuildIds() {
  const { GUILD_ID } = process.env;
  const fromEnv = (GUILD_ID || '').split(',').map((s) => s.trim()).filter(Boolean);
  const fromConfig = Object.keys(config.guilds || {});
  return [...new Set([...fromEnv, ...fromConfig])];
}

/** @param {(msg: string) => void} [out] @param {{ onlyMemberOf?: string[] }} [opts] */
async function deployCommands(out = console.log, opts = {}) {
  const { DISCORD_TOKEN, CLIENT_ID } = process.env;
  if (!DISCORD_TOKEN || !CLIENT_ID) {
    out('ERREUR deploy : DISCORD_TOKEN et CLIENT_ID requis dans .env');
    return { ok: 0, fail: 0, hadError: true };
  }

  let guildIds = targetGuildIds();
  if (opts.onlyMemberOf?.length) {
    guildIds = guildIds.filter((id) => opts.onlyMemberOf.includes(id));
  }
  if (!guildIds.length) {
    out('ERREUR deploy : aucun serveur dans GUILD_ID ou config.js');
    return { ok: 0, fail: 0, hadError: true };
  }

  out(`Deploy : ${guildIds.length} serveur(s) -> ${guildIds.join(', ')}`);

  const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
  const baseCommands = loadBaseCommands();
  let ok = 0;
  let hadError = false;

  for (const gid of guildIds) {
    try {
      const body = commandsForGuild(baseCommands, gid);
      out(`Deploy ${gid} : ${body.length} commande(s)...`);
      const registered = await rest.put(
        Routes.applicationGuildCommands(CLIENT_ID, gid),
        { body },
      );
      const staff = body.filter((c) => c.default_member_permissions).length;
      out(`OK ${gid} : ${registered.length} commandes (${registered.length - staff} public, ${staff} staff)`);
      ok += 1;
    } catch (err) {
      hadError = true;
      const msg = err.message || String(err);
      out(`ECHEC ${gid} : ${msg}`);
      if (err.status === 403 || /missing access/i.test(msg)) {
        out(`  -> Re-invite le bot sur ${gid} avec applications.commands`);
      }
    }
  }

  out(`Deploy termine : ${ok}/${guildIds.length} serveur(s) OK`);
  return { ok, fail: guildIds.length - ok, hadError };
}

module.exports = { deployCommands, targetGuildIds };
