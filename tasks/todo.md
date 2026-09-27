# Kaiju — plan de travail

## Code — terminé
- [x] Moteur de règles pur, **71 tests unitaires** verts
- [x] Schéma Prisma, seed des données de l'annexe, diagramme ER
- [x] API REST complète, guards déclaratifs, filtre d'exception, journal d'audit
- [x] Verrous pessimistes et relecture du niveau dans la transaction
- [x] WebSocket : salles par quartier, les 3 événements imposés
- [x] Réconciliation horaire : expiration des réservations, passage en IN_TRANSIT
- [x] Frontend : carte tracée du sujet, 3 dashboards, calendrier, inscription,
      réservations avec libération
- [x] `npm run build` vérifié avec les vrais types Prisma générés
- [x] Binaire compilé démarré : graphe de modules Nest résolu

## Bloquant — jamais exécuté
- [ ] `npm install` (backend : lock obsolète ; frontend : jamais installé)
- [ ] `.env` : `DATABASE_URL` pointe encore sur 5432, la base Docker est sur 5433
- [ ] `npx prisma migrate dev --name init` — `prisma/migrations` n'existe pas
- [ ] `npm run prisma:seed`
- [ ] **`npm run test:e2e`** — 4 fichiers de specs écrits, aucun exécuté
- [ ] Premier commit git — le dépôt n'en a aucun

## Livrables du sujet
- [x] 1. Dépôt Git avec le code complet — *code prêt, zéro commit*
- [x] 2. Diagramme ER commité — *écrit, pas commité*
- [ ] 3. **Application déployée, URL dans le README** — rien de commencé
- [x] 4. Suite e2e — *écrite, jamais exécutée*
- [ ] 5. Disclosure IA — squelette prêt, sections `[À COMPLÉTER]`

## Ensuite
- [ ] Tests Playwright de l'interface
- [ ] Supprimer les dossiers vides `src/users` et `src/common/interceptors`
