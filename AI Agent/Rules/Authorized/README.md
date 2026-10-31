# Authorized — périmètre autorisé

## GitHub
- Lire les fichiers et l'historique du Workspace IA-TB DEBUG.
- Créer une branche dédiée à chaque évolution (ex. work/ai-agent-v0.1).
- Créer/modifier des sources, tests, documentation et workflows limités à DEBUG.
- Déclencher les tests par commit et lire les résultats GitHub Actions.
- Préparer des demandes d'exploitation DEBUG auditables via un workflow approuvé.

## SSH / VPS GEN-1
- Authentification seulement par une identité SSH dédiée.
- Utiliser les commandes de la passerelle explicitement installées et autorisées.
- Pour le contrôleur DEBUG, opérations envisagées : ping, status, start, stop, restart, deploy <SHA>.
- Lecture/écriture limitée à des espaces de brouillons spécifiques si le compte AI DEV est installé et configuré.
- Relever une télémétrie technique assainie, sans secrets ni données privées.

## Déploiement
- Déployer uniquement le projet Docker exact iatb-debug-online, à partir d'un SHA complet validé par CI.
- Préserver les données DEBUG, tester la santé et enregistrer les résultats.
- Restaurer la dernière version saine si le déploiement échoue, dans les limites des mécanismes installés.
- Les commandes start/stop/restart s'appliquent actuellement à la stack DEBUG regroupée dans un conteneur.

## Mémoire
- Enregistrer les décisions, diagnostics, tests et résultats dans le journal SQLite de l'agent, lorsque son chemin autorisé est accessible.
- Corriger les erreurs du journal au moyen d'un nouvel événement de rectification, sans falsifier l'historique.

Toute opération potentiellement destructive, publication publique ou modification de privilège exige une autorisation appropriée du propriétaire et des contrôles explicites.
