// Visibilité des commandes slash par "grade".
// Discord n'autorise plus les bots à définir les permissions par rôle via l'API :
// on utilise default_member_permissions (permission Discord cochée sur le rôle).

const { PermissionFlagsBits } = require('discord.js');

/** @typedef {'public' | 'customer' | 'staff'} CommandAccess */

/** @type {Record<string, CommandAccess>} */
const ACCESS = {
  stats: 'public',
  payer: 'public',
  procedure: 'staff',
  avis: 'customer',
  panel: 'staff',
  commande: 'staff',
  livrer: 'staff',
  setsuivi: 'staff',
  close: 'staff',
  ticket: 'staff',
  blacklist: 'staff',
  profil: 'staff',
};

function accessFor(commandName) {
  return ACCESS[commandName] || 'public';
}

function permBit(name) {
  if (!name || name === 'none') return null;
  return PermissionFlagsBits[name] ?? null;
}

/**
 * Applique default_member_permissions sur le JSON d'une commande pour un serveur.
 * Le rôle staff / client doit avoir la permission Discord correspondante cochée.
 */
function applyDefaultPermissions(cmdJson, guildId) {
  const level = accessFor(cmdJson.name);
  if (level === 'public') {
    delete cmdJson.default_member_permissions;
    return cmdJson;
  }

  const cfg = require('../../config').forGuild(guildId);
  let bit = null;

  if (level === 'staff') {
    bit = permBit(cfg.staffSlashPermission) ?? PermissionFlagsBits.ManageChannels;
  } else if (level === 'customer') {
    bit = permBit(cfg.customerSlashPermission);
    // Sans permission client configurée : visible par tous (contrôle runtime isCustomer).
    if (!bit) {
      delete cmdJson.default_member_permissions;
      return cmdJson;
    }
  }

  if (bit) {
    cmdJson.default_member_permissions = bit.toString();
  }
  return cmdJson;
}

/** Corps de commandes prêt pour un serveur (permissions adaptées). */
function commandsForGuild(baseCommands, guildId) {
  return baseCommands.map((cmd) => applyDefaultPermissions({ ...cmd }, guildId));
}

module.exports = { ACCESS, accessFor, applyDefaultPermissions, commandsForGuild };
