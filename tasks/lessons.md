# Leçons

Format : [date] | ce qui a mal tourné | règle pour l'éviter

[2026-09-18] | J'ai affirmé que toute paire de quartiers non adjacents transitait forcément par Xeno. Faux : A→Z passe aussi par W (A–W–Z) et E→W passe aussi par A (E–A–W). Seule E–Z est réellement forcée par Xeno. | Ne jamais déduire une topologie « à l'œil » depuis une carte ou une description en prose. Énumérer les chemins par programme et laisser un test l'affirmer.

[2026-09-18] | Le premier BFS ne retournait qu'un seul plus court chemin, choisi implicitement par l'ordre d'insertion des arêtes. Le test est passé du vert au rouge en changeant simplement l'ordre. | Quand plusieurs solutions optimales existent, les énumérer toutes et départager par une règle explicite et documentée. Un test doit vérifier que le résultat ne dépend pas de l'ordre des données d'entrée.

[2026-09-18] | E→Z est à durée strictement égale en transit terrestre et en maritime (4 h contre 4 h), ce qui rendait la sélection de route arbitraire. | Toute fonction de choix doit avoir un ordre total, pas seulement un critère principal. Empiler les critères de départage jusqu'à ce que deux entrées ne puissent plus être à égalité.

[2026-09-21] | Premier jet du service de réservation : l'écriture du journal d'audit d'un refus était faite À L'INTÉRIEUR de la transaction, puis l'exception était levée. Le rollback effaçait la trace du refus — exactement la trace qu'on voulait garder. | Dans une transaction, ne jamais écrire une trace qui doit survivre à l'échec de l'opération. Le moteur retourne un résultat, la transaction se termine, et c'est après le commit qu'on journalise et qu'on lève l'exception.

[2026-09-21] | Toujours trier les identifiants avant de poser des verrous de ligne. Deux transactions qui verrouillent le même couple de stocks dans l'ordre inverse se bloquent mutuellement. | `lockStocks` trie systématiquement les ids. Toute nouvelle opération multi-lignes doit passer par ce même helper, jamais par un `FOR UPDATE` écrit à la main.

[2026-09-24] | La règle 2 (priorité d'adjacence) signalait « le » voisin capable de fournir en prenant le PREMIER résultat d'un `findMany` sans `orderBy`. Le message d'erreur changeait donc d'un appel à l'autre. C'est le fait d'écrire le test qui l'a révélé, pas la relecture du code. | Un `find()` sur une collection venant de la base n'est déterministe que si la collection est triée. Quand plusieurs candidats satisfont un critère, choisir explicitement lequel et le prouver par un test qui passe la même liste dans les deux sens.

[2026-09-24] | Troisième occurrence du même schéma en une semaine : ordre des arêtes, égalité de durée, ordre des lignes SQL. | Traiter « plusieurs résultats valides » comme un bug par défaut. Chaque fois qu'une fonction renvoie un élément choisi parmi plusieurs, écrire d'abord le test qui mélange l'entrée, puis le critère de départage.

[2026-09-24] | Le tableau de stock compilait, passait les types, et masquait pourtant ses deux colonnes les plus décisives derrière un défilement horizontal. | Pour toute interface, produire une capture d'écran du rendu réel et la REGARDER avant de livrer. Le typecheck prouve que le code s'exécute, pas que l'information est visible.

[2026-09-24] | Classification couleur de la carte : ma règle « rouge » attrapait aussi l'ombre orange foncée de la côte de Warden, créant une fausse île d'Apex de 6 000 px. | Deux teintes proches ne se séparent pas par des seuils indépendants sur chaque canal mais par le RAPPORT entre canaux. Et toujours valider une segmentation par une propriété connue du résultat — ici, une seule composante connexe par quartier.

[2026-09-24] | `tsconfig.build.json` n'excluait que `**/*spec.ts`, pas le dossier `test`. Compiler `test/helpers` élargissait le rootDir déduit à la racine du projet, donc la sortie atterrissait dans `dist/src/main.js` alors que `start:prod` lance `node dist/main`. Le build « réussissait » et la commande de production aurait échoué au déploiement. | Un build qui se termine sans erreur n'est pas un build vérifié. Contrôler l'ARBORESCENCE produite et exécuter réellement l'artefact, pas seulement le compiler.

[2026-09-24] | `npm run lint` référençait eslint, absent des devDependencies des deux package.json : la commande échouait sur un clone neuf. | Toute commande listée dans `scripts` doit être exécutée au moins une fois sur une installation propre. Un script cassé dans un livrable est pire que pas de script.

[2026-09-27] | Le harnais e2e exportait `PORT=0` pour dire « port libre au hasard », alors que la validation d'environnement exige un port strictement positif. 40 tests en échec, une seule cause. Le harnais avait tort, pas la validation — et `app.listen(0)` suffisait de toute façon, `PORT` n'avait rien à faire dans l'environnement de test. | Ne pas placer dans l'environnement une valeur que le code n'utilise pas. Quand une validation refuse une valeur du harnais, se demander d'abord si c'est le harnais qui est fautif.

[2026-09-27] | Chaque `beforeAll` en échec provoquait un second échec dans `afterAll` (`ctx` undefined), qui noyait l'erreur réelle sous quatre TypeError. | Tout teardown doit tolérer un setup qui n'a pas abouti : `ctx?.app.close()`. Sinon la vraie cause est enterrée sous le bruit.

[2026-09-27] | GRAVE : mes deux fichiers docker-compose vivaient dans le même dossier, donc Compose leur attribuait le MÊME nom de projet. Le teardown des tests faisait `down --remove-orphans`, ce qui aurait supprimé le conteneur de la base de développement ET `yewo-postgres`, qui appartient à un autre projet. Le warning « Found orphan containers » était le signal, et je l'avais qualifié d'inoffensif. | Un avertissement qu'on ne sait pas expliquer n'est pas inoffensif, il est non élucidé. `--remove-orphans` n'a rien à faire dans un script automatique. Nommer explicitement chaque projet Compose (`name:`) pour que les stacks ne se voient pas entre elles.
