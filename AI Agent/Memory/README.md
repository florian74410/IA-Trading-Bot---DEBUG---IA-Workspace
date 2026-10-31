# Memory — mémoire opérationnelle IA-TB

## General
La mémoire générale est un journal SQLite horodaté (UTC, format ISO 8601) couvrant :
- observations techniques et faits vérifiables ;
- synthèses d'analyses et diagnostics ;
- décisions et hypothèses explicitement identifiées ;
- actions exécutées, tests, commits, résultats et enseignements.

La mémoire générale ne contient pas de raisonnement interne brut, de secrets, de mots de passe, de clés privées, de jetons d'accès ni de données sensibles.

### Emplacement
Le dépôt conserve Memory/General/schema.sql et Memory/General/journal.py. Le fichier SQLite est créé **hors Git** via la variable IATB_AGENT_MEMORY_DB. La configuration de ce chemin sur le serveur nécessitera une installation et des permissions dédiées.

### Utilisation
Voir Memory/General/README.md pour les commandes.

## Autre catégorie mémoire
La deuxième catégorie « Mémoire … » de la demande initiale n'était pas précisée. Son nom, son contenu et sa politique de rétention restent à définir. Aucune catégorie arbitraire n'est ajoutée à ce stade.
