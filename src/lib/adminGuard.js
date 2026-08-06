// Vérification "Administrateur" côté exécution.
// Doublon volontaire de setDefaultMemberPermissions(Administrator) : la permission
// par défaut cache la commande, ce guard bloque un appel malgré tout parvenu jusqu'ici.
const { PermissionFlagsBits, MessageFlags } = require('discord.js');

const DENY_MESSAGE = "Vous n'avez pas la permission d'utiliser cette commande.";

/** L'auteur de l'interaction possède-t-il la permission Administrator ? */
function isAdmin(interaction) {
  return Boolean(interaction.memberPermissions?.has(PermissionFlagsBits.Administrator));
}

/**
 * Bloque et répond en privé si l'auteur n'est pas administrateur.
 * @returns {Promise<boolean>} true si autorisé (poursuivre), false si refusé.
 */
async function ensureAdmin(interaction) {
  if (isAdmin(interaction)) return true;
  await interaction.reply({ content: DENY_MESSAGE, flags: MessageFlags.Ephemeral }).catch(() => {});
  return false;
}

module.exports = { isAdmin, ensureAdmin, DENY_MESSAGE };
