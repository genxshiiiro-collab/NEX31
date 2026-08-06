const { Events } = require('discord.js');
const { db, save } = require('../storage');
const invites = require('../lib/inviteTracker');
const log = require('../lib/logger');

/** Décrit la provenance d'un arrivant selon l'invitation résolue. */
function describeSource(r) {
  if (r.type === 'invite' && r.inviterId) return `Invité par <@${r.inviterId}> · code \`${r.code}\``;
  if (r.type === 'invite') return `Invitation \`${r.code}\` (auteur inconnu)`;
  if (r.type === 'vanity') return `Lien vanity — \`/${r.code}\``;
  if (r.type === 'bot') return 'Bot ajouté par un administrateur';
  return 'Provenance inconnue (invitations non lisibles — permission "Gérer le serveur" ?)';
}

module.exports = {
  name: Events.GuildMemberAdd,
  async execute(member) {
    if (!invites.trackingEnabled()) return;
    try {
      const r = await invites.resolveJoin(member);

      if (!db.memberJoins[member.guild.id]) db.memberJoins[member.guild.id] = {};
      db.memberJoins[member.guild.id][member.id] = {
        inviterId: r.inviterId, code: r.code, type: r.type, joinedAt: Date.now(),
      };
      save();

      const created = Math.floor(member.user.createdTimestamp / 1000);
      const c = invites.container(0x2ecc71)
        .addTextDisplayComponents(invites.text('## Arrivée'))
        .addSeparatorComponents(invites.separator())
        .addTextDisplayComponents(invites.text([
          `**Membre** — <@${member.id}> (${member.user.tag})`,
          `**Provenance** — ${describeSource(r)}`,
          `**Compte créé** — <t:${created}:D> (<t:${created}:R>)`,
          `**Membres** — ${member.guild.memberCount}`,
        ].join('\n')));

      await invites.postMemberLog(member.guild, c);
    } catch (err) {
      log.error('invites', 'guildMemberAdd', err);
    }
  },
};
