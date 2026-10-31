# Déploiement GEN-1 — procédure contrôlée

1. SSH avec iatbadmin ; sudo docker testé.
2. Clonage lecture seule sur /opt/iatb/source/IA-Trading-Bot, branche debug.
3. Contrôler git status, version et dépendances de App/.
4. Tester l'application en environnement isolé SANS identifiants de trading, et interdire l'exécution d'ordres réels avant d'adapter Docker.
5. Préparer /opt/iatb/debug et /opt/iatb/release, volumes indépendants /var/lib/iatb/.
6. Construire Dockerfiles/Compose après l'audit des ports, des scripts, des fichiers d'état et des dépendances Node natives.
7. Les services internes ne doivent pas être publiés sur 0.0.0.0 / ::. Garder les ports externes fermés jusqu'à l'intégration de Caddy + authentification.
8. DEBUG d'abord. RELEASE pourra partir du même instantané source UNIQUEMENT après validation et avec paramètres/sécrets/volumes strictement séparés ; ne jamais activer les ordres réels par défaut.
9. Faire le snapshot de base Contabo après configuration de l'infrastructure ; prévoir les sauvegardes hors VPS des données métier.

Cette documentation n'implique pas que Docker Compose ou l'application ait déjà été testé sur Debian.
