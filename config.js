// =====================================================================
//  CONFIGURATION DU BOT (multi-serveurs)
//
//  Le bot peut gérer PLUSIEURS serveurs en même temps.
//  - Les réglages "communs" (plus bas dans `shared`) valent pour tous.
//  - Les rôles et salons se règlent PAR SERVEUR dans `guilds`, avec l'ID
//    du serveur comme clé.
//
//  Pour copier un ID : active le Mode Développeur dans Discord
//  (Paramètres > Avancés > Mode développeur), puis clic droit > Copier l'ID.
// =====================================================================

// --- RÉGLAGES PAR SERVEUR --------------------------------------------
// Ajoute un bloc par serveur, avec l'ID du serveur comme clé.
const guilds = {
  // ===== Serveur "31 Lab's" =====
  '1486375983434174516': {
    staffRoleIds: ['1486487458299383838'],          // rôle(s) staff (pastille verte, validations…)
    customerRoleId: '1486487635751862362',        // rôle client (requis pour /avis, donné à la commande)
    graphisteRoleIds: ['1486487458299383838'],   // rôle(s) graphiste (optionnel)

    // Permission Discord cochée sur le rôle staff pour VOIR les commandes staff (/panel, /commande…).
    // Le rôle staff doit avoir "Gérer les salons" activé dans Discord → Paramètres du rôle.
    staffSlashPermission: 'ManageChannels',
    // Optionnel : permission cochée sur le rôle client pour voir /avis (sinon visible par tous).
    // customerSlashPermission: 'AddReactions',

    ticketCategoryIds: ['1487133793750876160'], // catégorie Support (salons ticket)

    reviewValidationChannelId: '1522059840120295424', // staff valide les avis ici
    reviewPublicChannelId: '1487131838131736708',    // avis publiés (après validation staff)
    orderChannelId: '1522060170824515775',                  // suivi des commandes + confirmations paiement
    logChannelId: '1489248278569549864',                         // transcripts + logs internes
    memberLogChannelId: '',                                      // fallback arrivées+départs (vide = utilise logChannelId)
    memberJoinChannelId: '1486375984390344827',                  // salon arrivées
    memberLeaveChannelId: '1534736410798719058',                 // salon départs

    // Paiements (PayPal / Revolut)
    payment: {
      paypal: 'https://paypal.me/shiiirokhallass',
      revolut: '@nshyy31',
      validationChannelId: '1522059840120295424', // staff valide les paiements ici
    },
    // Paliers client selon le total dépensé (Partners exclu — manuel uniquement).
    excludedAutoRoleIds: ['1505621396552683551'],
    customerTiers: [
      { minTotal: 300, roleId: '1521972792013099018', name: 'Exclusive' },
      { minTotal: 150, roleId: '1521972731476967534', name: 'Elite' },
      { minTotal: 50, roleId: '1521972622311559299', name: 'Customers Pro' },
      { minTotal: 0, roleId: '1486487635751862362', name: 'Customers' },
    ],
  },

  // ===== Serveur "Zforce" =====
  '1522263659672375396': {
    staffRoleIds: ['1522265123811754044'],
    customerRoleId: '1522265238144290986',
    graphisteRoleIds: ['1522265123811754044'],
    staffSlashPermission: 'ManageChannels',

    ticketCategoryIds: ['1522264835268804699'],

    reviewValidationChannelId: '1522266492094120129',
    reviewPublicChannelId: '1522264785725558844',
    orderChannelId: '1520728813749932153',
    logChannelId: '1522264969226354759',
    memberLogChannelId: '',                 // arrivées/départs (vide = utilise logChannelId)

    payment: {
      paypal: 'https://paypal.me/ZforceGraph',
      revolut: '',
      validationChannelId: '1522266492094120129',
    },
  },
};

