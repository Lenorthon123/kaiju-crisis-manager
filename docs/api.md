# API — Kaiju Crisis Manager

Préfixe global : `/api`. Toutes les routes sauf `/auth/register`, `/auth/login` et
`/health` exigent un `Authorization: Bearer <token>`.

## Authentification

| Méthode | Route | Rôle | Notes |
|---|---|---|---|
| POST | `/auth/register` | — | `districtCode` obligatoire pour QC, interdit pour LC et CD |
| POST | `/auth/login` | — | Réponse identique que le compte existe ou non |
| GET | `/auth/me` | tous | Rôle et quartier relus en base, pas depuis le token |

## Ville et topologie

| Méthode | Route | Action requise |
|---|---|---|
| GET | `/districts` | `VIEW_RESOURCES` |
| GET | `/districts/routes?from=A&to=Z` | `VIEW_RESOURCES` |
| PATCH | `/districts/:code/severity` | City Director |

`/districts/routes` renvoie **toutes** les routes légales, avec leur mode, leurs
segments, les quartiers de transit à solliciter et la durée estimée.

## Ressources et stocks

| Méthode | Route | Action requise |
|---|---|---|
| GET | `/resources` | `VIEW_RESOURCES` |
| GET | `/stocks?district=A` | `VIEW_RESOURCES` |
| GET | `/resources/:code/availability` | `VIEW_RESOURCES` |

Chaque ligne de stock expose `available`, `retentionMinimum` et
`transferableSurplus` — tous dérivés, jamais stockés deux fois.

## Réservations

| Méthode | Route | Action requise |
|---|---|---|
| GET | `/reservations` | `VIEW_RESOURCES` |
| POST | `/reservations` | `RESERVE_OWN_QUARTER` |
| DELETE | `/reservations/:id` | `RESERVE_OWN_QUARTER` |

## Transferts

| Méthode | Route | Qui |
|---|---|---|
| GET | `/transfers` | tous |
| GET | `/transfers/pending/:districtCode` | tous — file d'approbation, triée par la règle 5 |
| POST | `/transfers` | vérifié par le moteur : l'action dépend de la géographie |
| POST | `/transfers/:id/approve` | QC du quartier source |
| POST | `/transfers/:id/legs/:legId/approve` | QC du quartier de transit |
| POST | `/transfers/:id/reject` | tout quartier sur la route |
| POST | `/transfers/:id/deliver` | QC du quartier destinataire |

`POST /transfers` n'est volontairement pas décoré par `@RequiresAction` : l'action
concernée (`REQUEST_ADJACENT_TRANSFER`, `ORGANIZE_TRANSIT` ou `REQUISITION`)
dépend de l'adjacence des quartiers, connue seulement après calcul de la route.
Le contrôle est fait par le moteur, dans la transaction.

Un **retour** de ressources est un transfert dans le sens inverse : mêmes règles
d'adjacence, de rétention et d'approbation, aucun chemin dérogatoire.

## Niveau de catastrophe

| Méthode | Route | Qui |
|---|---|---|
| GET | `/catastrophe` | tous — niveau courant + ce qu'il débloque pour le rôle appelant |
| GET | `/catastrophe/history` | tous |
| PUT | `/catastrophe/level` | City Director |
| POST | `/catastrophe/retention-override` | City Director, niveau 5, 15 % uniquement |

Redescendre sous le niveau 5 révoque automatiquement tout abaissement de seuil
en cours : c'est une mesure d'urgence, pas un relâchement permanent.

## WebSocket

Namespace `/realtime`. Le token est fourni au handshake
(`auth: { token }`, en-tête `Authorization` ou `?token=`), et c'est le serveur
qui décide des salles : un QC rejoint son quartier et le canal ville, un LC ou un
CD rejoignent tous les quartiers.

| Événement | Portée | Déclencheur |
|---|---|---|
| `resource.updated` | quartier | réservation, libération, engagement, livraison, annulation |
| `transfer.conflict` | quartier | refus pour stock insuffisant ou seuil de rétention, avec la liste des demandes concurrentes |
| `catastrophe.level.changed` | ville | escalade ou désescalade |
| `transfer.created` / `transfer.updated` | quartiers de la route | cycle de vie du transfert |
| `district.severity.changed` | ville | mise à jour de la carte |
| `retention.threshold.changed` | ville | abaissement du seuil par le CD |

## Forme des erreurs

Toute réponse d'erreur a la même forme, et chaque refus porte un `code` distinct :

```json
{
  "statusCode": 422,
  "code": "RETENTION_THRESHOLD_BREACH",
  "message": "District A must retain at least 4 unit(s) of MEDICAL_PERSONNEL (30% of its initial 12). At most 8 unit(s) may leave.",
  "details": {
    "districtCode": "A",
    "resourceCode": "MEDICAL_PERSONNEL",
    "requested": 9,
    "available": 12,
    "minimum": 4,
    "maxTransferable": 8,
    "retentionPct": 0.3,
    "retentionBase": 12
  },
  "path": "/api/transfers",
  "timestamp": "2026-09-21T09:14:02.511Z"
}
```
