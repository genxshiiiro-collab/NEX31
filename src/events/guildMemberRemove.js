const { Events } = require('discord.js');
const { db } = require('../storage');
const invites = require('../lib/inviteTracker');
const log = require('../lib/logger');

const DAY_MS = 24 * 60 * 60 * 1000;

module.exports = {
  name: Events.GuildMemberRemove,
  async execute(member) {
    if (!invites.trackingEnabled()) return;
    try {
      const info = db.memberJoins[member.guild.id]?.[member.id] || null;

      const lines = [
        `**Membre** — <@${member.id}> (${member.user?.tag || member.id})`,
      ];
      if (info?.inviterId) lines.push(`**Avait été invité par** — <@${info.inviterId}>`);
      else if (info?.type === 'vanity') lines.push(`**Était arrivé via** — lien vanity \`/${info.code}\``);
      else if (info?.code) lines.push(`**Invitation d'arrivée** — \`${info.code}\``);
      if (info?.joinedAt) {
        const days = Math.floor((Date.now() - info.joinedAt) / DAY_MS);
        lines.push(`**Présence** — ${days} jour(s) · arrivé <t:${Math.floor(info.joinedAt / 1000)}:R>`);
      }
      lines.push(`**Membres** — ${member.guild.memberCount}`);

      const c = invites.container(0xe74c3c)
        .addTextDisplayComponents(invites.text('## Départ'))
        .addSeparatorComponents(invites.separator())
        .addTextDisplayComponents(invites.text(lines.join('\n')));

      await invites.postMemberLog(member.guild, c);
    } catch (err) {
      log.error('invites', 'guildMemberRemove', err);
    }
  },
};
