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
  la priorisation des demandes.

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
