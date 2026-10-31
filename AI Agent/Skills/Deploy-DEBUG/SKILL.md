---
name: iatb-deploy-debug
description: Construire, tester et exploiter le conteneur DEBUG isolé sur VPS GEN-1 via contrôleur restreint.
version: 0.1
---

# Deploy-DEBUG — GEN-1

## Périmètre
- Projet Docker : iatb-debug-online.
- Conteneur actuel : iatb-debug-online-app.
- Code sur VPS : /srv/iatb-debug/online/source.
- Données privées DEBUG : /srv/iatb-debug/online/private.
- HTTPS prévu : trading.debug.iatb.dns.org (statut public à confirmer).
- RELEASE et /var/lib/iatb : hors périmètre.

## Opérations admises par le contrôleur prévu
- status : inspecter l'état et la santé du conteneur DEBUG.
- start : démarrer le conteneur DEBUG si son identité Auth21 est prête.
- stop : arrêter le conteneur DEBUG sans supprimer les volumes.
- restart : redémarrer DEBUG.
- deploy <SHA complet> : récupérer le commit sur la branche DEBUG approuvée, valider CI, construire l'image et démarrer ; tenter un rollback si la santé échoue.

## Prérequis obligatoires
1. Le contrôleur /usr/local/libexec/iatb-debug-operator a été installé par l'administrateur et son sudoers limite le compte SSH à ce programme.
2. La passerelle SSH à commande forcée reconnaît l'opération.
3. L'environnement GitHub debug-ssh dispose de secrets et de clés d'hôte vérifiés.
4. Le workflow GitHub .github/workflows/iatb-debug-ops.yml exécute une demande validée.
5. Le commit de déploiement possède un résultat CI success exact sur la branche approuvée.
6. Les fichiers de sécurité Compose et Dockerfile restent approuvés.
7. La base d'identité Auth21 DEBUG existe déjà et contient un ADMIN.

## Procédure
1. Consulter status et mémoriser le SHA/version initiale.
2. Vérifier la CI du commit exact et les chemins du déploiement.
3. Soumettre la demande d'opération via GitHub Actions ; ne pas ouvrir un shell SSH libre.
4. Lire les logs du workflow et la santé du conteneur.
5. Si le contrôle échoue, documenter l'état et vérifier le rollback ; **ne pas effacer les données pour forcer un succès**.
6. Faire confirmer l'accès HTTPS uniquement à partir d'un test réel, jamais de la CI seule.
7. Enregistrer l'action et son résultat dans Memory/General lorsque l'outil est accessible.

## Limites actuelles
Le DEBUG regroupe ses moteurs dans un seul conteneur : start/stop/restart concernent la stack complète. Les droits d'exploitation ne sont pas automatiquement actifs parce que ce Skill existe. Le contrôleur déployable cible seulement work/debug-online-v1, pas arbitrairement toutes les branches versionnées.

## Interdictions
Ne pas exécuter docker compose down -v, ne jamais monter /var/lib/iatb, ne jamais activer les ordres de trading réel, ne pas modifier RELEASE, ne pas contourner les protections de rôles ou le contrôle CI.
