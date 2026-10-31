# IA-TB — Conception authentification DEBUG 2.1

> **Statut :** spécification initiale à revoir avant programmation.  
> **Base :** branche fix/v2.0.1-debug ; branche de travail feature/debug-2.1-auth-design.  
> **Portée :** DEBUG 2.1 et interface CLI native ; pas de changement réseau ni de données lors de cette étape.

## Contrat de confiance et latence (P1.4)

Les quatre principes Gateway / Core Auth / Router-Engines / fail-closed et la contrainte de **latence de sécurité minimale** sont approuvés en principe. Le détail de conception est dans le [Trust Boundary Contract](AUTH_DEBUG_2.1_TRUST_BOUNDARIES.md), accompagné du [plan de performance](../Security/AUTH_DEBUG_2.1_SECURITY_PERFORMANCE.md). **P1.4 est validé comme contrat d'architecture et diagnostic réseau** : [relevé GEN-1](../Security/AUTH_DEBUG_2.1_NETWORK_BOUNDARY_AUDIT.md) effectué le 14/10/2026 (zéro port Docker publié, services IA-TB en loopback dans namespace partagé). Le versionnage du protocole, les tests Auth/ownership et les benchmarks restent des jalons ultérieurs ; aucun changement runtime ou réseau effectué.

## Versionnage indépendant des contrats (P1.6 — approuvé en conception)

Les migrations clients historiques `001` et `002` et CP/1 restent fonctionnellement inchangés. L'évolution du système Auth s'appuiera sur les versions **distinctes** `auth_schema_version`, `auth_protocol_version` et `permissions_version`, plus le compteur individuel `clients.security_version`. Voir [contrat de versionnage et compatibilité](AUTH_DEBUG_2.1_VERSION_COMPATIBILITY.md) et [manifest proposé (non actif)](AUTH_DEBUG_2.1_VERSION_MANIFEST_PROPOSAL.json). **P1.6 est approuvé comme architecture**, aucun runtime modifié ; choix définitifs de cryptographie et tests de compatibilité restent pour l'implémentation. Les données et clés wallets demeurent hors du périmètre.

## Matrice RBAC et propriété des données (P1.7 — approuvée en conception)

Après validation de P1.6, la cible RBAC est détaillée dans le [contrat ADMIN/USER/GUEST](AUTH_DEBUG_2.1_RBAC_CONTRACT.md), la [matrice JSON non active des 212 entrées](AUTH_DEBUG_2.1_RBAC_MATRIX_PROPOSAL.json) (dont 77 actions CP/1 UI) et les [48 cas négatifs](../Security/AUTH_DEBUG_2.1_RBAC_NEGATIVE_TEST_PLAN.md). Distinction impérative : PUBLIC partagé assaini, ressources OWNER liées au `clientId` de session, configuration GLOBAL réservée à ADMIN et principal machine CP/1 distinct. **P1.7 est approuvé par Overflow le 14/10/2026**, et toute nouvelle fonctionnalité doit déclarer ses permissions conformément à la [politique de changement](../Security/AUTH_DEBUG_2.1_RBAC_CHANGE_POLICY.md). Contrôles runtime/CI à construire et tester ; aucun code métier ni donnée modifié. Wallet gelé et ordres LIVE désactivés.

## P1.8 — Export/import DEBUG ↔ RELEASE écarté du périmètre

**Décision explicite d'Overflow (14/10/2026)** : ne **pas** développer la portabilité automatique des comptes ni des données entre DEBUG et RELEASE en version 2.x. Créer à l'arrivée de RELEASE son compte ADMIN propre par la CLI SSH native. L'hypothèse de quelques comptes en version majeure 3.x sera traitée par une **migration manuelle de la DB clients uniquement si nécessaire**, en chantier séparé, après sauvegarde/restauration testée, contrôle de la clé client et accord opérateur ; aucun transfert implicite de rôle, session, permission, wallet ou donnée métier. L'arborescence existante des données reste inchangée. [Ancien contrat abandonné, conservé pour traçabilité](AUTH_DEBUG_2.1_ACCOUNT_PORTABILITY_CONTRACT.md).

## Intégrité de la matrice RBAC — exigence ajoutée par Overflow

