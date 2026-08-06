const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { ensureAdmin } = require('../lib/adminGuard');
const { V2, container, text, separator } = require('../lib/components');
const cp = require('../lib/checkpoints');
const log = require('../lib/logger');

const PACK_CHOICES = [
  { name: 'Starter', value: 'starter' },
  { name: 'Intermediate', value: 'intermediate' },
  { name: 'Advanced', value: 'advanced' },
  { name: 'Elite', value: 'elite' },
];
const TYPE_CHOICES = [
  { name: 'Studio', value: 'studio' },
  { name: 'Server', value: 'server' },
];
const STATUS_CHOICES = [
  { name: 'En attente', value: 'pending' },
  { name: 'En cours', value: 'in_progress' },
  { name: 'Attente client', value: 'waiting_client' },
  { name: 'Terminé', value: 'completed' },
  { name: 'Annulé', value: 'cancelled' },
  { name: 'En retard', value: 'overdue' },
];

const data = new SlashCommandBuilder()
  .setName('checkpoint')
  .setDescription('Suivi des commandes clients et rappels (administrateurs)')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand((s) => s.setName('create').setDescription('Créer un checkpoint de suivi')
    .addStringOption((o) => o.setName('client').setDescription('Nom, identifiant ou mention du client').setRequired(true))
    .addStringOption((o) => o.setName('pack').setDescription('Pack commandé').setRequired(true).addChoices(...PACK_CHOICES))
    .addStringOption((o) => o.setName('type').setDescription('Studio ou Server').setRequired(true).addChoices(...TYPE_CHOICES))
    .addStringOption((o) => o.setName('commande').setDescription('Courte description du travail').setRequired(true))
    .addUserOption((o) => o.setName('responsable').setDescription('Membre chargé de la commande (reçoit les rappels)'))
    .addStringOption((o) => o.setName('date_depart').setDescription('Date de départ (YYYY-MM-DD ou YYYY-MM-DD HH:mm)'))
    .addStringOption((o) => o.setName('notes').setDescription('Informations internes')))
  .addSubcommand((s) => s.setName('list').setDescription('Lister les checkpoints actifs')
    .addStringOption((o) => o.setName('pack').setDescription('Filtrer par pack').addChoices(...PACK_CHOICES))
    .addStringOption((o) => o.setName('type').setDescription('Filtrer par type').addChoices(...TYPE_CHOICES))
    .addUserOption((o) => o.setName('responsable').setDescription('Filtrer par responsable'))
    .addStringOption((o) => o.setName('statut').setDescription('Filtrer par statut').addChoices(...STATUS_CHOICES))
    .addBooleanOption((o) => o.setName('en_retard').setDescription('Uniquement les commandes en retard')))
  .addSubcommand((s) => s.setName('view').setDescription('Voir le détail d\'un checkpoint')
    .addStringOption((o) => o.setName('id').setDescription('Identifiant (ex : CP-0001)').setRequired(true)))
  .addSubcommand((s) => s.setName('status').setDescription('Modifier le statut d\'un checkpoint')
    .addStringOption((o) => o.setName('id').setDescription('Identifiant').setRequired(true))
    .addStringOption((o) => o.setName('statut').setDescription('Nouveau statut').setRequired(true).addChoices(...STATUS_CHOICES)))
  .addSubcommand((s) => s.setName('deadline').setDescription('Modifier la date limite d\'un checkpoint')
    .addStringOption((o) => o.setName('id').setDescription('Identifiant').setRequired(true))
    .addStringOption((o) => o.setName('nouvelle_date').setDescription('YYYY-MM-DD ou YYYY-MM-DD HH:mm').setRequired(true))
    .addStringOption((o) => o.setName('raison').setDescription('Raison du changement')))
  .addSubcommand((s) => s.setName('delete').setDescription('Supprimer un checkpoint')
    .addStringOption((o) => o.setName('id').setDescription('Identifiant').setRequired(true)));

const EPHEMERAL_V2 = MessageFlags.Ephemeral | V2;

function reply(interaction, containerComp) {
  return interaction.reply({ components: [containerComp], flags: EPHEMERAL_V2, allowedMentions: { parse: [] } });
}

function info(msg) {
  return container().addTextDisplayComponents(text(msg));
}

async function handleCreate(interaction) {
  const client = interaction.options.getString('client');
  const pack = interaction.options.getString('pack');
  const type = interaction.options.getString('type');
  const commande = interaction.options.getString('commande');
  const responsable = interaction.options.getUser('responsable');
  const notes = interaction.options.getString('notes') || '';
  const dateDepart = interaction.options.getString('date_depart');

  let startAt;
  if (dateDepart) {
    startAt = cp.parseManualDate(dateDepart);
    if (!startAt) return reply(interaction, info('Date de départ invalide. Format attendu : `YYYY-MM-DD` ou `YYYY-MM-DD HH:mm`.'));
  }

  const created = cp.createCheckpoint({
    guildId: interaction.guild.id,
    client,
    type,
    pack,
    orderDescription: commande,
    responsibleUserId: responsable?.id || null,
    createdBy: interaction.user.id,
    startAt,
    notes,
  });

  log.event(interaction.guild, {
    level: 'success', scope: 'checkpoint', title: `Checkpoint ${created.id} créé`,
    fields: [
      { name: 'Client', value: client, inline: true },
      { name: 'Pack', value: `${cp.PACK_LABEL[pack]} (${type})`, inline: true },
      { name: 'Par', value: `<@${interaction.user.id}>`, inline: true },
    ],
  });

  return reply(interaction, cp.summaryContainer(created));
}

