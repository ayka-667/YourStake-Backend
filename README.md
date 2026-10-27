# YourStake Backend

Backend Node.js/Express + MongoDB + Socket.IO du site **YourStake** : crash, roll, mines,
towers, duels, battles, blackjack, unbox, upgrader, chat, cashier et panel admin.

Le serveur complet tourne dans **un seul processus** (`index.js`) : HTTP, Socket.IO, boucles
de jeu et faux joueurs. C'est ce processus qu'il faut lancer sur un **panel Pterodactyl**
(ou un VPS classique).

---

## Sommaire

- [Déploiement sur Pterodactyl](#déploiement-sur-pterodactyl)
- [Variables d'environnement](#variables-denvironnement)
- [Mettre à jour le serveur](#mettre-à-jour-le-serveur)
- [Dépannage](#dépannage)
- [Autres hébergements (VPS, Docker)](#autres-hébergements)
- [Vercel (optionnel, limité)](#vercel-optionnel-limité)
- [Structure du projet](#structure-du-projet)
- [Sécurité](#sécurité)

---

## Déploiement sur Pterodactyl

### 0. Prérequis

- Un panel Pterodactyl fonctionnel, avec un node qui a assez de RAM
  (**1 Go minimum**, 2 Go conseillés si `BOTS_ENABLED=true`).
- L'egg **Node.js** générique (celui de `parkervcp/eggs`, dossier `generic/nodejs`).
  Image recommandée : `ghcr.io/parkervcp/yolks:nodejs_20` (Node 20).
- Une base MongoDB **accessible depuis le node** (celle que tu utilises déjà :
  `82.26.80.98:27007`). Si Mongo tourne sur le même machine, vérifie qu'il écoute sur une
  IP/port joignable depuis le conteneur, pas seulement `127.0.0.1`.
- Le dépôt GitHub : `https://github.com/ayka-667/YourStake-Backend`.

### 1. Créer le serveur dans le panel

1. **Admin → Servers → Create Server** (ou depuis la page d'accueil si tu es revendeur).
2. **Nest / Egg** : `Node.js` (generic).
3. **Docker Image** : `ghcr.io/parkervcp/yolks:nodejs_20`.
4. **Allocation** : choisis/crée un port libre, par exemple `5001`. C'est ce port que
   Wings injecte dans la variable `SERVER_PORT` : l'application écoute automatiquement
   dessus, **ne mets pas `SERVER_PORT` dans `config/config.env`** sur Pterodactyl.
5. **Startup Command** : `npm start` (c'est déjà la commande du `package.json`).
   Si l'egg utilise une variable `MAIN_FILE`, mets `index.js`.
6. **RAM / CPU** : 1024 Mo minimum, 2048 Mo conseillés avec les bots.
7. Crée le serveur, puis **note l'allocation** (`IP du node:PORT`) et les identifiants
   **SFTP** (onglet *SFTP Details*).

### 2. Récupérer le code

**Option A — Git (le plus simple)**

Dans la **console** du serveur (ou en SSH dans `/home/container`) :

```bash
cd /home/container
git clone https://github.com/ayka-667/YourStake-Backend.git .
```

Le point final est important : le code doit être **à la racine** du serveur, pas dans un
sous-dossier. Si le dossier n'est pas vide, vide-le d'abord (sauf `lost+found`).

**Option B — SFTP / ZIP**

1. Sur ton PC, zippe le dossier du backend **sans** `node_modules`, `.git` ni
   `config/config.env`.
2. Panel → **Files** → upload du zip → clic droit → **Unarchive**.
3. Vérifie que `index.js`, `package.json` et `config/` sont bien à la racine.

### 3. Créer `config/config.env`

Le backend lit sa configuration dans `config/config.env` (fichier **non versionné**,
il contient les secrets). Deux méthodes :

- **File Manager** : va dans `config/`, **New File** → `config.env`, puis colle le contenu
  de `config/config.example.env` en remplaçant les valeurs.
- **SFTP** : envoie ton fichier local `config/config.env` dans `/home/container/config/`.

Minimum à renseigner :

```env
NODE_ENV=production
DATABASE_URI=mongodb://user:password@host:27017/yourstake?authSource=yourstake
SERVER_FRONTEND_URL=https://yourstake.fr
SERVER_BACKEND_URL=https://api.yourstake.fr
TOKEN_SECRET=<longue chaîne aléatoire>
CAPTCHA_SECRET=<secret hCaptcha>

# Faux joueurs : true pour les activer
BOTS_ENABLED=true
BOTS_COUNT=100
BOTS_WHALES=5
```

Pour générer un `TOKEN_SECRET` :

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

> Attention : si tu réutilises le `TOKEN_SECRET` de l'ancien dépôt public, régénère-le
> (toutes les sessions JWT seront invalidées, les joueurs devront se reconnecter).

### 4. Installer et démarrer

L'egg Node.js lance `npm install` tout seul au démarrage. Sinon, dans la console :

```bash
npm install --omit=dev
```

Puis clique sur **Start** (ou redémarre le serveur). Dans les logs tu dois voir :

```
MongoDB Connected: <host>
Server running in production mode on http://0.0.0.0:5001
[bots] 100 fake players running (5 high rollers)
```

- `MongoDB Connected` → la base répond.
- `Server running...` → le port est le bon (celui de l'allocation).
- `[bots]` → seulement si `BOTS_ENABLED=true`.

### 5. Vérifier

Depuis ton navigateur ou en SSH :

```bash
curl http://<IP-du-node>:<PORT>/
# {"success":true}

curl http://<IP-du-node>:<PORT>/health
# {"success":true,"uptime":...}
```

Si tu obtiens `503` : la connexion MongoDB a échoué (URI, mot de passe, IP non autorisée
ou base non joignable depuis le node).

### 6. Domaine + HTTPS

Pterodactyl ne gère **pas** le HTTPS : Wings expose du HTTP sur `IP:PORT`. Trois solutions :

1. **Cloudflare (le plus simple, recommandé)** : crée un enregistrement DNS `A`
   `api` → IP du node, active le proxy orange. SSL/TLS → mode **Full** ou **Full
   (strict)**. Les WebSockets sont pris en charge par défaut : indispensable pour
   Socket.IO.
2. **Nginx + certbot sur le node** : voir `deploy/nginx.conf` (les en-têtes
   `Upgrade`/`Connection` sont obligatoires pour Socket.IO), puis
   `certbot --nginx -d api.yourstake.fr`.
3. **Un reverse proxy existant** : fais pointer `https://api.yourstake.fr` vers
   `http://IP:PORT` en pensant aux WebSockets et à `X-Forwarded-For`.

Ensuite, côté frontend (`.env.production`) :

```env
VUE_APP_BACKEND_URL=https://api.yourstake.fr
VUE_APP_SOCKET_URL=https://api.yourstake.fr
```

Si un ancien serveur occupait déjà ce domaine/port sur le panel, **arrête-le** avant de
démarrer le nouveau (le port et le domaine ne peuvent pas être partagés).

### 7. Redémarrages

- Pterodactyl redémarre le conteneur automatiquement en cas de crash.
- Évite **PM2 à l'intérieur du panel** : Wings gère déjà le processus. PM2 est prévu pour
  un VPS classique (voir `ecosystem.config.js`).
- Garde **une seule instance** : l'état des parties, du chat et des bots est en mémoire.
  Deux instances = deux mondes de jeu différents.

---

## Variables d'environnement

Le fichier complet est `config/config.example.env`. Les principales :

| Variable | Rôle |
| --- | --- |
| `DATABASE_URI` | URI MongoDB, **obligatoire** |
| `TOKEN_SECRET` | Signature des JWT, **obligatoire** |
| `TOKEN_EXPIRE` | Durée des sessions (`1w`, `7d`...) |
| `SERVER_FRONTEND_URL` | URL(s) du frontend, séparées par des virgules (CORS + e-mails) |
| `SERVER_BACKEND_URL` | URL publique du backend (callbacks de paiement) |
| `CAPTCHA_SECRET` | Secret hCaptcha |
| `DISCORD_CLIENT_ID/SECRET`, `GOOGLE_CLIENT_ID` | Connexion OAuth |
| `EMAIL_SMTP_*`, `EMAIL_FROM*` | Envoi d'e-mails |
| `COINPAYMENTS_*`, `ZEBRASMARKET_*`, `SKINIFY_API_KEY` | Cashier |
| `BOTS_ENABLED`, `BOTS_COUNT`, `BOTS_WHALES` | Faux joueurs (serveur long-running uniquement) |
| `CHROME_PATH` | Chrome/Chromium pour le cashier crédit (optionnel) |

Sur Pterodactyl, `SERVER_PORT` et `NODE_ENV` sont fournis par Wings : Ne les mets pas dans
`config.env`, sauf si tu veux forcer une valeur hors panel.

---

## Mettre à jour le serveur

**Avec Git :**

```bash
cd /home/container
git pull
npm install --omit=dev
```

Puis **Restart** depuis le panel.

**Sans Git :** re-uploade les fichiers modifiés en SFTP, puis Restart.

Le fichier `config/config.env` et la base de données ne sont pas touchés par une mise à
jour.

---

## Dépannage

| Symptôme | Piste |
| --- | --- |
| `503 Service unavailable` | MongoDB injoignable : URI, mot de passe, IP autorisée, port ouvert |
| Le serveur écoute sur `5001` mais le panel attend un autre port | `SERVER_PORT` est fourni par Wings : supprime-le de `config.env` |
| `Cannot find module ...` | `npm install --omit=dev` dans la console |
| Le site charge mais pas le temps réel | WebSockets bloqués (Cloudflare/proxy) ou `VUE_APP_SOCKET_URL` incorrect |
| `EADDRINUSE` | Une autre instance tourne déjà sur l'allocation (ancien serveur à arrêter) |
| Démarrage très long | `npm install` à chaque boot : normal au premier lancement, les suivants sont plus rapides |
| Bots absents | `BOTS_ENABLED=true` et regarde les logs `[bots]` |

---

## Autres hébergements

Les fichiers sont fournis pour un VPS classique :

- `ecosystem.config.js` : PM2 (`pm2 start ecosystem.config.js`), **1 instance**.
- `deploy/yourstake-backend.service` : unité systemd.
- `deploy/nginx.conf` : reverse proxy + WebSockets.
- `Dockerfile` / `docker-compose.yml` : image Node 20, `config/config.env` monté via
  `env_file`, port bindé sur `127.0.0.1`.

```bash
npm ci --omit=dev
npm start
```

---

## Vercel (optionnel, limité)

Le dépôt contient aussi une entrée serverless (`api/index.js` + `vercel.json`). Elle
fonctionne pour les routes HTTP (`/`, `/health`, `/auth/*`, `/callback/*`), **mais pas**
pour Socket.IO, les jeux en temps réel, le chat, les boucles de jeu ni les bots : Vercel
ne maintient pas de processus vivant. Sur Vercel, il faut aussi une base MongoDB
accessible depuis Internet (Atlas...). Cette option est donc réservée à l'API HTTP ;
pour le jeu complet, utilise Pterodactyl/VPS.

---

## Structure du projet

```
index.js           Serveur complet : HTTP + Socket.IO + jeu + bots (Pterodactyl/VPS)
app.js             Application Express partagée (routes, CORS, init DB/settings)
api/index.js       Entrée serverless Vercel (API HTTP uniquement)
database/          Connexion Mongoose (pool réutilisé) + modèles
routes/            Routes HTTP (/auth, /callback)
controllers/       Logique métier (appelée par les routes et les sockets)
sockets/           Événements Socket.IO
bots/              Faux joueurs
utils/             Helpers (settings, jeux, cashier, mail...)
views/, public/    Templates EJS et assets statiques
config/            config.env local (gitignoré) + exemple
deploy/            nginx.conf et unité systemd
```

---

## Sécurité

- `config/config.env` contient l'URI MongoDB avec mot de passe, `TOKEN_SECRET` et les clés
  API. Il est **gitignoré** : ne le commit jamais, ne le mets pas dans un zip public.
- Si ces valeurs ont déjà été publiées (ancien dépôt public), considère-les comme
  compromises : change le mot de passe MongoDB et régénère `TOKEN_SECRET` + clés API.
- Sur Pterodactyl, les fichiers du serveur sont accessibles aux autres admins du panel :
  limite les accès au panel.
