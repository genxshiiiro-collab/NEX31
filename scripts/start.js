#!/usr/bin/env node
// Demarrage hebergeur : tente git pull puis lance le bot.
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

function tryGitPull() {
  if (!fs.existsSync(path.join(ROOT, '.git'))) {
    console.log('[NEX31] Pas de .git ici — YorkHost doit cloner via GIT_ADDRESS au demarrage.');
    return;
  }
  try {
    console.log('[NEX31] Sync GitHub (fetch + reset --hard origin/main)...');
    execSync('git fetch origin main', { cwd: ROOT, stdio: 'inherit' });
    execSync('git reset --hard origin/main', { cwd: ROOT, stdio: 'inherit' });
  } catch (err) {
    console.warn('[NEX31] sync git echoue:', err.message || err);
  }
}

tryGitPull();

let build = '?';
try {
  build = require(path.join(ROOT, 'config')).botBuild || '?';
} catch {
  console.warn('[NEX31] config.js introuvable ou invalide');
}

console.log('========================================');
console.log(`[NEX31] Build ${build}`);
console.log('[NEX31] Statut Discord rotatif (.gg/thirty1)');
console.log('========================================');

require(path.join(ROOT, 'index.js'));
