# Déploiement

Un seul projet Railway, trois services.

| Service | Source | Rôle |
|---|---|---|
| `kaiju-api` | `backend/Dockerfile` | API NestJS, WebSocket, tâche planifiée |
| `kaiju-web` | `frontend/Dockerfile` | nginx servant le bundle Vite |
| `Postgres` | add-on Railway | base de données |

L'API est conteneurisée plutôt que laissée à la détection automatique : le
`Dockerfile` génère le client Prisma et compile le TypeScript dans une première
étape, puis ne transporte dans l'image finale que `dist`, `prisma` et le
`node_modules` déjà peuplé. Le déploiement ne télécharge donc aucun moteur
Prisma, ce qui est précisément l'étape qui échoue derrière un réseau filtré.

Le front a besoin d'un serveur persistant lui aussi, puisque l'API maintient des
connexions WebSocket ouvertes : pas de fonction sans état côté API, donc autant
garder les deux au même endroit.

## 1. Les trois services

1. Railway → **New Project** → **Deploy from GitHub repo** → `kaiju-crisis-manager`.
2. Ce premier service devient l'API : **Settings** → **Source** → **Root
   Directory** = `backend`, et renomme-le `kaiju-api`.
3. **+ New** → **GitHub Repo** → même dépôt → **Root Directory** = `frontend`,
   renommé `kaiju-web`.
4. **+ New** → **Database** → **PostgreSQL**.

Sur chacun des deux services applicatifs : **Settings** → **Networking** →
**Generate Domain**. Les domaines doivent exister avant l'étape suivante, chaque
service ayant besoin de l'adresse de l'autre.

## 2. Les variables

`kaiju-api` :

| Variable | Valeur |
|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
| `JWT_SECRET` | sortie de `openssl rand -base64 32` |
| `NODE_ENV` | `production` |
| `CORS_ORIGIN` | `https://${{kaiju-web.RAILWAY_PUBLIC_DOMAIN}}` |

`kaiju-web` :

| Variable | Valeur |
|---|---|
| `VITE_API_URL` | `https://${{kaiju-api.RAILWAY_PUBLIC_DOMAIN}}` |

La syntaxe `${{service.VARIABLE}}` est une référence résolue par Railway : les
deux services se retrouvent sans qu'aucune URL ne soit recopiée à la main, et un
changement de domaine se propage tout seul.

`PORT` est injecté par Railway sur les deux services — ne pas le définir.

**Attention** : Vite fige `VITE_API_URL` dans le bundle au moment du build.
Modifier cette variable n'a d'effet qu'après un **redéploiement** du service web,
jamais après un simple redémarrage.

Health check (**Settings** → **Deploy**) : `/api/health` pour l'API, `/` pour le
web.

## 3. Amorcer les données (une seule fois)

Les migrations sont jouées à chaque démarrage par `docker-entrypoint.sh`
(`prisma migrate deploy`). Le seed, lui, n'y est pas : il vide toutes les tables
avant d'écrire, un simple redémarrage effacerait donc les données en pleine
soutenance. Il se lance à la main, depuis le poste de dev, contre la base de
production — son URL publique est dans l'onglet **Variables** du service
Postgres.

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
curl -i https://<api>/api/health
curl -i -X POST https://<api>/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"cd@tokyork.gov","password":"<mot de passe>"}'
```

Puis, dans le navigateur : se connecter, ouvrir un second onglet sur un compte
QC, changer le niveau de catastrophe côté CD et vérifier que la carte de l'autre
onglet se recolore sans rechargement. C'est le trajet qui prouve que l'API, la
base et le WebSocket tiennent tous les trois en production.

## Reproduire en local

```bash
# API
docker build -t kaiju-api ./backend
docker run --rm -p 3001:3000 \
  -e DATABASE_URL="postgresql://kaiju:kaiju@host.docker.internal:5433/kaiju?schema=public" \
  -e JWT_SECRET="smoke-test-secret-assez-long" \
  kaiju-api

# Interface
docker build -t kaiju-web --build-arg VITE_API_URL=http://localhost:3001 ./frontend
docker run --rm -p 8080:8080 kaiju-web
```
