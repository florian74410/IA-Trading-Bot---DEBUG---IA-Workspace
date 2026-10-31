# Mémoire agent — SQLite

## Choix du stockage

La base logique **Agent-Memory** est implémentée par `Agent-Memory.db` (SQLite), **une base par agent**. Le registre des agents réside dans `Agent-Registry.db` (SQLite central).

Il n'est pas prévu d'installer MySQL ou MariaDB pour cette version.

## Tables

| Table | But |
| --- | --- |
| `agents` (registre uniquement) | Numéro de série, pseudonyme, rôle, état |
| `records` | Index commun, date, contexte, provenance, corrélation |
| `events` | Événements |
| `actions` | Opérations et résultats |
| `interactions` | Échanges avec d'autres systèmes |
| `responses` | Réponses et résultats |
| `reflexions` | Bilans, hypothèses et déductions explicites |
| `memories` | Leçons consolidées, niveau de vérification |
| `snapshots` | Sauvegardes et empreintes |
| `Statistiques` | Historique des traits de caractère |

## Historisation des statistiques

Chaque ligne de `Statistiques` représente un vecteur complet de scores compris entre 0 et 100, avec `agent_serial`, `iteration`, horodatage UTC, justification, lien vers une preuve et approbateur. On **ajoute** les itérations : aucune ancienne mesure n'est réécrite. Les graphes comparent les versions mais il ne faut pas supposer qu'un score plus élevé est systématiquement meilleur.

## Fiabilité

Mode WAL, transactions, intégrité référentielle, identifiants uniques, sauvegardes SQLite cohérentes. `Events.jsonl` constitue un journal portable chronologique ; lors de l'import, dédupliquer par identifiant stable. Le cache RAM reste non autoritatif.

Les réflexions enregistrées sont des textes d'analyse **explicitement produits**, jamais les pensées internes privées du modèle.

[Schéma SQL](../../AI-Core/database/agent_memory.schema.sql) · [Retour](Home.md)
