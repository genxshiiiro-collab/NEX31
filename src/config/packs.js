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
        'Logo animé',
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
      delivery: '4–6 jours',
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
      delivery: '6–8 jours',
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
      price: '20 €',
      delivery: '2–3 jours',
      inheritsFrom: null,
      note: 'Pack volontairement limité (ni logo animé, ni UI, ni icônes, ni loading screen).',
      content: [
        'Logo principal',
        '1 variation de couleur',
        'Bannière Discord',
        'Bannière FiveM',
        '1 révision',
      ],
    },
    intermediate: {
      name: 'Intermediate Server',
      price: '50 €',
      delivery: '3–4 jours',
      inheritsFrom: 'starter',
      content: [
        '3 variations de couleur au total',
        'Logo animé',
        'Bannière Discord Invite',
        'Bannière FiveM List',
        '1 bannière publicitaire horizontale',
        '2 bannières publicitaires verticales',
        '3 icônes personnalisées',
        '1 Team Flag',
        '2 révisions',
      ],
    },
    advanced: {
      name: 'Advanced Server',
      price: '110 €',
      delivery: '4–6 jours',
      inheritsFrom: 'intermediate',
      note: 'UI simple = une seule interface (design uniquement, sans développement) : HUD, Inventaire, Téléphone, Boutique, Garage, Menu métier, Menu personnage ou Interface de faction.',
      content: [
        'Loading Screen Design, sans développement',
        '2 bannières publicitaires horizontales au total',
        '3 bannières publicitaires verticales au total',
        '3 bannières de statut serveur',
        '6 icônes personnalisées au total',
        '3 Team Flags au total',
        '1 UI Design simple',
        "Visuel d'ouverture",
        'Visuel de mise à jour',
        'Traitement prioritaire',
        '3 révisions',
      ],
    },
    elite: {
      name: 'Elite Server',
      price: '165 €',
      delivery: '6–8 jours',
      inheritsFrom: 'advanced',
      content: [
        '4 variations de couleur au total',
        'Loading Screen avec développement',
        '3 bannières publicitaires horizontales au total',
        '4 bannières publicitaires verticales au total',
        'Kit boutique ou donation',
        'Pack complet de statuts',
        '12 icônes personnalisées au total',
        '6 Team Flags au total',
        '2 UI Designs',
        'Bannière de recrutement',
        'Visuel de partenariat',
        'Visuel événementiel',
        'Favicon',
        'Photo de profil',
        'Mini-charte graphique',
        'Consultation branding',
        '4 révisions',
      ],
    },
  },
};

const packs = { studio, server };

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

module.exports = { packs, studio, server, checkpointConfig, getPack, COLORS };
