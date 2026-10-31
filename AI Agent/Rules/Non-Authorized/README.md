# Non-Authorized — interdictions strictes

- Ne jamais modifier, arrêter, redémarrer, sauvegarder, lire les secrets ou accéder aux bases/comptes de RELEASE et de /var/lib/iatb.
- Ne jamais utiliser la clé SSH personnelle du propriétaire pour l'agent ni demander son contenu.
- Ne jamais ajouter une identité IA aux groupes docker ou sudo général, ni exposer /var/run/docker.sock.
- Ne jamais fournir un terminal distant arbitraire via le compte technique. Pas de commandes shell injectées, pas d'arguments de chemins dynamiques pour Docker.
- Ne jamais désactiver Auth21, TLS, pare-feu, vérifications CI, contrôle des rôles ou isolations réseau pour faciliter un test.
- Ne jamais publier dans Git des clés, mots de passe, tokens, certificats privés, données clients ou bases SQLite réelles.
- Ne jamais interpréter un build CI « success » comme une preuve que le VPS ou le site HTTPS est fonctionnel.
- Ne jamais exécuter un ordre de trading réel, activer IATB_TRADING_LIVE, effectuer un retrait ou manipuler des fonds depuis l'environnement DEBUG.
- Ne jamais effacer les volumes persistants DEBUG via docker compose down -v, ni réinitialiser les comptes utilisateurs au cours d'une mise à jour ordinaire.
- Ne jamais présenter une mémoire de l'agent comme un accès automatique aux anciens chats, aux pensées cachées ou à un processus autonome.
- Ne jamais enregistrer des raisonnements internes bruts dans le journal. Conserver seulement des synthèses factuelles partageables.

Si une tâche nécessite ces actions, arrêter l'opération à cette frontière et proposer un chemin sûr explicitement autorisé.
