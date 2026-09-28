# Registre de décisions — Kaiju Crisis Manager

Chaque décision ci-dessous comble une zone que l'annexe des règles ne tranche pas.
Elles sont appliquées telles quelles dans `backend/src/domain`, et chacune est
couverte par au moins un test unitaire.

---

## D1 — Niveau de catastrophe global, sévérité par quartier

**Décision.** Deux notions distinctes :

- `CityState.catastropheLevel` (1–5) : **global**, pilote les permissions, diffusé
  en temps réel à chaque escalade ou désescalade.
- `District.severity` (1–5) : **par quartier**, pilote la couleur de la carte et
  départage la file des demandes (voir D11).

**Pourquoi.** L'annexe décrit les cinq niveaux comme un état unique de la ville
(« Five escalation levels determine which actions and transfers are permitted »),
alors que le sujet demande une carte « reflecting district severity ». Fusionner
les deux rendrait indécidable le niveau applicable à un transfert reliant un
quartier en niveau 2 à un quartier en niveau 4.

## D2 — Le seuil de rétention est calculé sur la quantité initiale gelée

**Décision.** `minimum = ceil(retentionBase × pct)` où `retentionBase` est figé à
la quantité initiale du seed. Jamais un pourcentage du stock courant.

**Pourquoi.** Vérifié sur les 50 cellules du tableau de l'annexe : `ceil(initial ×
0,30)` reproduit exactement chaque valeur publiée. Recalculer sur le stock courant
ferait dériver le seuil vers le bas à chaque sortie et permettrait de vider un
quartier. Test : `retention.spec.ts` → « cannot be drained by a sequence of
transfers ».

## D3 — La rétention porte sur le stock disponible, pas sur le stock physique

**Décision.** `disponible = courant − réservé − engagé en transfert`. Le seuil
s'applique au disponible.

**Pourquoi.** Sans cela, des réservations empilées puis un transfert feraient
passer le quartier sous le plancher au moment de la livraison.

## D4 — Une réservation locale peut descendre sous le plancher de rétention

**Décision.** `checkReservation` valide la disponibilité, pas le plancher.
`checkOutflow` (transfert sortant) valide les deux.

**Pourquoi.** Le texte justifie le seuil par « this prevents a quarter from being
emptied **to serve another** ». Une réservation interne réserve sans déplacer :
le stock physique du quartier ne baisse pas. Seul un transfert sortant fait
sortir la ressource, et c'est lui qui est contraint.

## D5 — Durées de livraison

**Décision.** `TRANSFER_BASE_LEG_HOURS = 2` par saut terrestre ; route maritime
= `base × TRANSFER_MARITIME_MULTIPLIER (= 2)`. Les deux en variables
d'environnement.

**Pourquoi.** L'annexe impose « adds delivery time » et « doubled delivery time »
sans donner aucune valeur de base. Les constantes sont donc nôtres, et
paramétrables plutôt que codées en dur.

## D6 — Route maritime : alternative avant le niveau 5, prioritaire au niveau 5

**Décision.** À durée égale, une route terrestre l'emporte sur la route maritime,
**sauf** au niveau 5 où le maritime est sélectionné en priorité.

**Pourquoi.** La règle 4 présente le maritime comme « available as an
alternative » ; c'est la description du niveau 5 qui dit « Maritime route
prioritized ». Le cas concret est E→Z : transit terrestre par X (2 sauts × 2 h =
4 h) et maritime (2 h × 2 = 4 h) sont à égalité.

## D7 — La matrice de permissions l'emporte sur la fiche des rôles

**Décision.** `RESERVE_OWN_QUARTER` est réservé au QC à tous les niveaux, y
compris pour le City Director ; `REQUEST_ADJACENT_TRANSFER` est réservé au QC au
niveau 3 ; le QC ne peut jamais organiser un transit.

**Pourquoi.** La fiche des rôles qualifie le CD de « full authority », mais le
sujet exige que les permissions soient appliquées « exactly as specified » dans
les règles. La matrice est la spécification ; la fiche des rôles en est le résumé
en prose. En cas de contradiction, la matrice gagne. Test :
`permissions.spec.ts` → 90 combinaisons (action × niveau × rôle).

## D8 — Ce que contourne une réquisition du City Director

**Décision.** La réquisition contourne l'approbation du QC source. Elle ne
contourne **ni** le seuil de rétention (sauf abaissement explicite à 15 % au
niveau 5), **ni** la topologie.

**Pourquoi.** L'intérêt d'une réquisition est de passer outre un refus
administratif ; la géographie et le plancher de survie du quartier ne sont pas
des refus administratifs. Tests dans `transfer-rules.spec.ts` → « requisition ».

## D9 — Le choix de route est déterministe et évite le hub à durée égale

**Décision.** Le moteur énumère **tous** les plus courts chemins, puis départage :
durée, puis mode (direct > transit > maritime), puis évitement de Xeno, puis ordre
alphabétique.

**Pourquoi.** Trois paires de quartiers ne sont pas adjacentes : A–Z, E–W, E–Z.
Les deux premières ont **deux** routes à deux sauts (A–W–Z / A–X–Z, et E–A–W /
E–X–W) ; seule E–Z est forcée par Xeno. Retourner un seul chemin arbitraire ferait
dépendre le résultat de l'ordre d'insertion des arêtes en base, et masquerait une
route légale au Logistics Coordinator. L'évitement de Xeno à durée égale découle
de la règle 5 : ce qui ne fait que traverser Xeno attend les besoins de Xeno.

## D10 — Ordre d'évaluation des règles

**Décision.** Sanité des entrées → gating par niveau → permission (niveau × rôle)
→ périmètre (QC) → topologie → priorité d'adjacence → rétention → concurrence.

**Pourquoi.** On ne révèle jamais un état opérationnel (stock d'un quartier,
surplus d'un voisin) à un acteur qui n'avait pas le droit de poser la question.
Test : `transfer-rules.spec.ts` → « checks the permission before revealing any
stock figure ».

## D11 — La sévérité départage la file, elle ne la commande pas

**Décision.** L'ordre d'une file de demandes est : `priority` (règle 5 de
l'annexe) croissant, puis **sévérité du quartier destinataire** décroissante,
puis ancienneté. La sévérité n'intervient qu'à rang égal, et n'entre nulle part
ailleurs dans le moteur : ni permission, ni topologie, ni rétention.

**Pourquoi.** C'est une règle **inventée** — l'annexe ne dit rien de la sévérité
au-delà de « a map reflecting district severity ». Elle est donc cantonnée au
départage, là où l'annexe ne tranche pas : à rang identique, servir d'abord le
quartier en détresse est le seul ordre défendable, et laisser l'ordre indécis
ferait revenir le non-déterminisme corrigé en D9. Une règle ajoutée ne doit
jamais renverser une règle publiée : c'est pourquoi `priority` reste le premier
critère, et un transfert impliquant Xeno passe devant un transfert vers un
quartier en sévérité 5.

**Lecture au moment de la requête, pas figée.** La sévérité n'est pas recopiée
dans la ligne du transfert : elle est lue à chaque interrogation de la file. Un
quartier qui s'aggrave remonte donc dans la file où ses demandes attendent déjà.
`priority`, lui, reste figé à la création, puisqu'il décrit la topologie de la
route et que celle-ci ne change pas.

Test : `transfer-rules.spec.ts` → « compareUrgency », dont un cas vérifie que
l'ordre ne dépend pas de l'ordre d'entrée.

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
