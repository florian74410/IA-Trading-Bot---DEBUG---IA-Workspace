# MCP v0.3 — ordre de livraison DEBUG + Architecture

**Règle projet : les clés SSH, secrets de connexion et l'installation VPS sont la dernière étape, après que tout le code et les tests réalisables sur GitHub ont été finalisés.**

1. Finaliser les modules MCP partagés, interfaces, types, catalogues autorisés, protections et tests négatifs pour les deux profils.
2. Finaliser le contrôleur de mission et l'API d'approbation *hors bande*. Une chaîne de 40 caractères ne constitue **jamais** une preuve d'approbation; seul le vérificateur externe de confiance pourra autoriser une opération. Ne fournir aucune commande générique arbitraire à un agent.
3. Préparer et auditer les workflows GitHub Actions, procédures de déploiement SHA-épinglé, tests de santé, rollback et journaux.
4. Exécuter tous les contrôles unitaires, HTTP MCP sur loopback, statiques et tests de sécurité dans GitHub Actions (sans VPS).
5. Identifier et résoudre les blocages du build général DEBUG (sources `App/` attendues manquantes), sans modifier artificiellement les exigences CI.
6. Établir un manifeste des versions et des fichiers; maintenir les PR en brouillon jusqu'à la revue de sécurité.
7. **Dernière étape avec l'administrateur seulement :** relever et sauvegarder de manière sécurisée le vrai `/opt/iatb-mcp/server.py`, vérifier les identités/permissions réelles, générer et installer des clés **publiques** SSH dédiées si nécessaire et enregistrer les secrets privés directement dans les environnements GitHub (jamais dans le chat). Auditer la clé d'hôte SSH hors bande.
8. Installer les deux services en staging séparé, comparer les six outils DEBUG originaux, tester les refus d'accès, le contrôle d'identité, le circuit d'approbation et le rollback. Une activation définitive des services ne peut intervenir qu'après approbation.

**Périmètres indépendants :** DEBUG reste DEBUG, Architecture reste Architecture. Interdit d'utiliser un compte, une clé ou un workspace MCP pour accéder à RELEASE.

**État :** cette page décrit la séquence; sa publication ne déploie ni ne connecte les MCP.
