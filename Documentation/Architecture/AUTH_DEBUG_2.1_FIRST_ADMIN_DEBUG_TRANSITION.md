# IA-TB DEBUG 2.1 — Préparation du premier ADMIN et transition des anciens logins DEBUG

**Date :** 14/10/2026. **Branche :** `feature/debug-2.1-auth-design`.
**Statut : prototype de transition vérifié exclusivement sur bases SQLite temporaires. AUCUNE action sur GEN-1 ni sur une base DEBUG réelle.**

## Modules et contrats

- `App/Core/Clients/auth21_first_admin_trial.js` exporte `Auth21FirstAdminTrial`. Malgré sa localisation Core, cet adaptateur **n'est pas utilisé par le serveur** : chaque constructeur appelle la garde `assertFixture` qui refuse les bases SQLite hors d'un répertoire système temporaire `iatb-auth21-v3-*` et exige une clé maître elle aussi dans ce répertoire.
- Le constructeur exige le schéma v3 proposé, les 8 triggers de sécurité, les clés étrangères actives, une instance `ClientCrypto` correspondant à la base de test et un callback d'autorisation locale. **Ce callback est un faux témoin de l'opérateur utilisé dans les tests : il ne constitue PAS une authentification du compte Linux.**
- `review()` est strictement **read-only** et ne retourne que les `clientId`, rôles, états, nombre de références Wallet, preuve de provenance et statut de revue. Aucun mot de passe, hash, prénom ou email n'est exposé.
- Un historique DEBUG est classé `VERIFIED_DEBUG_BOOTSTRAP` **uniquement** si son rôle vaut `SUPERADMIN` et si le `external_ref_hash` correspond cryptographiquement au dérivé `debug-user:` du nom d'utilisateur déchiffré avec la clé existante. Les rôles `SUPERADMIN` sans preuve restent `UNVERIFIED_SUPERADMIN` et **ne doivent pas être effacés automatiquement**. Certaines anciennes identités DEBUG liées par email peuvent aussi être non identifiables sans inspection humaine.
- `createFirstAdmin` impose une demande explicite (confirmation littérale, identifiant ou identité sélectionnée, utilisateur et mot de passe non par défaut), vérifie qu'il n'existe aucun ADMIN actif, hache le secret par Argon2id, fait une **sauvegarde SQLite vérifiée** avant toute écriture et inscrit l'identité et l'audit **dans une transaction immédiate**. Il peut créer une identité fictive neuve, lier un login à un client existant sans login, ou convertir explicitement un login historique `SUPERADMIN` choisi en `ADMIN` sans toucher aux liens Wallet. L'ancienne authentification n'est jamais convertie automatiquement.
- En cas de changement concurrent de mot de passe, d'index de nom d'utilisateur, de profil client ou d'autorisation locale pendant le hachage, le projet de création est rejeté. Un échec de l'audit annule toute la transaction ; la copie d'avant opération reste disponible.
- `retireLegacyDebugLoginFixture` démontre le protocole de retrait **sur une fixture uniquement** : elle refuse tout utilisateur non classé DEBUG vérifié, exige un ADMIN authentifié ET une autorisation locale, une confirmation individuelle contenant le `clientId`, une nouvelle sauvegarde SQLite, une seconde vérification transactionnelle du compte ET de l'identité client complète (y compris les colonnes de credential, le rôle, l'état et la version de sécurité) et un audit sans secret. Elle **ne supprime que `client_accounts`**, laisse `clients`, `client_wallets` et l'ADMIN actif intacts et interdit tout retrait automatique ou sans revue.

## Tests vérifiés