Le JSON des permissions est une **référence de conception**, jamais un fichier librement éditable donnant directement des droits. Voir [RBAC Policy Integrity](../Security/AUTH_DEBUG_2.1_RBAC_POLICY_INTEGRITY.md) : tests anti-élévation GUEST, protection de PR, politique embarquée dans un build vérifié avec origine de confiance indépendante, contrôle au démarrage et refus par défaut ; contrôle des permissions à faible coût pour ne pas ralentir les Engines.

## Phase 2 engagée — P2.1 / gel de déploiement DEBUG

**Décision d'Overflow (14/10/2026) : aucune nouvelle version Docker DEBUG publiée/déployée sur GEN-1 avant intégration et validation complète du système Auth 2.1.** Tests et commits sur branche de développement uniquement. Le [préflight et les 26 tests SQLite fictifs](AUTH_DEBUG_2.1_PHASE2_STORAGE_PRECHECK.md) sont un prototype de non-régression, pas un outil de restauration réel. Les méthodes de chiffrement/clé wallet et les règles Contabo restent inchangées.

## P2.1 — Cohérence des sauvegardes et écrivains SQLite

Le [prototype de barrière coopérative sur fixtures](AUTH_DEBUG_2.1_COHERENT_SNAPSHOT_BARRIER.md) et l'[inventaire préliminaire des écrivains SQLite](AUTH_DEBUG_2.1_SQLITE_WRITER_INVENTORY.md) complètent le [plan de stockage P2.1](AUTH_DEBUG_2.1_PHASE2_STORAGE_PRECHECK.md). Les **26 tests P2.1** sur fixtures ont réussi dans [GitHub Actions](https://github.com/florian74410/IA-Trading-Bot/actions/runs/38501734180) : **P2.1 est clos au périmètre de préparation sur fixtures**. Cette preuve ne coordonne **aucun des 13 services réels** : [P2.2](AUTH_DEBUG_2.1_PHASE2_WRITER_COORDINATION.md) reste ouvert pour l'inventaire exhaustif, les ACK multi-writers, les restaurations complètes sur copies autorisées et les performances. Toujours aucune nouvelle version Docker sur GEN-1 avant Auth 2.1 complet.

## Décisions approuvées

- Architecture native Core Auth Service + UI Gateway + moteur de permissions RBAC (ADMIN, USER, GUEST), refus par défaut.
- Base SQLite conservée, clé AES-256-GCM et stockage persistant séparés ; aucune migration destructive implicite.
- Administration des comptes depuis un exécutable **dans IA-TB** sur le VPS, appelé également via SSH par IA-TB CLI. Pas d'inscription Web en 2.1.
- Clients identifiés durablement par clientId ; préférences, stratégies, portefeuilles et wallets isolés logiquement par compte, contrôles de propriété côté serveur.
- Durée de session bornée, verrouillage après 5 min d'inactivité, mot de passe demandé pour déverrouiller. Le simple chargement automatique de données ne prolonge pas le délai d'activité.
- DEBUG et RELEASE isolés par DB, clés, sessions et autorité d'exécution. **Aucun export/import automatique entre environnements en 2.x** ; création manuelle du compte ADMIN propre à RELEASE, migrations DB futures éventuelles traitées séparément. Pas de duplication de sessions, clés ou droits.
- HTTP permis **uniquement en environnement privé de test** (127.0.0.1/tunnel SSH ou VPN protégé) ; Internet public requiert HTTPS/TLS, même si l'interface Admin des certificats reste prévue ultérieurement.
- Wallets et custody différés **après Supervisor Engine**. Ne pas altérer les secrets ou migrer les clés existants lors du chantier d'authentification.

## État du code examiné

| Module | Situation existante | Point à corriger |
| --- | --- | --- |
| Core/Clients/client_repository.js | clients + client_accounts en SQLite | transactions, migrations, role GUEST, révocation |
| Core/Clients/client_crypto.js | AES-256-GCM, HMAC d'index | fail-closed si clé indisponible ; rotation future |
| Core/Clients/client_service.js | PBKDF2-SHA256 et bootstrap DEBUG | Argon2id, interdiction d'auto-créer un client pour une session non authentifiée |
| Core/Server/server.js | /api/login existant, /api/bootstrap toujours authentifié, session locale bypass | vraie authentification ; supprimer /api/setup public ; verrouillage serveur |
| UI/Gateway/ui_service.js | AUTH_MODE=disabled, classification partielle | contrôle de session sur **toutes** routes : pages, assets sensibles, API, Router, données marché et fonctionnalités Web |
| UI/Permissions/ui_permissions.js | READ/USER_WRITE/ADMIN_WRITE, GUEST absent | matrice exhaustive et deny-by-default |
| Bank/Core/wallet_service_v2.js | lien clientId ; secrets AES-256-GCM avec clé maître côté serveur | **ne pas modifier maintenant** ; aucune promesse non-custodial |

