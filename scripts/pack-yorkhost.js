#!/usr/bin/env node
// Genere deploy/yorkhost/ — dossier pret a uploader sur YorkHost (SFTP ou drag & drop).

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'deploy', 'yorkhost');

const COPY_FILES = [
  'index.js',
  'server.js',
  'config.js',
  'package.json',
  'package-lock.json',
  'ecosystem.config.js',
];

const COPY_DIRS = ['src', 'scripts'];

const SKIP_IN_SRC = new Set(['scripts']); // outils dev locaux

function rimraf(dir) {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

function copyFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function copyDir(srcDir, destDir, skipDirs = new Set()) {
  fs.mkdirSync(destDir, { recursive: true });
  for (const name of fs.readdirSync(srcDir)) {
    if (skipDirs.has(name)) continue;
    const src = path.join(srcDir, name);
    const dest = path.join(destDir, name);
    if (fs.statSync(src).isDirectory()) copyDir(src, dest, skipDirs);
    else copyFile(src, dest);
  }
}

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

const LISEZMOI = `# ThirtyOne Lab's Bot — YorkHost (drag & drop)

## ERREUR "Cannot find module index.js" ?

Ca veut dire que les fichiers ne sont PAS a la racine du serveur.
YorkHost cherche : /home/container/index.js

---

## Methode A — Upload manuel (recommande)

1. Panel YorkHost → Files (SFTP) → ouvre /home/container/
2. SUPPRIME tout le contenu actuel (ancien essai)
3. Upload TOUT le contenu de CE dossier (index.js, src/, package.json…)
   ⚠️ PAS le dossier "yorkhost" lui-meme — ouvre le zip et mets les fichiers directement a la racine
4. Console → tape : ls -la
   Tu dois voir : index.js   package.json   src/
5. Si tu vois seulement "yorkhost/" comme dossier → mauvais upload, refais etape 3

## Methode B — Git configure dans YorkHost

Si GIT_ADDRESS est rempli dans Variables, YorkHost ignore ton upload et pull GitHub.
→ Soit push ce projet (avec index.js) sur le repo Git
→ Soit VIDE la variable GIT_ADDRESS et utilise la methode A

## Variables (onglet Variables)

DISCORD_TOKEN=ton_token
CLIENT_ID=1521667381251014706
GUILD_ID=1486375983434174516,1520540847936901120

## Commande de demarrage (onglet Startup)

Choisis UNE de ces commandes :

    node index.js

ou

    node src/index.js

ou

    npm start

## Premier lancement

1. Demarre → attends "Connecte en tant que..."
2. Console : npm run deploy
3. Redemarre

Prochaine commande client : #25
`;

const STARTUP = `node src/index.js
`;

const VERIF = `Fichiers requis a la racine /home/container/ :
  index.js
  server.js
  package.json
  config.js
  src/index.js
  data/db.json

Genere le : ${new Date().toISOString()}
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

for (const d of COPY_DIRS) {
  copyDir(path.join(ROOT, d), path.join(OUT, d), SKIP_IN_SRC);
}

fs.mkdirSync(path.join(OUT, 'data'), { recursive: true });
fs.writeFileSync(path.join(OUT, 'data', 'db.json'), `${JSON.stringify(DEFAULT_DB, null, 2)}\n`);

copyFile(path.join(ROOT, '.env.example'), path.join(OUT, '.env.example'));
fs.writeFileSync(path.join(OUT, 'LISEZMOI-YORKHOST.txt'), LISEZMOI);
fs.writeFileSync(path.join(OUT, 'COMMANDE-DEMARRAGE.txt'), STARTUP);
fs.writeFileSync(path.join(OUT, '_VERIF-FICHIERS.txt'), VERIF);

const zipPath = path.join(ROOT, 'deploy', 'YORKHOST-UPLOAD.zip');
try {
  fs.rmSync(zipPath, { force: true });
} catch { /* ignore */ }

console.log(`\nOK — dossier pret : ${OUT}`);
console.log('Upload le CONTENU de ce dossier a /home/container/ sur YorkHost.');
console.log('Lis LISEZMOI-YORKHOST.txt si index.js introuvable.\n');
