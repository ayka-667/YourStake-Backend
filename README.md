# YourStake Backend

Backend Node.js/Express + MongoDB (+ Socket.IO) du site **YourStake** : crash, roll, mines,
towers, duels, battles, blackjack, unbox, upgrader, chat, cashier et panel admin.

Ce dépôt contient aussi une **entrée serverless pour Vercel** (`api/index.js`), en plus du
serveur classique (`index.js`). Les deux partagent la même application Express (`app.js`).

---

## ⚠️ À lire avant de déployer sur Vercel

Vercel est une plateforme **serverless** : chaque requête HTTP réveille une fonction,
puis l'instance est mise en pause. Cela a des conséquences directes :

| Fonctionnalité | Sur Vercel | Pourquoi |
| --- | --- | --- |
| `GET /` (health) | ✅ | Route HTTP simple |
| `/auth/*` (inscription, connexion, OAuth, 2FA) | ✅ | Requêtes HTTP |
| `/callback/*` (Coinpayments, Skinify, Zebrasmarket) | ⚠️ | La base est mise à jour, mais aucun événement live n'est poussé (pas de Socket.IO) |
| Jeux en temps réel (crash, roll, mines, blackjack, duels, battles...) | ❌ | Toute la logique tourne dans Socket.IO |
| Chat, rain, leaderboard temps réel | ❌ | Socket.IO |
| Faux joueurs (`bots/`) | ❌ | Boucles `setInterval` longues |
| Cashier crédit (Puppeteer) | ❌ | Chromium indisponible |

**Recommandation** : garder le serveur de jeu complet (`npm start`) sur un hébergeur
persistant (VPS, Railway, Render, Fly.io, Pterodactyl...) et n'utiliser Vercel que pour
la partie HTTP. Si le site est déjà servi par `api.yourstake.fr`, le déploiement Vercel
peut servir de secours / de vitrine d'API, mais le temps réel restera cassé.

Pour un vrai temps réel sur Vercel, il faudrait externaliser Socket.IO (Ably, Pusher,
Redis adapter + serveur dédié...) : ce n'est pas fait ici.

---

## Déploiement sur Vercel

### 1. Importer le dépôt

1. Va sur [vercel.com/new](https://vercel.com/new).
2. Importe `ayka-667/YourStake-Backend`.
3. Framework preset : **Other**.
4. Build command : *vide* (aucun build nécessaire).
5. Output directory : *vide*.
6. Node.js version : **20.x** (déjà imposé par `engines` dans `package.json`).

La configuration est déjà dans `vercel.json` : toutes les requêtes sont redirigées vers
`api/index.js`, les dossiers `views/` et `public/` sont inclus dans la fonction, et la
région par défaut est Paris (`cdg1`).

### 2. Variables d'environnement

Dans **Project Settings → Environment Variables**, ajoute toutes les variables de
`config/config.example.env` (au minimum `DATABASE_URI`, `TOKEN_SECRET`,
`SERVER_FRONTEND_URL`, `SERVER_BACKEND_URL`, `CAPTCHA_SECRET`).

Le fichier `config/config.env` **n'est pas déployé et ne doit jamais être commité**.

Points importants :

- `DATABASE_URI` doit pointer vers une base **accessible depuis Internet**
  (MongoDB Atlas, par exemple). Une base sur `localhost` ou sur une IP privée ne
  fonctionnera pas. Pense à autoriser `0.0.0.0/0` dans Atlas (ou les IP Vercel).
- `SERVER_FRONTEND_URL` : URL(s) du frontend, séparées par des virgules. Sert au CORS.
- `SERVER_BACKEND_URL` : URL publique Vercel du backend (ex.
  `https://yourstake-backend.vercel.app`), utilisée pour les callbacks de paiement.
- `BOTS_ENABLED=false` : les bots ne démarrent pas sur Vercel de toute façon, mais
  autant le laisser désactivé.
- `NODE_ENV=production`.

Après ajout des variables, **redéploie** (Deployments → Redeploy) pour qu'elles soient
prises en compte.

### 3. Vérifier

```bash
curl https://<ton-projet>.vercel.app/
# {"success":true}

curl https://<ton-projet>.vercel.app/health
# {"success":true,"uptime":...}
```

Si tu obtiens `503 Service unavailable`, regarde les logs de la fonction : la connexion
MongoDB a échoué (URI, IP whitelist ou mot de passe).

### 4. Brancher le frontend

Dans le frontend, mets à jour `.env.production` :

```env
VUE_APP_BACKEND_URL=https://<ton-projet>.vercel.app
VUE_APP_SOCKET_URL=https://api.yourstake.fr   # le serveur Socket.IO reste ailleurs
```

---

## Développement local / serveur complet

```bash
npm install
cp config/config.example.env config/config.env   # puis remplir les valeurs
npm run dev                                      # nodemon, port 5001
# ou
npm start
```

Le serveur local lance Express **et** Socket.IO, les boucles de jeu et les bots
(`BOTS_ENABLED=true`).

---

## Structure

```
api/index.js       Point d'entrée Vercel (handler serverless)
app.js             Application Express partagée (routes, CORS, init DB/settings)
index.js           Serveur long-running (HTTP + Socket.IO + bots) pour le local/VPS
database/          Connexion Mongoose (pool réutilisé entre invocations) + modèles
routes/            Routes HTTP (/auth, /callback)
controllers/       Logique métier (appelée par les routes et les sockets)
sockets/           Événements Socket.IO (non montés sur Vercel)
bots/              Faux joueurs (non montés sur Vercel)
utils/             Helpers (settings, jeux, cashier, mail...)
views/, public/    Templates EJS et assets statiques
config/            config.env local (gitignoré) + exemple
```

---

## Sécurité

- `config/config.env` contient des secrets (URI MongoDB avec mot de passe, `TOKEN_SECRET`,
  clés API). Il est désormais **gitignoré**. Si ces valeurs ont déjà été publiées
  ailleurs (ancien dépôt public), considère-les comme compromises :
  change le mot de passe MongoDB, régénère `TOKEN_SECRET` et les clés API.
- Change `TOKEN_SECRET` invalidera les sessions JWT en cours (les utilisateurs devront
  se reconnecter), c'est normal.