**Écueils supplémentaires à corriger :** le serveur ne doit pas traiter la session utilisateur comme une identité globale partagée (champ active_client_id) ; le cookie ne peut pas représenter seul un état déverrouillé ; les routes directes Core et Router sont isolées réseau et doivent aussi contrôler la provenance du service. La vérification de rôle ne peut pas provenir d'un en-tête que le client pourrait forger.

## Modèle de données proposé

1. **clients** (existant) : client_id opaque stable, identité éventuellement chiffrée, statut, version de sécurité.
2. **client_accounts** (existant, migration) : nom de connexion normalisé et indexé, hash + sel Argon2id (ou ancien PBKDF2 jusqu'au rehash), rôle ADMIN/USER/GUEST, enabled, created_at/updated_at.
3. **auth_sessions** (nouveau) : session_id_hash, client_id, created_at, expires_at, last_user_activity_at, locked_at, revoked_at, security_version. Réinitialiser l'ID à chaque connexion/déverrouillage ; ne jamais stocker cookie en clair.
4. **auth_audit** (nouveau ou extension de client_audit) : événement, acteur, cible, résultat, date, métadonnées non sensibles.
5. **user_preferences** (nouveau) : client_id + namespace + key + payload borné, sans secrets ; GUEST modifie uniquement son état local non persistant.
6. **auth_schema_migrations** : version du schéma + historique fiable ; distinction entre auth_protocol_version (contrat API) et permissions_version (matrice).

**Contraintes :** migrations transactionnelles et sauvegarde SQLite à chaud ; sauvegarde de la clé de chiffrement séparément ; conservation de l'identité du compte Admin d'une version à la suivante. Un échec de lecture DB/clé refuse l'accès et ne recrée pas une nouvelle clé au démarrage. Ne jamais exposer des données chiffrées/de hash dans les API.

## Matrice initiale de privilèges

| Action | ADMIN | USER | GUEST |
| --- | --- | --- | --- |
| Pages non admin et données publiques autorisées | oui | oui | oui |
| Lire ses propres données et historiques | oui | oui | oui si autorisé |
| Changer marché, timeframe, indicateurs dans sa vue | oui | oui | oui, local seulement |
| Persister des préférences utilisateur | oui | oui | non |
| Actions métier/stratégies non administratives | oui | oui sous règles métier | non |
| Administration, secrets partagés, config Engines | oui | non | non |
| Créer/modifier/supprimer des comptes par Web | **non en 2.1** | non | non |
| Administrer le VPS/SSH/Docker par interface Web | non | non | non |

Les opérations de trading LIVE demeurent désactivées sur DEBUG, quel que soit le rôle. Les autorisations s'appliquent à chaque endpoint et canal Router, indépendamment de la visibilité des contrôles dans le navigateur.

## Flux d'authentification envisagé

1. Accès anonyme : page/login et ressources publiques strictement autorisées uniquement. Identifiants invalides : réponse générique, rate limiting et audit sans fuite de compte.
2. Connexion : recherche d'un compte actif, vérification du mot de passe, création de session serveur, cookie opaque HttpOnly + SameSite (+ Secure sur HTTPS) ; aucune exception de bypass publique.
3. À chaque action : identification de session, état locked/revoked/expired, rôle et client_id issus **du serveur**, vérification de l'ownership, CSRF pour changements d'état.
4. AutoLock : compter l'inactivité utilisateur côté serveur ; les requêtes de rafraîchissement de données ne renouvellent pas ce compteur. Le navigateur affiche un verrou, mais ce verrou ne constitue pas le mécanisme de sécurité. Les requêtes métier échouent lorsque la session est verrouillée ; mot de passe obligatoire pour déverrouiller.
5. Logout/révocation : suppression immédiate de l'autorisation côté serveur ; rotation des secrets de session lors des opérations critiques. Fermeture navigateur et nouvelle ouverture ne doivent pas contourner le verrou.
6. Échec d'accès DB/Core/Auth : refuser l'autorisation (fail closed), ne pas utiliser un rôle par défaut.

## Administration CLI native

Programme cible : App/Tools/iatb-users.js (nom à confirmer), utilisant le même service métier que Core, exécuté sous une identité Linux dédiée limitée à la base de comptes et aux clés nécessaires.

Commandes cibles : list ; create --role admin|user|guest ; role ; enable ; disable ; reset-password ; delete (soft-delete/anonymisation contrôlée) ; audit. **Aucune commande export/import/migrate inter-environnements dans DEBUG 2.1**.

Les mots de passe sont demandés par invite TTY masquée (ni argument shell, ni fichier temporaire en clair, ni logs). La suppression d'un client ne supprime jamais par défaut ses wallets ou clés ; un administrateur ne doit pas pouvoir retirer le dernier ADMIN actif. Les procédures de récupération d'accès restent privées via SSH, jamais par URL de secours publique.

**Décision P1.5 (14/10/2026) — conserver l'existant et isoler :** ne pas refondre les services stables ; le nouveau système Auth réduit progressivement l'accès aux volumes/identités OS des services avec validations et rollback. Les données wallet historiques restent inchangées ; la clé `wallet_master.key` étant absente sur le GEN-1 audité, **ne pas la créer**. Le modèle Wallet sera éventuellement redessiné dans un autre chantier, sans modification de clés pendant Auth 2.1.

## Wallets — report assumé

- Le code actuel associe les wallets à clientId, mais la clé AES du serveur peut déchiffrer leurs secrets : **pas de confidentialité cryptographique vis-à-vis de l'admin VPS** aujourd'hui.
- **Après le premier déploiement seulement** : envisager watch-only sur adresse publique ; aucun import de seed/private key via HTTP ; aucune utilisation de wallet réel sur l'environnement DEBUG.
- Phase future après Supervisor : connecteur Web sans installer une application IA-TB : extension de portefeuille déjà présente, WalletConnect vers un portefeuille existant sur téléphone, ou hardware wallet compatible. L'utilisateur signe localement, le serveur reçoit uniquement la transaction signée ou une preuve de contrôle.
- Ne pas promettre le non-custodial sur une interface JavaScript servie par un administrateur sans attestation/inspection indépendante : prévoir revue de code, CSP stricte, contrôle d'intégrité et tests de transactions.
- Prévoir un chantier de migration **opt-in** pour les wallets historiques, sans déchiffrement ni transfert automatique au cours du déploiement 2.1.

## Plan de réalisation optimisé — jalons bloquants

**Checklist d'exécution et validations point par point :** [AUTH_DEBUG_2.1_WORKPLAN.md](AUTH_DEBUG_2.1_WORKPLAN.md). Les phases ci-dessous sont un résumé historique ; la checklist dédiée fait foi.

| Phase | Travail regroupé | Livrable / blocage |
| --- | --- | --- |
| 0 | Conception, inventaire des endpoints, spécifications DB et menaces | Document validé, aucun changement VPS |
| 1 | Migrations DB, repository, Argon2id, service CLI natif, sauvegarde/restauration, tests | Comptes administrables sur une DB de test isolée |
| 2 | Sessions serveur, login/logout/lock/unlock, retrait bypass, Core + Gateway + Router RBAC, tests IDOR/CSRF | Aucun accès non authentifié ni escalade |
| 3 | UI login, protections front, auto-lock, IA-TB CLI users, tests UI + Node/Docker | Parcours des 3 rôles validés |
| 4 | Packaging DEBUG 2.1, sauvegarde GEN-1, déploiement isolé, migrations et ADMIN créé via CLI ; rollback testé | HTTP privé/tunnel SSH seulement |
| 5 | Test d'exposition négative, TLS gratuit via proxy ACME, ouverture Gateway HTTPS public si tous contrôles réussissent | Publication conditionnelle validée |
| FUTUR | Gestionnaire de certificats depuis Admin ; wallets après Supervisor Engine | Roadmap séparée |

**Étape immédiate :** figer le contrat de sécurité, vérifier précisément les chemins persistants et les dépendances Node 22, établir les tests d'acceptation. Aucun secret, wallet ni compte de production ne doit être lu, copié ou effacé maintenant.
