---
name: iatb-ssh
description: Vérifier et utiliser la connexion SSH restreinte entre GitHub Actions et GEN-1 DEBUG.
version: 0.1
---

# SSH — connexion au VPS GEN-1 DEBUG

## Objectif
Utiliser l'identité dédiée iatb-debug-ci pour les opérations spécifiquement autorisées, **jamais** la clé personnelle de l'administrateur. Ne pas contourner la commande forcée SSH.

## Accès actuel / prérequis
- L'utilisateur a confirmé depuis son XFCE le message IA-TB_DEBUG_SSH_OK pour iatb-debug-ci@169.58.177.163.
- La connexion directe depuis la session ChatGPT n'est **pas** établie : l'agent peut passer par GitHub Actions une fois les secrets et l'environnement GitHub configurés.
- Le workflow manuel est .github/workflows/iatb-debug-ssh-probe.yml, branch work/debug-online-v1.
- Les secrets de l'environnement GitHub debug-ssh doivent être IATB_DEBUG_SSH_KEY et IATB_DEBUG_SSH_KNOWN_HOSTS.
- La clé d'hôte doit être vérifiée et épinglée, StrictHostKeyChecking=yes.
- Un pare-feu limité à l'IP du propriétaire peut bloquer les runners GitHub. Ne pas ouvrir SSH à toute l'Internet par défaut.

## Procédure
1. Contrôler la configuration et l'état du workflow GitHub.
2. Déclencher le test manuel autorisé, si disponible, et lire les journaux.
3. Vérifier la réponse exacte IA-TB_DEBUG_SSH_OK.
4. Pour toute opération ultérieure, utiliser exclusivement les commandes reconnues par la passerelle installée, sans fabriquer de terminal arbitraire.
5. Journaliser un résultat factuel (succès ou échec) dans Memory/General si le mécanisme d'écriture a été configuré.

## Clés / comptes
- iatb-debug-ci : connexion SSH limitée, initialement ping puis status/start/stop/restart/deploy lorsque l'opérateur root restreint est installé.
- iatb-ai-dev : espace de brouillons séparé, son installation et la connexion GitHub restent à vérifier ; aucun accès automatique au runtime.
- Les clés privées ne transitent jamais par le dépôt, un chat, une issue ou les logs CI.

## Règles de refus
Pas de changement de sshd_config, sudoers générique, groupe docker, Docker socket, port forwarding ni écriture RELEASE. Si le test échoue, ne pas présenter le VPS comme accessible.
