# IA-TB — AI Agent v0.1

Espace de travail documentaire et technique de l'agent IA-TB. Ce dossier définit des règles, des compétences et une mémoire opérationnelle **simulée par le LLM** ; il ne crée ni agent autonome, ni processus résident, ni accès automatique au VPS.

## Structure

- Memory/ — mémoire persistante et journal SQLite horodaté.
- Soul/ — identité fonctionnelle, tonalité, objectifs et limites.
- Skills/SSH/ — utilisation de la passerelle SSH restreinte.
- Skills/GitHub/ — branches versionnées, commits, CI et audit.
- Skills/Deploy-DEBUG/ — contrôleur DEBUG (status/start/stop/restart/deploy).
- Rules/Authorized/ — actions permises selon les permissions réelles.
- Rules/Non-Authorized/ — actions interdites et limites de sécurité.
- Tests/ — vérification de la mémoire et de ses règles.

## Source de vérité et environnement

- Code : dépôt GitHub IA-Trading-Bot---DEBUG---IA-Workspace.
- Développement : branches versionnées work/* ; les déploiements nécessitent un commit et un CI réussis.
- DEBUG VPS : /srv/iatb-debug/online/source (code) et /srv/iatb-debug/online/private (données protégées).
- Brouillons éventuels : espace de travail indépendant et explicitement autorisé, sans droits implicites sur le runtime.
- RELEASE : hors périmètre de l'agent.
- Base SQLite mémoire : fichier **hors dépôt**. Le dépôt contient uniquement le schéma et l'outil de gestion. Pas de clés SSH, secrets, jetons, comptes ou données clients dans Git.

## Modèle d'exécution

1. Lire Soul et Rules avant toute action.
2. Lire uniquement les mémoires pertinentes à la tâche.
3. Rédiger une synthèse vérifiable : contexte → décision → action → résultat.
4. Mettre à jour un brouillon/une branche GitHub, exécuter les tests, contrôler le CI.
5. Ne déployer qu'avec la passerelle installée et les permissions réellement accordées.
6. Journaliser la décision et le résultat dans Memory/General via SQLite, lorsque la base et le canal d'écriture sont disponibles.

**Important** : un LLM ne peut pas capturer sa chaîne de raisonnement interne. La mémoire stocke des **synthèses explicites** de diagnostics, décisions, actions et enseignements avec horodatage, pas des raisonnements cachés. Elle ne s'actualise pas toute seule : un outil ou un workflow doit appeler son journal.

## État v0.1

Les fichiers de ce dossier sont publiés sur GitHub et testables. La persistance sur GEN-1, la synchronisation entre sessions ChatGPT et l'automatisation des écritures ne sont pas activées par la seule présence de ces fichiers.
