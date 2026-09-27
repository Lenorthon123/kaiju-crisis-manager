# Déploiement

Deux services, deux hébergeurs, une base.

| Composant | Hébergeur | Source |
|---|---|---|
| API NestJS | Railway | `backend/Dockerfile` |
| PostgreSQL | Railway | add-on du même projet |
| Interface React | Vercel | `frontend/` |

L'API est conteneurisée plutôt que laissée à la détection automatique : le
`Dockerfile` génère le client Prisma et compile le TypeScript dans une première
étape, puis ne transporte dans l'image finale que `dist`, `prisma` et le
`node_modules` déjà peuplé. Le déploiement ne télécharge donc aucun moteur
Prisma, ce qui est précisément l'étape qui échoue derrière un réseau filtré.

## Ordre des opérations

L'API et le front se référencent mutuellement, il faut donc déployer en trois
temps, sans quoi on se retrouve à renseigner une URL qui n'existe pas encore.

### 1. La base et l'API

1. Railway → **New Project** → **Deploy from GitHub repo** → `kaiju-crisis-manager`.
2. **Root Directory** : `backend`. Railway détecte le `Dockerfile`.
3. Dans le même projet : **New** → **Database** → **PostgreSQL**.
4. Variables du service API :

   | Variable | Valeur |
   |---|---|
   | `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (référence Railway, pas une copie) |
   | `JWT_SECRET` | 32 caractères aléatoires — `openssl rand -base64 32` |
   | `NODE_ENV` | `production` |
   | `CORS_ORIGIN` | `*` pour l'instant, corrigé à l'étape 3 |

   `PORT` est injecté par Railway, ne pas le définir.

5. **Settings** → **Networking** → **Generate Domain**. Health check : `/api/health`.

Les migrations sont jouées à chaque démarrage par `docker-entrypoint.sh`
(`prisma migrate deploy`). Le seed, lui, n'y est pas : il vide toutes les tables
avant d'écrire, un simple redémarrage effacerait donc les données en pleine
soutenance.

### 2. Le front

1. Vercel → **Add New Project** → même dépôt.
2. **Root Directory** : `frontend`. Le `vercel.json` fournit le reste.
3. Variable : `VITE_API_URL` = l'URL Railway de l'étape 1, **sans slash final**.

La réécriture déclarée dans `vercel.json` renvoie toute route inconnue vers
`index.html` : sans elle, un rafraîchissement sur `/transfers` donnerait un 404,
puisque seul React Router connaît cette route.

Le WebSocket ne demande aucune configuration : `socket.io-client` dérive `wss://`
de l'origine `https://` de `VITE_API_URL`.

### 3. Refermer le CORS

Revenir sur Railway et remplacer `CORS_ORIGIN=*` par l'URL Vercel exacte. Le
service redémarre seul. Plusieurs origines se séparent par des virgules.

## Amorcer les données (une seule fois)

Le seed est destructif. Il se lance à la main, depuis le poste de dev, contre la
base de production — jamais au démarrage du conteneur.

```bash
cd backend
DATABASE_URL="<connexion publique Postgres de Railway>" \
SEED_PASSWORD="<mot de passe de démonstration>" \
npm run prisma:seed
```

## Comptes de démonstration

Sept comptes, un par rôle utile à la démonstration. Le mot de passe est celui
passé en `SEED_PASSWORD` (`Kaiju!2026` par défaut).

| Rôle | Identifiant |
|---|---|
| Coordinateur de quartier | `qc.apex@tokyork.gov`, `qc.echo@tokyork.gov`, `qc.warden@tokyork.gov`, `qc.xeno@tokyork.gov`, `qc.zion@tokyork.gov` |
| Coordinateur logistique | `lc@tokyork.gov` |
| Directeur de la ville | `cd@tokyork.gov` |

## Vérifier le déploiement

```bash
curl https://<api>/api/health                     # 200
curl -s -X POST https://<api>/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"cd@tokyork.gov","password":"<mot de passe>"}' | head -c 120
```

Puis, dans le navigateur : se connecter, ouvrir un second onglet sur un compte
QC, changer le niveau de catastrophe côté CD et vérifier que la carte de l'autre
onglet se recolore sans rechargement. C'est le trajet qui prouve que l'API, la
base et le WebSocket tiennent tous les trois en production.
