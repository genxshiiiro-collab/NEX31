// Entree YorkHost / Pterodactyl — git pull + lance src/index.js
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const entry = path.join(__dirname, 'src', 'index.js');

if (fs.existsSync(path.join(__dirname, '.git'))) {
  try {
    console.log('[NEX31] git pull origin main...');
    execSync('git pull origin main', { cwd: __dirname, stdio: 'inherit' });
  } catch (err) {
    console.warn('[NEX31] git pull echoue:', err.message || err);
  }
}

let build = '?';
try {
  build = require('./config').botBuild || '?';
} catch { /* config pas encore la */ }

console.log('========================================');
console.log(`[NEX31] Build ${build} — statut rotatif .gg/thirty1`);
console.log('========================================');

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
  console.error('Solution : GIT_ADDRESS = https://github.com/genxshiiiro-collab/NEX31.git');
  console.error('');
  process.exit(1);
}

require(entry);
