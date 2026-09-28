# Kaiju — plan de travail

## Vérifié, qui tourne pour de vrai
- [x] Moteur de règles pur — **71 tests unitaires**, sans base de données
- [x] **40 tests e2e** contre un PostgreSQL réel : parcours critiques, concurrence,
      temps réel, réconciliation horaire
- [x] Verrous pessimistes prouvés : deux requêtes simultanées sur la dernière
      unité, rafale de 12 demandes qui s'arrête pile au plancher de rétention
- [x] `npm run build` + binaire compilé qui démarre
- [x] Migration `20260927110032_init` appliquée et commitée
- [x] Seed des données de l'annexe
- [x] Frontend : build de production, rendu vérifié par captures
- [x] Dépôt Git initialisé et commité

- [x] Nettoyage du code mort, `noUnusedLocals` activé (commit `a6556f1`)

## Livrables du sujet
- [x] 1. Dépôt Git avec le code complet — https://github.com/Lenorthon123/kaiju-crisis-manager (branche `main`, 130 fichiers)
- [x] 2. Diagramme entité-relation commité (`docs/erd.md`)
- [x] 3. **Application déployée, URL dans le README** — API, interface et base sur Railway
- [x] 4. Suite de tests e2e couvrant les parcours critiques
- [ ] 5. Disclosure IA — rédigée ; reste la section « ce que je serais capable de réécrire sans assistance »

## Ce qui reste
- [x] D11 : la sévérité départage la file des demandes (moteur + tests + registre)
- [x] Image Docker de l'API : construite, démarrée, migrations jouées, login 200 avec JWT
- [x] Déploiement : API + front + base sur Railway, URLs dans le README



