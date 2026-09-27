
## D12 — La « capacité supérieure » de la route maritime n'est pas modélisée

**Décision.** La voie maritime se distingue par sa disponibilité (Echo, Xeno,
Zion seulement), son temps doublé et sa priorité au niveau 5. Sa « higher
capacity » n'est traduite par aucune contrainte.

**Pourquoi.** L'annexe écrit : « The maritime route offers higher capacity but
doubled delivery time », sans jamais quantifier de capacité — ni pour la mer, ni
pour la route terrestre, ni pour les véhicules de transport. Aucun plafond
n'existe donc dans le modèle : une capacité maritime « supérieure » n'aurait
rien à dépasser.

Modéliser cette phrase supposerait d'inventer deux nombres absents du sujet (un
plafond terrestre et un plafond maritime), et de transformer un moteur qui
transcrit des règles publiées en un moteur qui en fabrique. Le seul effet
observable serait de refuser des transferts que l'annexe n'interdit nulle part.

La phrase est donc lue comme une justification narrative du temps doublé — on
accepte d'attendre parce qu'on emporte davantage — et non comme une règle
opposable. Si le sujet fournissait un plafond, il s'ajouterait à
`evaluateTransfer` entre la topologie et la rétention, sans toucher au reste.
