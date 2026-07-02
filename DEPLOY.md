# Hebergement du bot

## Fichiers necessaires sur le serveur

```
discord-bot/
  config.js          # IDs roles / salons par serveur
  package.json
  package-lock.json
  src/
  .env               # secrets (NE PAS commit)
  data/              # cree automatiquement (db.json)
```

## Variables d'environnement (.env)

```env
DISCORD_TOKEN=...
CLIENT_ID=...
GUILD_ID=1486375983434174516,1520540847936901120
```

## Installation (VPS Linux)

```bash
cd discord-bot
npm ci --omit=dev
cp .env.example .env   # puis editer .env
npm run deploy
npm start
```

## PM2 (recommande)

```bash
npm install -g pm2
npm run deploy
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

Commandes utiles :

```bash
pm2 logs nex31-discord-bot
pm2 restart nex31-discord-bot
pm2 stop nex31-discord-bot
```

## YorkHost avec Git (recommande)

YorkHost clone le repo au demarrage puis lance `node index.js`. Le repo doit contenir **index.js**, **src/**, **config.js**, **package.json** a la racine.

### 1. GitHub — une seule fois

Sur ton PC, dans le dossier du bot :

```bash
git init
git add .
git commit -m "Bot Discord Nex31 — deploy YorkHost"
git branch -M main
git remote add origin https://github.com/TON_USER/TON_REPO.git
git push -u origin main
```

Creer le repo vide sur GitHub avant le `push` (sans README si tu pushes deja le code).

### 2. YorkHost — Variables

| Variable | Valeur |
|----------|--------|
| `GIT_ADDRESS` | `https://github.com/TON_USER/TON_REPO.git` |
| `GIT_USERNAME` | ton pseudo GitHub |
| `GIT_TOKEN` | token GitHub (Settings → Developer settings → Personal access tokens) |
| `DISCORD_TOKEN` | token du bot Discord |
| `CLIENT_ID` | `1521667381251014706` |
| `GUILD_ID` | `1486375983434174516,1520540847936901120` |

Le token GitHub doit avoir au minimum la permission **repo** (lecture du depot prive si besoin).

### 3. YorkHost — Startup

```
node index.js
```

(ou `npm start` — equivalent)

### 4. Premier demarrage

1. **Start** le serveur (YorkHost fait `git pull` + `npm install` + lance le bot)
2. Console : `npm run deploy`
3. **Restart**

Prochaine commande client : **#25** (`initialOrderCounter` dans config.js).

### 5. Mises a jour

```bash
git add .
git commit -m "ta modif"
git push
```

Puis **Restart** le serveur YorkHost (il refait un `git pull`).

---

## YorkHost sans Git (upload manuel)

Utilise le zip genere : `npm run pack:host` → `deploy/YORKHOST-UPLOAD.zip`

1. Upload le **contenu** du zip a `/home/container/` (pas dans un sous-dossier)
2. Laisse **GIT_ADDRESS vide**
3. Variables : `DISCORD_TOKEN`, `CLIENT_ID`, `GUILD_ID`
4. Startup : `node index.js`

## Docker

```bash
docker build -t nex31-discord-bot .
docker run -d --name nex31-bot --env-file .env -v nex31-data:/app/data --restart unless-stopped nex31-discord-bot
```

## Intents Discord (portail developpeur)

- MESSAGE CONTENT INTENT (commandes +commande)
- Bot invite avec `bot` + `applications.commands`
- Permission bot : Gerer les salons, Gerer les roles, Joindre des fichiers

## Apres mise a jour du code

```bash
git pull
npm ci --omit=dev
npm run deploy
pm2 restart nex31-discord-bot
```

## Pastilles tickets

Verification automatique **chaque minute** : le bot compare le nom des salons ticket avec le statut en base et corrige si besoin.
