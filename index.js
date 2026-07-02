// Entree YorkHost / Pterodactyl — lance le bot depuis src/index.js
const fs = require('fs');
const path = require('path');

const entry = path.join(__dirname, 'src', 'index.js');

if (!fs.existsSync(entry)) {
  console.error('');
  console.error('=== FICHIERS MANQUANTS SUR LE SERVEUR ===');
  console.error('Le bot attend index.js + dossier src/ a la racine (/home/container/).');
  console.error('');
  console.error('Contenu actuel du dossier :');
  try {
    for (const name of fs.readdirSync(__dirname)) console.error(' -', name);
  } catch {
    console.error(' (impossible de lire le dossier)');
  }
  console.error('');
  console.error('Solution :');
  console.error(' 1) SFTP : uploade le CONTENU de deploy/yorkhost/ (pas le dossier parent)');
  console.error(' 2) Ou desactive GIT_ADDRESS dans le panel si tu upload a la main');
  console.error(' 3) Ou change la commande de demarrage en : node src/index.js');
  console.error('');
  process.exit(1);
}

require(entry);
