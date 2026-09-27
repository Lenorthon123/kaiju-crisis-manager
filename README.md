# Kaiju — Crisis Manager

Plateforme de coordination des secours de Tokyork après une attaque de Kaiju.
Cinq quartiers, dix ressources critiques, cinq niveaux de catastrophe, et un
serveur qui refuse toute opération contraire aux règles.

- **URL de production** : API — https://kaiju-crisis-manager-production-7265.up.railway.app (interface : à compléter)
- **Procédure de déploiement** : [`docs/deployment.md`](docs/deployment.md)
- **Diagramme entité-relation** : [`docs/erd.md`](docs/erd.md)
- **Registre de décisions de conception** : [`docs/decisions.md`](docs/decisions.md)
- **Topologie de la ville** : [`docs/topology.md`](docs/topology.md)
- **Routes de l'API et événements WebSocket** : [`docs/api.md`](docs/api.md)
- **Usage de l'IA** : [`docs/ai-disclosure.md`](docs/ai-disclosure.md)

## Architecture

```
backend/            NestJS + Prisma + PostgreSQL
  prisma/           schéma, migrations, seed des données de l'annexe
  src/domain/       MOTEUR DE RÈGLES — fonctions pures, zéro I/O, zéro framework
  src/common/       codes de violation, filtre d'exception, guards
  src/<module>/     auth, districts, resources, reservations, transfers, catastrophe
  test/             suite end-to-end sur une base PostgreSQL jetable

frontend/           Vite + React + Tailwind
  src/api/          client typé — la seule couche qui parle au serveur
  src/lib/          géométrie de la carte, formatage
  src/components/   carte, tableaux, calendrier, flux d'alertes
  src/pages/        un dashboard par rôle (QC, LC, CD)
```

`backend/src/domain` est le cœur du projet. Il ne dépend ni de Nest, ni de
Prisma, ni du réseau : il reçoit le graphe de la ville, la matrice de permissions
et un instantané de stock, et renvoie soit une décision, soit une violation
typée. C'est ce qui permet de tester toutes les règles métier sans base de
données.

## Démarrage

Prérequis : Node 20+ et Docker. Aucun PostgreSQL à installer : le dépôt fournit
sa propre base de développement.

### Backend

```bash
cd backend
cp .env.example .env            # renseigner JWT_SECRET ; DATABASE_URL est déjà bon
npm install
npm run db:up                   # PostgreSQL de développement sur le port 5433
npx prisma generate
npm run build                   # compile avec les types Prisma générés
npx prisma migrate dev --name init
npm run prisma:seed             # charge les données de l'annexe
npm run start:dev               # http://localhost:3000/api/health
```

`npm run db:down` arrête la base ; les données sont conservées dans un volume
nommé.

Si tu as déjà un PostgreSQL local et que tu préfères l'utiliser, remplace
simplement `DATABASE_URL` dans `.env` et saute `npm run db:up`.

### Frontend

```bash
cd frontend
npm install
npm run dev                     # http://localhost:5173
```

Vite proxie `/api` et `/realtime` vers `localhost:3000` : aucune URL n'est codée
en dur. En production, renseigner `VITE_API_URL` avec l'origine de l'API
déployée.

## Tests

```bash
cd backend
npm test                        # moteur de règles — 61 tests, sans base de données
npm run test:e2e                # e2e — monte sa propre base jetable via Docker
npm run test:all                # les deux
```

La suite e2e couvre les parcours critiques (authentification, périmètre,
réservation, transferts, rétention, priorité d'adjacence, réquisition), la
concurrence sur la dernière unité transférable, et les trois événements temps
réel imposés. Elle utilise une base éphémère en mémoire, distincte de la base de
développement : la lancer n'efface rien.

## Comptes de démonstration

| Rôle | Email | Périmètre |
|---|---|---|
| QC | `qc.apex@tokyork.gov` | Apex |
| QC | `qc.echo@tokyork.gov` | Echo |
| QC | `qc.warden@tokyork.gov` | Warden |
| QC | `qc.xeno@tokyork.gov` | Xeno |
| QC | `qc.zion@tokyork.gov` | Zion |
| LC | `lc@tokyork.gov` | multi-quartiers |
| CD | `cd@tokyork.gov` | ville entière |

Mot de passe commun défini par `SEED_PASSWORD` (défaut : `Kaiju!2026`).

## Codes de refus

Toute opération rejetée renvoie un code distinct identifiant la règle violée —
jamais une erreur générique. Le catalogue complet est dans
`backend/src/domain/violations.ts`.

| Code | HTTP | Règle |
|---|---|---|
| `ROLE_NOT_PERMITTED_AT_LEVEL` | 403 | matrice niveau × rôle |
| `OUT_OF_SCOPE_QUARTER` | 403 | un QC n'agit que sur son quartier |
| `INTER_QUARTER_TRANSFER_FORBIDDEN` | 403 | niveaux 1 et 2 |
| `TRANSIT_FORBIDDEN_AT_LEVEL` | 403 | transit avant le niveau 4 |
| `NOT_ADJACENT` | 422 | matrice d'adjacence |
| `MARITIME_ROUTE_UNAVAILABLE` | 422 | quartier enclavé |
| `TRANSIT_APPROVAL_REQUIRED` | 409 | approbation du quartier intermédiaire |
| `ADJACENT_SOURCE_AVAILABLE` | 422 | priorité d'adjacence (règle 2) |
| `INSUFFICIENT_STOCK` | 422 | stock disponible |
| `RETENTION_THRESHOLD_BREACH` | 422 | seuil de rétention |
| `RETENTION_OVERRIDE_REQUIRES_LEVEL_5` | 403 | abaissement à 15 % |
| `CONCURRENT_MODIFICATION` | 409 | conflit d'accès concurrent |
