// Alertes de sécurité : DM aux propriétaires + log du serveur.
// Propriétaires = GBAN_OWNERS (séparés par virgule), sinon le propriétaire du serveur.
const { V2, container, text, separator, fieldsText } = require('./components');
const log = require('./logger');

function ownerIds(guild) {
  const owners = (process.env.GBAN_OWNERS || '').split(',').map((s) => s.trim()).filter(Boolean);
  return owners.length ? owners : [guild.ownerId];
}

/** Log dans le serveur + DM à chaque propriétaire. */
async function securityAlert(guild, { title, description, fields = [], level = 'error' }) {
  log.event(guild, { level, scope: 'protect', title, description, fields });
  const c = container(level === 'error' ? 0xe74c3c : 0xf39c12)
    .addTextDisplayComponents(text(`## ${title}`))
    .addTextDisplayComponents(text(`-# ${guild.name}`));
  if (description) c.addSeparatorComponents(separator()).addTextDisplayComponents(text(description));
  if (fields.length) c.addSeparatorComponents(separator()).addTextDisplayComponents(text(fieldsText(fields)));
  for (const id of ownerIds(guild)) {
    const user = await guild.client.users.fetch(id).catch(() => null);
    await user?.send({ components: [c], flags: V2, allowedMentions: { parse: [] } }).catch(() => {});
  }
}

module.exports = { ownerIds, securityAlert };
