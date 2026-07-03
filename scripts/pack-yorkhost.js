#!/usr/bin/env node
// Genere deploy/yorkhost/ — dossier pret a remplacer sur YorkHost.

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'deploy', 'yorkhost');
const ZIP = path.join(ROOT, 'deploy', 'YORKHOST-REMPLACER.zip');

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

const DEFAULT_DB = {
  tickets: {},
  reviews: {},
  orders: {},
  blacklist: {},
  panels: {},
  legacyReviews: {},
  payments: {},
  clientTotals: {},
  counters: { review: 0, order: 24, payment: 0 },
};

const LISEZMOI = `# NEX31 Bot — Remplacement manuel YorkHost
Build : ${build}
Genere : ${new Date().toISOString()}

## Contenu de CE build (${build})

[x] Bio rotatif .gg/thirty1 (change toutes les 30s)
[x] /livrer avec fichier OU lien
[x] /setsuivi hors ticket
[x] Zforce configure (serveur 1522263659672375396)
[x] PayPal Zforce @ZforceGraph
[x] Deploy auto des commandes au demarrage

## Etapes (upload manuel)

1. YorkHost → VIDE la variable GIT_ADDRESS (sinon Git ecrase tes fichiers)

2. Files → /home/container/
   - GARDE le fichier .env (ne le supprime pas !)
   - GARDE data/db.json si tu veux conserver commandes/tickets
   - Supprime le reste (index.js, src/, config.js, node_modules…)

3. Upload TOUT le CONTENU de ce dossier a la racine /home/container/
   (index.js, config.js, src/, package.json… PAS le dossier parent)

4. Startup : node index.js

5. Restart le serveur

6. Console : tu dois voir EXACTEMENT :
   [NEX31] Build ${build}

   Si tu vois "2026-07-03-presence" ou autre → mauvaise version, refais etape 2-3

## .env (a garder sur le serveur)

DISCORD_TOKEN=ton_token
CLIENT_ID=1521667381251014706
GUILD_ID=1486375983434174516,1522263659672375396

## Nouveautes de ce build

- Statut rotatif .gg/thirty1
- /livrer avec fichier OU lien
- /setsuivi hors ticket (staff)
- Paiements Zforce PayPal @ZforceGraph
- Deploy auto des commandes au demarrage
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

fs.mkdirSync(path.join(OUT, 'data'), { recursive: true });
if (!fs.existsSync(path.join(OUT, 'data', 'db.json'))) {
  fs.writeFileSync(path.join(OUT, 'data', 'db.json'), `${JSON.stringify(DEFAULT_DB, null, 2)}\n`);
}

copyFile(path.join(ROOT, '.env.example'), path.join(OUT, '.env.example'));
fs.writeFileSync(path.join(OUT, 'LISEZMOI-YORKHOST.txt'), LISEZMOI);
fs.writeFileSync(path.join(OUT, 'VERSION.txt'), `Build: ${build}\nGenere: ${new Date().toISOString()}\n\nBio rotatif + /livrer lien + Zforce + deploy auto\n`);

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
console.log('OK — dossier pret :');
console.log(' ', OUT);
if (fs.existsSync(ZIP)) console.log('OK — zip pret :', ZIP);
console.log('');
console.log('Remplace le contenu de /home/container/ sur YorkHost (garde .env).');
console.log('');