async function handleList(interaction) {
  const gid = interaction.guild.id;
  const fPack = interaction.options.getString('pack');
  const fType = interaction.options.getString('type');
  const fResp = interaction.options.getUser('responsable');
  const fStatus = interaction.options.getString('statut');
  const fLate = interaction.options.getBoolean('en_retard');

  let list = cp.forGuild(gid);
  if (fStatus) list = list.filter((c) => c.status === fStatus);
  else list = list.filter((c) => cp.isActive(c)); // par défaut : actifs
  if (fPack) list = list.filter((c) => c.pack === fPack);
  if (fType) list = list.filter((c) => c.type === fType);
  if (fResp) list = list.filter((c) => c.responsibleUserId === fResp.id);
  if (fLate) list = list.filter((c) => c.status === 'overdue' || c.deadlineAt < Date.now());

  list.sort((a, b) => a.deadlineAt - b.deadlineAt);

  const c = container().addTextDisplayComponents(text(`## Checkpoints (${list.length})`));
  if (!list.length) {
    c.addSeparatorComponents(separator()).addTextDisplayComponents(text('Aucun checkpoint ne correspond.'));
  } else {
    for (const item of list.slice(0, 20)) {
      const resp = item.responsibleUserId ? `<@${item.responsibleUserId}>` : '—';
      c.addSeparatorComponents(separator()).addTextDisplayComponents(text([
        `**${item.id}** · ${item.client}`,
        `${cp.PACK_LABEL[item.pack]} ${item.type} · ${cp.STATUS[item.status]} · ${resp}`,
        `Limite : ${cp.formatDate(item.deadlineAt)} — ${cp.remainingLabel(item)}`,
      ].join('\n')));
    }
    if (list.length > 20) c.addSeparatorComponents(separator()).addTextDisplayComponents(text(`-# … ${list.length - 20} de plus (affinez les filtres).`));
  }
  return reply(interaction, c);
}

function resolveOwned(interaction) {
  const id = interaction.options.getString('id').trim().toUpperCase();
  const item = cp.get(id);
  if (!item || item.guildId !== interaction.guild.id) return { id, item: null };
  return { id, item };
}

async function handleView(interaction) {
  const { id, item } = resolveOwned(interaction);
  if (!item) return reply(interaction, info(`Checkpoint \`${id}\` introuvable sur ce serveur.`));
  return reply(interaction, cp.summaryContainer(item));
}

async function handleStatus(interaction) {
  const { id, item } = resolveOwned(interaction);
  if (!item) return reply(interaction, info(`Checkpoint \`${id}\` introuvable sur ce serveur.`));
  const status = interaction.options.getString('statut');
  cp.setStatus(item, status, interaction.user.id);

  log.event(interaction.guild, {
    level: 'info', scope: 'checkpoint', title: `Checkpoint ${item.id} → ${cp.STATUS[status]}`,
    fields: [{ name: 'Par', value: `<@${interaction.user.id}>`, inline: true }],
  });
  return reply(interaction, cp.summaryContainer(item));
}

async function handleDeadline(interaction) {
  const { id, item } = resolveOwned(interaction);
  if (!item) return reply(interaction, info(`Checkpoint \`${id}\` introuvable sur ce serveur.`));
  const raw = interaction.options.getString('nouvelle_date');
  const raison = interaction.options.getString('raison') || null;
  const newMs = cp.parseManualDate(raw);
  if (!newMs) return reply(interaction, info('Date invalide. Format attendu : `YYYY-MM-DD` ou `YYYY-MM-DD HH:mm`.'));
  cp.updateDeadline(item, newMs, raison, interaction.user.id);

  log.event(interaction.guild, {
    level: 'info', scope: 'checkpoint', title: `Checkpoint ${item.id} — date limite modifiée`,
    fields: [
      { name: 'Nouvelle', value: cp.formatDate(newMs), inline: true },
      { name: 'Raison', value: raison || '—', inline: true },
      { name: 'Par', value: `<@${interaction.user.id}>`, inline: true },
    ],
  });
  return reply(interaction, cp.summaryContainer(item));
}

async function handleDelete(interaction) {
  const { id, item } = resolveOwned(interaction);
  if (!item) return reply(interaction, info(`Checkpoint \`${id}\` introuvable sur ce serveur.`));
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`cp:delok:${item.id}`).setLabel('Confirmer la suppression').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('cp:delno').setLabel('Annuler').setStyle(ButtonStyle.Secondary),
  );
  return interaction.reply({
    content: `Supprimer définitivement le checkpoint **${item.id}** (${item.client}) ?`,
    components: [row],
    flags: MessageFlags.Ephemeral,
  });
}

async function execute(interaction) {
  if (!(await ensureAdmin(interaction))) return;
  const sub = interaction.options.getSubcommand();
  try {
    if (sub === 'create') return await handleCreate(interaction);
    if (sub === 'list') return await handleList(interaction);
    if (sub === 'view') return await handleView(interaction);
    if (sub === 'status') return await handleStatus(interaction);
    if (sub === 'deadline') return await handleDeadline(interaction);
    if (sub === 'delete') return await handleDelete(interaction);
  } catch (err) {
    log.error('checkpoint', `Erreur sur /checkpoint ${sub}`, err);
    const payload = { content: "Une erreur est survenue pendant l'exécution de la commande.", flags: MessageFlags.Ephemeral };
    if (interaction.deferred || interaction.replied) return interaction.followUp(payload).catch(() => {});
    return interaction.reply(payload).catch(() => {});
  }
}

module.exports = { data, execute };
