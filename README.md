# Nex31 — Bot Discord de gestion clients (revente graphiste)

Bot Discord pour gérer les clients d'un serveur de revente graphiste : tickets avec
pastilles de statut, avis clients validés par le staff, suivi des commandes, stats et plus.

## ✨ Fonctionnalités

### 🎫 Ouverture de tickets (`/panel`)
Le staff publie un panneau avec `/panel` : les membres choisissent un motif dans un menu
déroulant (🛒 Commande / ❓ Question / ⚠️ Réclamation) pour ouvrir un **ticket privé**.
- Salon créé automatiquement dans la catégorie de tickets, visible uniquement par le membre + le staff.
- Un seul ticket ouvert par personne (anti-doublon).
- Bouton **🔒 Fermer** dans le ticket (avec confirmation) → archive + suppression.

### 🔴🟢 Pastilles de statut sur les tickets
Quand quelqu'un écrit dans un salon de ticket, le salon est renommé automatiquement :
- **🔴 un membre écrit** → `🔴-pseudo` (en attente d'une réponse du staff)
- **🟢 le staff répond** → `🟢-pseudo` (pris en charge)

D'un coup d'œil sur ta liste de salons, tu vois quels tickets attendent une réponse.

> ⚠️ **Important — limite Discord :** Discord n'autorise que **2 renommages de salon
> toutes les 10 minutes** par salon. Le bot gère ça intelligemment (file d'attente +
> regroupement), mais si beaucoup de messages s'enchaînent, le changement de pastille
> peut être différé de quelques minutes. C'est une limite de Discord, pas un bug.

### ⭐ Système d'avis `/avis`
- Réservé aux membres ayant le **rôle client**.
- Le client choisit une note (1–5), la prestation et son commentaire.
- L'avis arrive dans un **salon de validation staff** avec deux boutons : ✅ Valider / ❌ Refuser.
- Une fois validé, il est **publié automatiquement** dans le salon d'avis public.
- En cas de refus, le staff indique une raison et le client est prévenu en MP.

### 📦 Commandes — `+commande` / `/commande` (bonus)
Deux façons de créer une commande (réservé au staff) :
- **Texte (rapide) :** `+commande @client <prix> <prestation> [@graphiste]`
  Exemple : `+commande @Jean 25 Logo gaming + bannière @MonGraphiste`
- **Slash :** `/commande creer` (client, prestation, prix, graphiste).

**Autorole :** dès qu'une commande est créée, le client reçoit automatiquement le **rôle client**.

**Statut en 4 étapes** (boutons ⬅️ / ➡️ / 🚫 sous la commande) :
> 📥 Commande reçue → 🎨 En cours de création → 🔍 En révision → ✅ Livrée

Une barre de progression `🟩🟩⬜⬜` et la liste des étapes se mettent à jour à chaque clic.
À la livraison (étape 4), le client est prévenu en MP et invité à laisser un avis.
- `/commande liste` — liste les commandes (filtre par client possible).

### 📊 Stats `/stats` (bonus)
Note moyenne, nombre d'avis publiés/en attente, commandes livrées/en cours,
chiffre d'affaires, tickets en attente.

### 🔔 Relance auto + `/close` avec transcript (bonus)
- Si un ticket reste **🔴 sans réponse** plus de X minutes (réglable), le staff est pingué.
- `/close` archive un **transcript** du ticket dans le salon de logs puis supprime le salon.

### 📦 Livraison avec fichier — `/livrer`
`/livrer commande:#id fichier:<pièce jointe> [message]` : marque la commande comme livrée,
poste le **fichier téléchargeable** + le récap dans le salon commandes, et **envoie le fichier
en MP au client** avec une invitation à laisser un avis.

### 🧰 Autres commandes de gestion
- **`/profil [client]`** — fiche client : nb de commandes, total dépensé, avis, historique. (Le staff voit tout le monde ; un membre voit sa propre fiche.)
- **`/ticket add|remove`** — ajouter / retirer un membre du ticket courant.
- **`/ticket renommer`** — renommer le ticket en gardant la pastille.
- **🙋 Prendre en charge** — bouton dans chaque ticket : le staff « claim » le ticket (passe au 🟢).
- **`/blacklist add|remove|list`** — bloquer un client (l'empêche d'ouvrir un ticket et de laisser un avis).

> **Qui est « staff » ?** Un membre avec un rôle staff configuré **OU** ayant la permission
> *Gérer le serveur* / *Administrateur*. Les gérants sont donc toujours reconnus, même si l'ID
> de rôle n'est pas encore rempli dans `config.js`.

---

## 🚀 Installation

### 1. Prérequis
- [Node.js](https://nodejs.org/) 18 ou plus.

### 2. Créer l'application Discord
1. Va sur https://discord.com/developers/applications → **New Application**.
2. Onglet **Bot** → **Reset Token** → copie le token.
3. Onglet **Bot** → active l'intent privilégié **MESSAGE CONTENT INTENT**
   (obligatoire pour les commandes texte comme `+commande`).
4. Onglet **OAuth2 → URL Generator** : coche `bot` + `applications.commands`,
   puis dans les permissions : `Manage Roles` (autorole client), `Manage Channels`,
   `Send Messages`, `Read Message History`, `Embed Links`, `Attach Files`.
   Ouvre l'URL générée pour inviter le bot sur ton serveur.

   > ⚠️ Pour l'autorole : dans **Paramètres du serveur → Rôles**, place le rôle du **bot
   > au-dessus** du rôle *client*, sinon Discord l'empêchera de l'attribuer.

### 3. Configurer
```bash
cd C:\Nex31\discord-bot
npm install
copy .env.example .env       # (PowerShell : Copy-Item .env.example .env)
```
- Remplis **`.env`** : `DISCORD_TOKEN`, `CLIENT_ID` (ID de l'application), `GUILD_ID`.
  > **Multi-serveurs :** `GUILD_ID` accepte plusieurs serveurs séparés par des virgules,
  > ex : `GUILD_ID=111111,222222`. Les commandes `/` seront déployées sur chacun.
- Remplis **`config.js`** : les rôles et salons se règlent **par serveur** dans l'objet
  `guilds`, avec l'ID du serveur comme clé. Chaque serveur a ses propres IDs (rôles staff /
  client / graphiste, catégorie tickets, salons validation avis / avis public / commandes / logs).
  Les réglages communs (pastilles, préfixe, couleurs, relance) sont dans `shared`.
  > Active le **Mode développeur** dans Discord (Paramètres → Avancés) pour copier les IDs
  > (clic droit → Copier l'ID). Un serveur laissé non configuré ne plante pas : ses
  > fonctions liées aux salons/rôles restent simplement inactives.

### 4. Déployer les commandes puis lancer

**Option A — en double-cliquant (le plus simple) :**
1. Double-clique sur **`DEPLOYER-COMMANDES.bat`** (une seule fois, puis à chaque nouvelle commande).
2. Double-clique sur **`START-BOT.bat`** pour démarrer le bot. Ferme la fenêtre pour l'arrêter.
   > Astuce : clic droit sur `START-BOT.bat` → « Envoyer vers → Bureau » pour avoir un raccourci.

**Option B — en ligne de commande :**
```bash
npm run deploy   # enregistre /panel, /avis, /commande, /stats, /close
npm start        # lance le bot
```

---

## 🗂️ Structure
```
discord-bot/
├── START-BOT.bat             # double-clic pour démarrer le bot
├── DEPLOYER-COMMANDES.bat    # double-clic pour enregistrer les commandes /
├── config.js                 # tous les IDs et réglages
├── .env                      # token (ne pas partager)
├── data/db.json              # données (avis, commandes, tickets) — créé tout seul
└── src/
    ├── index.js              # démarrage
    ├── deploy-commands.js     # enregistrement des commandes
    ├── storage.js            # persistance JSON
    ├── lib/
    │   ├── renameQueue.js     # renommage anti rate-limit
    │   ├── tickets.js         # création / fermeture des tickets + transcript
    │   ├── prefixCommands.js  # commandes texte (+commande)
    │   └── helpers.js         # rôles, pastilles, embeds
    ├── events/
    │   ├── ready.js           # présence + relance auto
    │   ├── messageCreate.js   # pastilles + commandes préfixe
    │   └── interactionCreate.js # commandes, menus, boutons, modals
    └── commands/
        ├── panel.js · avis.js · commande.js · stats.js · close.js
```

## 💡 Notes
- Les données sont stockées en JSON local (aucune base à installer). Pour repartir de zéro,
  supprime `data/db.json`.
- Seul l'intent privilégié **Message Content** est requis (pour `+commande`). Le bot a aussi
  besoin de la permission **Manage Roles** pour l'autorole client.
"# NEX31" 