- [GitHub Actions P2.2 SUCCESS — 38534762053](https://github.com/florian74410/IA-Trading-Bot/actions/runs/38534762053) : **26/26 tests de transition** et **170/170 tests Node.js** plus **15/15 tests SQLite Python**, soit **185/185 tests réussis**, Node.js 22.
- `App/Tools/Tests/auth21_first_admin_trial.test.js` couvre : inventaire DEBUG vérifié/non vérifié et absence de mutation ; consentement explicite ; création ADMIN neuve et rattachement à client existant ; association Wallet ; Argon2id réel ; sauvegarde préalable vérifiable ; conservation de la clé ; conversion manuelle `SUPERADMIN` sans promotion implicite ; résilience aux pertes d'autorisation / snapshot / concurrence, y compris une identité client éditée et un index d'utilisateur incohérent ; refus bases hors fixture et mauvaises clés ; rollback si audit défaillant ; retrait unitaire approuvé du login DEBUG ; refus de répétition et d'un `SUPERADMIN` sans provenance vérifiée.
- Le workflow CI utilise des **mots de passe, identités, bases et clés fictifs**. Ni clé Wallet, ni compte réel, ni serveur, ni API ne sont accessibles via ces tests.

## Procédure future sur environnement approuvé — PAS À EXÉCUTER ENCORE

1. Terminer Auth 2.1, Phase 3 Gateway/Auth et Phase 4 RBAC ; assurer désactivation de `ClientService.bootstrapDebugUser` et du `active_client_id` global. Installer les dépendances natives dans les manifests du runtime et lier toutes les gardes snapshot.
2. Exécuter le préflight de compatibilité, inventorier tous les writers et verrouiller les écritures. Créer une **sauvegarde cohérente chiffrée de toute la base ET de la clé maître originale, séparément protégée**, y compris les données métier dépendantes ; restaurer une copie autorisée en lecture seule avant toute migration réelle.
3. Effectuer une migration de test sur une copie autorisée ; vérifier integrity_check, foreign_key_check, associations Wallet, schémas et restauration, plus la performance. GEN-1 uniquement après validation complète et autorisation explicite d'Overflow.
4. Déployer la vraie CLI locale `iatb-users` (Phase 5) avec authentification **du processus/opérateur OS** vérifiée, droits FS limités, session ADMIN lorsque disponible, mots de passe saisis sans écho/depuis stdin de façon sûre, refus de démarrage distant non authentifié, sortie et journaux sans secrets.
5. Après décision humaine, créer le premier ADMIN depuis la CLI — nouveau client, client existant sans login ou reconciliation explicite d'un `SUPERADMIN`. **Aucune création de mot de passe par défaut ni élévation automatique**, et préserver l'identité choisie et ses liens Wallet.
6. Afficher un **dry-run nominatif par `clientId`** des anciens logins DEBUG : preuve de provenance, état, dépendances, associations Wallet et impacts. Toute identité non attribuable reste inchangée jusqu'à vérification manuelle.
7. Pour chaque login DEBUG validé, exiger une approbation **spécifique au compte**, reprendre une sauvegarde fraîche, recontrôler la version/empreinte sous transaction, ne retirer que le login historique, auditer et vérifier la continuité de l'ADMIN et de toutes les données métier.
8. Tester login, logout, révocation, rôles ADMIN/USER/GUEST, restauration, conflits concurrentiels et sécurité inter-Engines en Phase 6 avant la Phase 7. Ne jamais activer le trading LIVE pendant ces validations.

## Frontières non franchies

- La création/suppression n'est implémentée que dans **un prototype explicitement bloqué sur les bases réelles**. La CLI Linux/SSH et le flux de consentement interactif de production ne sont pas encore développés.
- Le contrôle de clé ici garantit son **emplacement sur la fixture**, pas la restauration fiable d'une clé maître de production ni une preuve indépendante de compatibilité avec tous les champs chiffrés.
- Les sauvegardes du prototype sont SQLite non chiffrées **à l'intérieur de répertoires temporaires purement fictifs** ; elles ne sont **pas** la procédure de sauvegarde chiffrée requise en déploiement.
- Toute comparaison de hash et toute garantie anti-contournement doit encore être éprouvée en environnement multi-processus et contre les writes legacy (`UPSERT`, `paths.js`) lors de la Phase 6.

**Conclusion : préparation et tests du parcours terminés sur banc isolé, mais Phase 2 et la procédure réelle de conversion DEBUG restent [ ] jusqu'à la CLI sécurisée, au backup complet, à l'intégration et à l'autorisation d'Overflow.**
