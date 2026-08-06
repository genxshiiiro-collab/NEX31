// =====================================================================
//  CONFIGURATION CENTRALISÉE — Packs Studio / Server + Checkpoints
//
//  Source unique pour :
//   - les prix, délais et contenus des packs Studio et Server ;
//   - les durées de projet et les seuils de rappel des checkpoints.
//
//  Modifier UNIQUEMENT ce fichier pour changer un prix, un délai ou un
//  contenu. Les commandes /studioprices /serverprices /studiocontent
//  /servercontent /checkpoint lisent toutes ici.
//
//  Prix non fournis => "À définir" (ne jamais inventer un prix).
// =====================================================================

const { brandColor } = require('../../config');

// Couleur des embeds/containers par catégorie (défaut = couleur de marque).
const COLORS = {
  studio: brandColor,
  server: brandColor,
};

// ---------------------------------------------------------------------
//  PACKS STUDIO
//  content = ce que le pack AJOUTE. inheritsFrom = pack inclus en entier.
// ---------------------------------------------------------------------
const studio = {
  order: ['starter', 'intermediate', 'advanced', 'elite'],
  color: COLORS.studio,
  items: {
    starter: {
      name: 'Starter Studio',
      price: '20 €',
      delivery: '2–3 jours',
      inheritsFrom: null,
      content: [
        'Logo principal',
        '1 variation de couleur',
        'Bannière Discord',
        'Bannière de présentation du studio',
        'Logo animé',
        '1 révision',
      ],
    },
    intermediate: {
      name: 'Intermediate Studio',
      price: '50 €',
      delivery: '3–4 jours',
      inheritsFrom: 'starter',
      content: [
        '3 variations de couleur au total',
        'Bannière Discord Invite',
        'Bannière Services',
        '1 bannière publicitaire horizontale',
        '2 publications verticales',
        '3 icônes de services',
        '1 Team Badge',
        '2 révisions',
      ],
    },
    advanced: {
      name: 'Advanced Studio',
      price: '95 €',
      delivery: '7–9 jours',
      inheritsFrom: 'intermediate',
      content: [
        'Bannière Tarifs',
        'Bannière Portfolio',
        'Bannière Commandes ouvertes',
        '2 bannières publicitaires horizontales au total',
        '3 publications verticales au total',
        '3 statuts de commande',
        '6 icônes de services au total',
        '3 Team Badges au total',
        'Visuel de partenariat',
        'Visuel de recrutement',
        "Template d'annonce de sortie",
        'Traitement prioritaire',
        '3 révisions',
      ],
    },
    elite: {
      name: 'Elite Studio',
      price: '145 €',
      delivery: '10–12 jours',
      inheritsFrom: 'advanced',
      content: [
        '4 variations de couleur au total',
        'Logo animé premium',
        'Bannière Hero pour site ou portfolio',
        'Kit tarifaire complet',
        'Template de fiche produit',
        'Template de portfolio',
        'Template de promotion',
        'Template de recrutement',
        'Template de nouveau service ou nouvelle collection',
        'Pack complet de statuts',
        '12 icônes personnalisées au total',
        '6 Team Badges au total',
        'Favicon',
        'Photo de profil',
        'Mini-charte graphique',
        'Consultation branding',
        '4 révisions',
      ],
    },
  },
};

// ---------------------------------------------------------------------
//  PACKS SERVER
// ---------------------------------------------------------------------
const server = {
  order: ['starter', 'intermediate', 'advanced', 'elite'],
  color: COLORS.server,
  items: {
    starter: {
      name: 'Starter Server',
      price: '30 €',
      delivery: '2–3 jours',
      inheritsFrom: null,
      content: [
        'Logo Principal',
        '3 Couleurs De Logo Offertes',
        'Logo Animé GIF',
        'Bannière Discord',
        'Bannière FiveM',
        '1 Bannière Publicitaire / Promotionnelle',
      ],
    },
    intermediate: {
      name: 'Intermediate Server',
      price: '50 €',
      delivery: '5–8 jours',
      inheritsFrom: 'starter',
      content: [
        "Bannière D'Invitation Discord",
        'Bannière FiveM List',
        '1 Bannière Publicitaire Horizontale',
        '1 Bannière Publicitaire Verticale',
        '3 Icônes Personnalisées',
        '1 Team Flag',
      ],
    },
    advanced: {
      name: 'Advanced Server',
      price: '90 €',
      delivery: '8–10 jours',
      inheritsFrom: 'intermediate',
      totals: [
        '5 Bannières Publicitaires Horizontales Au Total',
        '4 Bannières Publicitaires Verticales Au Total',
        '6 Icônes Personnalisées Au Total',
      ],
      content: [
        'Loading Screen Sans Script',
        'Bannières De Statut Serveur',
      ],
    },
    elite: {
      name: 'Elite Server',
      price: '140 €',
      delivery: '8–12 jours',
      inheritsFrom: 'advanced',
      totals: [
        '9 Bannières Publicitaires Horizontales Au Total',
        '8 Bannières Publicitaires Verticales Au Total',
        '18 Icônes Personnalisées Au Total',
      ],
      content: [
        'Loading Screen Avec Script',
        '10 % De Réduction À Vie',
      ],
    },
  },
};

const packs = { studio, server };

// Note affichée sous les tarifs / contenus : point de départ du délai.
const DELIVERY_NOTE = 'Les délais courent à partir du lancement de la commande.';

// ---------------------------------------------------------------------
//  CHECKPOINTS — durées de projet et rappels
// ---------------------------------------------------------------------
const checkpointConfig = {
  timezone: 'Europe/Brussels',

  // Durée maximale d'un projet selon le pack (en jours).
  durationsInDays: {
    starter: 2,
    intermediate: 5,
    advanced: 8,
    elite: 12,
  },

  reminders: {
    halfwayPercentage: 50,        // rappel de mi-parcours
    approachingPercentage: 75,    // rappel d'approche de la date limite
    urgentHoursBeforeDeadline: 24, // rappel urgent
    overdueReminderIntervalHours: 24, // rappel de retard (max 1/jour)
  },
};

/**
 * Renvoie le pack (studio|server) demandé, ou null.
 * @param {'studio'|'server'} type
 * @param {string} key starter|intermediate|advanced|elite
 */
function getPack(type, key) {
  const cat = packs[type];
  if (!cat) return null;
  return cat.items[key] || null;
}

module.exports = { packs, studio, server, checkpointConfig, getPack, COLORS, DELIVERY_NOTE };
