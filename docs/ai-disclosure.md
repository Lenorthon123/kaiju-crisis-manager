# Disclosure de l'usage de l'IA

> Livrable n°5 du sujet, à présenter oralement en soutenance.
> **Squelette à compléter par moi-même avant le rendu** — les sections marquées
> `[À COMPLÉTER]` demandent mon propre jugement, pas celui de l'assistant.

## Outil utilisé

- Claude (Anthropic), en assistant de conception et de rédaction de code, via
  une session de travail sur le dépôt.
- Aucune autre IA générative utilisée sur ce projet. `[À CONFIRMER]`

## Ce que l'IA a produit

| Partie | Nature de la contribution | Mon rôle |
|---|---|---|
| Analyse de l'annexe, registre de décisions (`docs/decisions.md`) | Proposition des dix arbitrages, argumentés | `[À COMPLÉTER : lesquels j'ai validés, modifiés, rejetés]` |
| Moteur de règles (`backend/src/domain`) | Écrit par l'assistant | `[À COMPLÉTER]` |
| Tests unitaires du moteur (61) | Écrits par l'assistant | `[À COMPLÉTER]` |
| Schéma Prisma, seed | Écrits par l'assistant | `[À COMPLÉTER]` |
| API REST, WebSocket, guards | Écrits par l'assistant | `[À COMPLÉTER]` |
| Suite e2e | Écrite par l'assistant | `[À COMPLÉTER]` |
| Frontend (React) | Écrit par l'assistant | `[À COMPLÉTER]` |
| Vectorisation de la carte | Script de tracé écrit par l'assistant | `[À COMPLÉTER]` |

## Ce que l'IA a eu faux, et comment on l'a détecté

Ces points sont utiles à l'oral : ils montrent que le code a été vérifié et pas
seulement accepté. Le détail complet est dans [`../tasks/lessons.md`](../tasks/lessons.md).

1. **Topologie déduite à l'œil.** L'assistant a affirmé que tout transit entre
   quartiers non adjacents passait par Xeno. Faux : A→Z passe aussi par Warden,
   E→W passe aussi par Apex. Détecté en écrivant le test qui énumère les chemins.
2. **Choix non déterministe.** Le premier algorithme de plus court chemin
   retournait un chemin dépendant de l'ordre d'insertion des arêtes. Détecté par
   un test qui inverse l'ordre des données d'entrée.
3. **Journal d'audit perdu au rollback.** La trace d'un refus était écrite dans
   la transaction qui allait être annulée. Détecté à la relecture du flux
   transactionnel.
4. **Non-déterminisme SQL.** La règle de priorité d'adjacence désignait « le »
   voisin capable de fournir en prenant la première ligne d'une requête sans
   `ORDER BY`. Détecté en écrivant le test e2e correspondant.
5. **Colonnes invisibles.** Le tableau de stock masquait ses deux colonnes les
   plus décisives derrière un défilement horizontal. Ni le compilateur ni les
   tests ne pouvaient le voir : détecté sur une capture d'écran du rendu.
6. **Segmentation couleur erronée.** L'ombre orange de la côte de Warden était
   classée comme du rouge d'Apex, créant une fausse île. Détecté en vérifiant le
   nombre de composantes connexes par quartier.

## Vérifications que j'ai menées moi-même

`[À COMPLÉTER : ce que tu as relu, testé, corrigé à la main. Sois précis —
c'est la section que le jury lira le plus attentivement.]`

## Ce que je serais capable de réécrire sans assistance

`[À COMPLÉTER, honnêtement. Le jury peut demander d'expliquer n'importe quelle
ligne du moteur de règles.]`

## Points à savoir défendre à l'oral

- Pourquoi la matrice de permissions l'emporte sur la fiche des rôles (D7).
- Pourquoi le seuil de rétention se calcule sur la quantité initiale gelée (D2).
- Pourquoi le verrou pessimiste est nécessaire, et ce qui casse sans lui.
- Pourquoi la carte est tracée depuis l'image du sujet **et** vérifiée contre la
  matrice d'adjacence.
- Pourquoi chaque refus porte un code distinct plutôt qu'un message générique.
