// Entree YorkHost / Pterodactyl — sync GitHub + lance src/index.js
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const entry = path.join(ROOT, 'src', 'index.js');

function syncFromGitHub() {
  if (!fs.existsSync(path.join(ROOT, '.git'))) {
    console.log('[NEX31] Pas de .git — sync GitHub ignoree.');
    return;
  }
  try {
    console.log('[NEX31] Sync GitHub (fetch + reset --hard origin/main)...');
    execSync('git fetch origin main', { cwd: ROOT, stdio: 'inherit' });
    execSync('git reset --hard origin/main', { cwd: ROOT, stdio: 'inherit' });
    console.log('[NEX31] Code aligne sur GitHub.');
  } catch (err) {
    console.warn('[NEX31] Sync git echouee:', err.message || err);
    console.warn('[NEX31] Lance manuellement : git fetch origin main && git reset --hard origin/main');
  }
}

syncFromGitHub();

// Recharge config.js apres sync (sinon cache Node = ancienne version).
const configPath = path.join(ROOT, 'config.js');
if (fs.existsSync(configPath)) {
  delete require.cache[require.resolve(configPath)];
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
    for (const name of fs.readdirSync(ROOT)) console.error(' -', name);
  } catch {
    console.error(' (impossible de lire le dossier)');
  }
  console.error('');
  console.error('Solution : GIT_ADDRESS = https://github.com/genxshiiiro-collab/NEX31.git');
  console.error('');
  process.exit(1);
}

require(entry);
