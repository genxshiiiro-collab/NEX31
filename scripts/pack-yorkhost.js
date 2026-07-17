#!/usr/bin/env node
// Genere deploy/GLISSER-SUR-YORKHOST/ — glisser le contenu sur YorkHost.

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'deploy', 'GLISSER-SUR-YORKHOST');
const ZIP = path.join(ROOT, 'deploy', 'GLISSER-SUR-YORKHOST.zip');

const COPY_FILES = [
  'index.js',
  'server.js',
  'config.js',
  'package.json',
  'package-lock.json',
  'ecosystem.config.js',
];

const SKIP_IN_SRC = new Set(['scripts']);
const SKIP_IN_SCRIPTS = new Set(['pack-yorkhost.js']);

function rimraf(dir) {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

function copyFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function copyDir(srcDir, destDir, skipNames = new Set()) {
  fs.mkdirSync(destDir, { recursive: true });
  for (const name of fs.readdirSync(srcDir)) {
    if (skipNames.has(name)) continue;
    const src = path.join(srcDir, name);
    const dest = path.join(destDir, name);
    if (fs.statSync(src).isDirectory()) copyDir(src, dest, skipNames);
    else copyFile(src, dest);
  }
}

function copyScriptsDir() {
  const srcDir = path.join(ROOT, 'scripts');
  const destDir = path.join(OUT, 'scripts');
  fs.mkdirSync(destDir, { recursive: true });
  for (const name of fs.readdirSync(srcDir)) {
    if (SKIP_IN_SCRIPTS.has(name)) continue;
    copyFile(path.join(srcDir, name), path.join(destDir, name));
  }
}

let build = '?';
try {
  build = require(path.join(ROOT, 'config')).botBuild || '?';
} catch { /* ignore */ }

const LISEMOI = `NEX31 — GLISSER SUR YORKHOST (upload manuel)
Build : ${build}
Genere : ${new Date().toLocaleString('fr-FR')}

=== IMPORTANT (les 2 causes de crash) ===
- La variable GIT_ADDRESS doit etre VIDE (sinon YorkHost tente un clone Git
  au lieu de lancer tes fichiers -> "Cannot find module index.js").
- index.js doit finir A LA RACINE /home/container/index.js
  (PAS dans un sous-dossier comme /home/container/GLISSER-SUR-YORKHOST/).

=== ETAPES ===

1. YorkHost → Startup : laisse GIT_ADDRESS VIDE. Fichier de demarrage = index.js

2. YorkHost → Files → /home/container/

3. GARDE ces fichiers/dossiers (ne les supprime PAS) :
   - .env               (ton token)
   - data/              (db.json : commandes, tickets, compteurs)
   - node_modules/      (dependances deja installees)

4. Remplace le CODE (tu peux ecraser) :
   index.js, config.js, src/, package.json, package-lock.json...
   -> Uploade le CONTENU de ce dossier (pas le dossier lui-meme) dans /home/container/

5. Verifie : /home/container/index.js et /home/container/src/ existent bien a la racine

6. Restart le serveur

=== CONSOLE OK ===

[NEX31] Build ${build}
[NEX31] Pas de .git — sync GitHub ignoree.
Deploy termine : 2/2 serveur(s) OK

Si erreur "Cannot find module 'discord.js'" : node_modules absent.
-> Reinstall le serveur, ou console : npm install

Startup YorkHost : node index.js
`;

rimraf(OUT);
fs.mkdirSync(OUT, { recursive: true });

for (const f of COPY_FILES) {
  const src = path.join(ROOT, f);
  if (!fs.existsSync(src)) {
    console.error(`Manquant : ${f}`);
    process.exit(1);
  }
  copyFile(src, path.join(OUT, f));
}

copyDir(path.join(ROOT, 'src'), path.join(OUT, 'src'), SKIP_IN_SRC);
copyScriptsDir();

copyFile(path.join(ROOT, '.env.example'), path.join(OUT, '.env.example'));
fs.writeFileSync(path.join(OUT, '!!! LISE-MOI.txt'), LISEMOI);
fs.writeFileSync(path.join(OUT, 'VERSION.txt'), `${build}\n${new Date().toISOString()}\n`);

try { fs.rmSync(ZIP, { force: true }); } catch { /* ignore */ }
try {
  if (process.platform === 'win32') {
    execSync(
      `powershell -NoProfile -Command "Compress-Archive -Path '${OUT.replace(/'/g, "''")}\\*' -DestinationPath '${ZIP.replace(/'/g, "''")}' -Force"`,
      { stdio: 'inherit' },
    );
  }
} catch (err) {
  console.warn('Zip non cree:', err.message);
}

console.log('');
console.log('========================================');
console.log('  DOSSIER PRET — glisse sur YorkHost :');
console.log(' ', OUT);
if (fs.existsSync(ZIP)) console.log('  (ou zip :', ZIP + ')');
console.log('========================================');
console.log('Garde .env et data/db.json sur le serveur.');
console.log('');
