---
name: iatb-github
description: Gérer le dépôt IA-TB Workspace, les branches versionnées, les commits et les validations CI.
version: 0.1
---

# GitHub — gestion du dépôt

## Source
florian74410/IA-Trading-Bot---DEBUG---IA-Workspace

## Outils
Utiliser le connecteur GitHub réellement connecté pour lire, créer ou modifier les fichiers, branches et consulter les runs GitHub Actions. Ne jamais mettre les secrets dans les commits, les logs, les messages ou les workflows.

## Flux de travail
1. Identifier la branche de référence et le SHA avant modification.
2. Créer une branche distincte pour la fonctionnalité/version (par exemple work/ai-agent-v0.1), plutôt que pousser une expérimentation sur RELEASE.
3. Lire les fichiers impactés et les contraintes du projet, notamment Rules/.
4. Produire un patch minimal et des tests de non-régression.
5. Publier des commits descriptifs et vérifier les SHA réellement retournés par GitHub.
6. Consulter le résultat de la CI **pour le SHA exact** et diagnostiquer un échec à partir des logs.
7. Remonter à l'utilisateur le lien de la branche, le SHA, les tests passés/échoués et les points restant à déployer.
8. Ne demander un déploiement que si le workflow et le contrôleur reconnaissent la branche et le SHA visés.

## Points de vigilance
- Le workflow « IA-TB Workspace - build-only CI » construit une image de test, mais ne déploie pas sur le VPS.
- Les demandes d'opérations DEBUG sont préparées sur main dans Infrastructure/DEBUG_ONLINE/ops/request.json ; elles nécessitent une configuration préalable des secrets et de l'accès SSH.
- Le contrôleur DEBUG actuellement conçu limite le déploiement automatique aux SHA de la branche work/debug-online-v1. Les nouvelles branches de fonctionnalité doivent être intégrées au flux approuvé avant déploiement.
- Un commit accepté par GitHub n'est pas une preuve que Docker a redémarré correctement.

## Preuves
URL du commit, nom de branche, run GitHub Actions, résultat de test, statut de déploiement et journal de décision.