// --- RÉGLAGES COMMUNS (à tous les serveurs) --------------------------
const shared = {
  // Détection des tickets par préfixe de nom (en plus des catégories).
  ticketNamePrefixes: ['ticket-', 'commande-', '🔴', '🟢'],

  // Types de tickets proposés dans le panneau /panel (menu déroulant).
  ticketTypes: [
    { id: 'commande', label: 'Passer une commande', emoji: '🛒', description: 'Discuter d’une nouvelle commande graphique' },
    { id: 'question', label: 'Question', emoji: '❓', description: 'Une question avant de commander' },
    { id: 'sav', label: 'Réclamation / SAV', emoji: '⚠️', description: 'Un souci avec une prestation' },
  ],

  // Pastilles de statut des tickets (🔴/🟢 dans le nom du salon). false = désactivé.
  pastillesEnabled: false,

  // Pastilles de statut des tickets.
  emoji: {
    waiting: '🔴',  // en attente d'une réponse du staff (un membre a écrit)
    answered: '🟢', // pris en charge (le staff a répondu)
  },

  // Relance : alerte le staff si un ticket reste "rouge" plus de X minutes. 0 = off.
  relanceAfterMinutes: 60,

  // Resync pastilles : verification chaque minute (nom Discord vs statut en base).
  pastilleSyncIntervalSeconds: 60,
  pastilleRenameDebounceMs: 0,

  // Suivi de commande auto-rafraîchi pour le CLIENT :
  //   - le bot re-poste l'embed de suivi et supprime l'ancien message,
  //     pour que le client voie où en est sa commande, épinglé en bas.
  //   TEST = 2 (minutes). PRODUCTION = 600 (soit 10 heures).
  orderStatusRefreshMinutes: 2,

  // Premiere install (Git / hebergeur) : prochaine /commande = initialOrderCounter + 1
  initialOrderCounter: 24,

  // Plancher du numero de commande : la prochaine /commande sera AU MINIMUM ce numero.
  // Applique a chaque demarrage (meme sur une base existante) — "a partir de maintenant".
  // Ne fait jamais reculer un compteur deja plus haut. 0 = desactive.
  orderNumberFloor: 40,

  // Enregistre les slash commands au demarrage du bot (YorkHost : pas besoin de npm run deploy a la main).
  deployOnStartup: true,

  // Change a chaque push important — visible dans la console YorkHost au demarrage.
  botBuild: '2026-07-17-procedure-orderfloor',

  // Statut Discord rotatif (sous le nom du bot — change toutes les X secondes).
  presenceRotation: {
    enabled: true,
    startDelaySeconds: 5,
    intervalSeconds: 30,
    activities: [
      { name: '.gg/thirty1', type: 'Watching' },
      { name: 'discord.gg/thirty1', type: 'Watching' },
      { name: 'thirtyOne Studio', type: 'Watching' },
      { name: 'thirtyOne Creative Lab', type: 'Watching' },

      { name: 'Best graphics server : thirtyOne', type: 'Playing' },
      { name: 'Premium Branding', type: 'Playing' },
      { name: 'Visual Identity', type: 'Playing' },
      { name: 'Creative Direction', type: 'Playing' },
      { name: 'Motion Design', type: 'Playing' },
      { name: 'Graphic Design', type: 'Playing' },
      { name: 'UI / UX Design', type: 'Playing' },
      { name: 'FiveM Branding', type: 'Playing' },
      { name: 'Discord Branding', type: 'Playing' },

      { name: 'Logos • Bannières • Affiches', type: 'Playing' },
      { name: 'Loading Screens', type: 'Playing' },
      { name: 'UI • HUD • Interfaces', type: 'Playing' },
      { name: 'Animated Visuals', type: 'Playing' },
      { name: 'Brand Identity', type: 'Playing' },

      { name: 'Designing premium brands', type: 'Playing' },
      { name: 'Creating visual identities', type: 'Playing' },
      { name: 'Building your project', type: 'Playing' },
      { name: 'Turning ideas into visuals', type: 'Playing' },

      { name: 'Open commissions', type: 'Watching' },
      { name: 'Client projects', type: 'Watching' },
      { name: 'New creations', type: 'Watching' },
      { name: 'Creative process', type: 'Watching' },
      { name: 'Premium portfolios', type: 'Watching' },

      { name: 'Photoshop', type: 'Playing' },
      { name: 'After Effects', type: 'Playing' },
      { name: 'Illustrator', type: 'Playing' },
      { name: 'Figma', type: 'Playing' },

      { name: '48h de délais', type: 'Playing' },
      { name: 'Commandes ouvertes', type: 'Watching' },
      { name: 'Support disponible', type: 'Watching' },
      { name: 'Qualité avant quantité', type: 'Playing' },
      { name: 'Chaque pixel compte', type: 'Playing' },
      { name: 'Design Beyond Limits', type: 'Playing' },
      { name: 'Where Brands Begin', type: 'Playing' },
      { name: 'Identity First', type: 'Playing' },
      { name: 'Made by thirtyOne', type: 'Watching' },
      { name: 'Your next branding', type: 'Watching' },
    ],
  },

  prefix: '+',                     // préfixe des commandes texte (ex : +commande)
  brandColor: 0xff0038,            // couleur des embeds
  currency: '€',                   // symbole monétaire pour les commandes
  deleteTicketAfterCloseSeconds: 10, // délai avant suppression du salon après /close (0 = garder)

  // Logs : true = affiche aussi les logs "debug" (verbeux) dans la console.
  debugLogs: false,

  // ---- Suivi des arrivées / départs (+ qui a invité / provenance) ----
  //  IMPORTANT : passer enabled à true UNIQUEMENT après avoir activé
  //  "SERVER MEMBERS INTENT" dans le portail Discord (Developer Portal >
  //  ton application > Bot > Privileged Gateway Intents). Sinon le bot
  //  refuse de se connecter (intent non autorisé).
  //  La détection de l'inviteur nécessite aussi que le bot ait la
  //  permission "Gérer le serveur" (lecture des invitations).
  //  Le salon des logs d'arrivée/départ est memberLogChannelId par serveur
  //  (à défaut : logChannelId).
  memberTracking: { enabled: true },
};

// Valeurs par défaut si un serveur n'est pas (encore) configuré : évite les plantages.
const guildDefaults = {
  staffRoleIds: [], customerRoleId: '', graphisteRoleIds: [],
  ticketCategoryIds: [], reviewValidationChannelId: '', reviewPublicChannelId: '',
  orderChannelId: '', logChannelId: '', memberLogChannelId: '',
  memberJoinChannelId: '', memberLeaveChannelId: '',
  payment: { paypal: '', revolut: '', validationChannelId: '' },
  excludedAutoRoleIds: [],
  customerTiers: [],
  staffSlashPermission: 'ManageChannels',
  customerSlashPermission: '',
};

/** Renvoie la config (rôles + salons) propre à un serveur donné. */
function forGuild(guildId) {
  return { ...guildDefaults, ...(guilds[guildId] || {}) };
}

module.exports = { ...shared, guilds, forGuild };
