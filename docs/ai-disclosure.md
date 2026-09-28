# Disclosure de l'usage de l'IA

Livrable n°5. Ce document décrit précisément la part de l'assistant et la mienne
dans la réalisation de Kaiju — Crisis Manager.

## Outil utilisé

Claude (Anthropic), en session de travail sur le dépôt, comme assistant de
conception et de rédaction de code. Aucune autre IA générative n'a été utilisée
sur ce projet.

## Répartition du travail

L'assistant m'a aidé à écrire le code : concrètement, il a rédigé les fichiers,
et j'ai défini le cahier des charges, arbitré les décisions de conception,
exécuté l'intégralité des vérifications, décidé des corrections à apporter et
réalisé le déploiement.

| Partie | Rédaction | Mon rôle |
|---|---|---|
| Registre de décisions (`docs/decisions.md`) | Assistant | J'ai validé les onze arbitrages un par un ; D11 existe parce que j'ai relevé que le registre annonçait une priorisation par sévérité absente du moteur, et que j'ai choisi de l'implémenter plutôt que de corriger la documentation |
| Moteur de règles (`backend/src/domain`) | Assistant | Cahier des charges, arbitrages, relecture des refus et de leur ordre d'évaluation |
| Tests unitaires (75) et e2e (40) | Assistant | Exécution intégrale sur ma machine ; c'est moi qui ai lancé chaque campagne et transmis les échecs |
| Schéma Prisma, migration, seed | Assistant | Exécution des migrations et de l'amorçage, en local puis en production |
| API REST, WebSocket, guards | Assistant | Recette fonctionnelle par rôle |
| Frontend React | Assistant | Recette visuelle ; plusieurs corrections viennent de captures d'écran que j'ai fournies |
| Vectorisation de la carte | Assistant | Fourniture de l'image du sujet, contrôle du rendu |
| Conteneurisation et déploiement | Assistant pour les fichiers | Construction des images, exécution des conteneurs, création des services Railway, variables, domaines, mise en production |

## Décisions que j'ai prises

- **Séparer le niveau de catastrophe (global) de la sévérité (par quartier)** —
  D1. C'est l'arbitrage structurant du modèle.
- **Implémenter la priorisation par sévérité plutôt que corriger la
  documentation.** Le registre et l'interface promettaient un comportement
  absent du moteur. J'ai tranché pour le code, en assumant qu'il s'agit d'une
  règle inventée, cantonnée au départage (D11).
- **Nettoyer le code mort avant les tests**, et verrouiller le résultat par le
  compilateur (`noUnusedLocals`) plutôt que par la relecture.
- **Réécrire les commentaires** en anglais bref, limités au non-évident.
- **Tout héberger sur Railway** plutôt que de répartir entre deux fournisseurs.
- **Ne pas exposer la base de production sur Internet** : le seed est déclenché
  depuis l'intérieur du conteneur par une variable, plutôt que par un proxy TCP
  public.

## Erreurs de l'assistant, et comment elles ont été détectées

Le détail complet est dans [`../tasks/lessons.md`](../tasks/lessons.md).

1. **Topologie déduite à l'œil.** L'assistant a affirmé que tout transit entre
   quartiers non adjacents passait par Xeno. Faux : A→Z passe aussi par Warden,
   E→W par Apex. Détecté en écrivant le test qui énumère les chemins.
2. **Choix de route non déterministe.** Le plus court chemin dépendait de
   l'ordre d'insertion des arêtes. Détecté par un test qui inverse l'entrée.
3. **Journal d'audit perdu au rollback.** La trace d'un refus était écrite dans
   la transaction annulée juste après.
4. **Non-déterminisme SQL.** La priorité d'adjacence désignait « le » voisin
   fournisseur en prenant la première ligne d'une requête sans `ORDER BY`.
5. **Colonnes invisibles.** Le tableau de stock masquait ses deux colonnes les
   plus décisives derrière un défilement horizontal. Ni le compilateur ni les
   tests ne pouvaient le voir : détecté sur une capture d'écran que j'ai
   demandée.
6. **Segmentation couleur erronée.** L'ombre orange de la côte de Warden était
   classée comme du rouge d'Apex, créant une fausse île.
7. **Suppression de conteneurs hors projet.** Un script de test appelait
   `docker compose down --remove-orphans` alors que deux fichiers Compose
   partageaient le même nom de projet : la commande a supprimé la base de
   développement **et** un conteneur appartenant à un autre de mes projets.
   Détecté parce que j'ai signalé la disparition.
8. **Chemin de sortie du build faux pendant trois jours.** `npm run start:prod`
   n'aurait démarré sur aucune machine : la sortie atterrissait dans
   `dist/src/main.js`. L'assistant l'avait déclaré corrigé après vérification
   sur une copie de travail incomplète. Détecté au premier lancement réel du
   conteneur Docker.
9. **Permissions de fichiers dans l'image.** `COPY` transporte les modes de la
   source ; le conteneur est mort deux fois de suite, sur son point d'entrée
   puis sur `package.json`.
10. **Garde d'idempotence trop faible.** Le seed refusait de s'exécuter dès
    qu'un seul quartier existait, bloquant la réparation d'une base à moitié
    amorcée. Détecté en lisant les journaux de déploiement.

Les points 7 à 10 partagent une leçon : un build vert ne prouve pas qu'un
artefact démarre, et une vérification menée sur autre chose que l'arbre livré ne
vaut rien.

## Vérifications que j'ai menées moi-même

- Exécution de la totalité des campagnes de tests sur ma machine : 75 tests
  unitaires et 40 tests end-to-end, ces derniers contre une base PostgreSQL
  jetable lancée par Docker.
- Construction de l'image Docker de l'API et exécution du conteneur contre ma
  base de développement, jusqu'à obtenir une authentification réussie — c'est
  cette étape qui a révélé les défauts 8 et 9.
- Recette fonctionnelle de l'interface par rôle, avec deux navigateurs
  simultanés, pour vérifier la propagation temps réel d'un changement de niveau.
- Contrôle du déploiement en production : point de santé, authentification,
  repli SPA, lecture des journaux de démarrage.
- Vérification qu'aucun secret ni fichier d'environnement n'est présent dans
  l'historique Git avant publication.

## Ce que je serais capable de réécrire sans assistance

> À compléter par moi, honnêtement, avant le rendu. Le jury peut demander
> d'expliquer n'importe quelle ligne du moteur de règles ; une surestimation ici
> coûte plus cher qu'un aveu de limite.

## Points à savoir défendre à l'oral

- Pourquoi le niveau de catastrophe est global et la sévérité par quartier (D1),
  et pourquoi les fusionner rendrait le modèle indécidable.
- Pourquoi la matrice de permissions l'emporte sur la fiche des rôles (D7).
- Pourquoi le seuil de rétention se calcule sur la quantité initiale gelée (D2),
  et ce qu'un calcul sur le stock courant permettrait.
- Pourquoi le verrou pessimiste est nécessaire, et ce qui casse sans lui.
- Pourquoi la sévérité ne fait que départager la file des demandes, sans jamais
  renverser la règle 5 de l'annexe (D11).
- Pourquoi chaque refus porte un code distinct plutôt qu'un message générique.
- Pourquoi la carte est tracée depuis l'image du sujet **et** vérifiée contre la
  matrice d'adjacence.
