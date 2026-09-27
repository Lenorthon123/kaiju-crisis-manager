# Diagramme entité-relation — Kaiju Crisis Manager

```mermaid
erDiagram
    DISTRICT ||--o{ STOCK : holds
    DISTRICT ||--o{ USER : "employs (QC)"
    DISTRICT ||--o{ RESERVATION : hosts
    DISTRICT ||--o{ TRANSFER : "source"
    DISTRICT ||--o{ TRANSFER : "destination"
    DISTRICT ||--o{ RETENTION_OVERRIDE : "may target"

    RESOURCE_TYPE ||--o{ STOCK : "stocked as"
    RESOURCE_TYPE ||--o{ RESERVATION : "reserved as"
    RESOURCE_TYPE ||--o{ TRANSFER : "moved as"

    USER ||--o{ RESERVATION : requests
    USER ||--o{ TRANSFER : initiates
    USER ||--o{ TRANSFER_LEG : approves
    USER ||--o{ CATASTROPHE_LEVEL_CHANGE : triggers
    USER ||--o{ RETENTION_OVERRIDE : grants
    USER ||--o{ AUDIT_LOG : generates

    TRANSFER ||--|{ TRANSFER_LEG : "is composed of"

    DISTRICT {
        uuid id PK
        string code UK "A E W X Z"
        string name
        bool hasSeaAccess
        bool isHub
        int severity "1..5, map colour"
    }

    TOPOLOGY_EDGE {
        uuid id PK
        string fromNode "district code or SEA"
        string toNode
        enum type "LAND | SEA"
    }

    RESOURCE_TYPE {
        uuid id PK
        string code UK
        string name
        int order
    }

    STOCK {
        uuid id PK
        uuid districtId FK
        uuid resourceTypeId FK
        int initialQuantity
        int currentQuantity
        int reservedQuantity
        int committedOutbound
        int retentionBase "frozen, drives ceil(base * pct)"
    }

    CITY_STATE {
        string id PK "singleton"
        int catastropheLevel "1..5, global"
    }

    CATASTROPHE_LEVEL_CHANGE {
        uuid id PK
        int previousLevel
        int newLevel
        uuid changedById FK
        datetime changedAt
    }

    RETENTION_OVERRIDE {
        uuid id PK
        uuid districtId FK "null = city-wide"
        decimal pct "0.150"
        bool active
        uuid createdById FK
    }

    PERMISSION_RULE {
        uuid id PK
        enum action
        int level "1..5"
        enum role "QC | LC | CD"
    }

    USER {
        uuid id PK
        string email UK
        string passwordHash
        enum role "QC | LC | CD"
        uuid districtId FK "required for QC"
    }

    RESERVATION {
        uuid id PK
        uuid requesterId FK
        uuid districtId FK
        uuid resourceTypeId FK
        int quantity
        datetime startAt
        datetime endAt
        enum status
    }

    TRANSFER {
        uuid id PK
        uuid initiatorId FK
        uuid sourceDistrictId FK
        uuid destDistrictId FK
        uuid resourceTypeId FK
        int quantity
        enum mode "DIRECT | TRANSIT | MARITIME"
        enum status
        bool isRequisition
        int priority "annex rule 5"
        int etaHours
        datetime estimatedDeliveryAt
    }

    TRANSFER_LEG {
        uuid id PK
        uuid transferId FK
        int sequence
        string fromNode
        string toNode
        enum linkType
        bool approvalRequired
        enum status
        uuid approvedById FK
    }

    AUDIT_LOG {
        uuid id PK
        uuid userId FK
        string action
        enum outcome "ALLOWED | REJECTED"
        string violationCode
        int httpStatus
        json context
    }
```

## Trois points de conception à défendre à l'oral

1. **`TOPOLOGY_EDGE` et `PERMISSION_RULE` sont des tables**, pas des conditions
   codées en dur. Le moteur de règles reçoit le graphe et la matrice en
   paramètres, ce qui le rend testable sans base de données.
2. **`STOCK.retentionBase` est gelé.** Le seuil de rétention ne dérive jamais avec
   le stock courant.
3. **`TRANSFER_LEG` existe.** Une chaîne de transit A→X→Z est deux segments, chacun
   avec sa propre approbation. Sans cette table, le niveau 4 n'est pas
   modélisable proprement.
