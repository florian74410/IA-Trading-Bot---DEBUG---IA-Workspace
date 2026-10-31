# IA-TB DEBUG 2.1 — Authentication & User Security

**Statut :** Phase 1 clôturée en conception ; **Phase 2 OUVERTE — P2.1 validé sur fixtures, P2.2 et intégration comptes/sessions/Argon2id non clos** sur branche de conception. [Revue de fin d'avancement et preuves](AUTH_DEBUG_2.1_PHASE2_IMPLEMENTATION_REVIEW.md). Aucun nouveau Docker DEBUG sur GEN-1.  
**Dépôt cible :** `IA-Trading-Bot` — branche de conception `feature/debug-2.1-auth-design`, future intégration dans DEBUG 2.1.  
**CLI compagnon :** `IA-TB-CLI` (commande `iatb` sur Macro).  
**Objectif :** Authentification multiutilisateur native, isolation des données et privilèges, administration des comptes en SSH/CLI, puis ouverture réseau après validation de sécurité.
**VERROU DE DÉPLOIEMENT APPROUVÉ PAR OVERFLOW (14/10/2026) :** **NE PUBLIER NI DÉPLOYER AUCUN NOUVEAU DOCKER DEBUG SUR GEN-1 TANT QUE L'ENSEMBLE D'AUTH 2.1 N'EST PAS IMPLÉMENTÉ, INTÉGRÉ, TESTÉ ET EXPLICITEMENT VALIDÉ PAR OVERFLOW.** Cela inclut stockage, sessions, RBAC, protection de la matrice, isolation entre conteneurs, tests d'intrusion, sauvegarde/rollback et performance. Des commits sur branche de conception et des tests CI sur fixtures sont autorisés ; **aucune migration, redémarrage ni publication de ports VPS autorisée** par ce plan.  
**Règle de suivi :** une case est cochée `[x]` uniquement après réalisation, tests et confirmation du retour attendu ; un commit ne suffit pas à valider un développement. Cette fiche est la checklist de référence.
**Règle RBAC post-P1.7 et revue d'intégrité :** toute mise à jour ajoutant une fonctionnalité doit déclarer permission/scope, ownership, effet métier, rôles, points d'application et tests ; une route/action absente du registre est **refusée**. La [politique de changement RBAC](../Security/AUTH_DEBUG_2.1_RBAC_CHANGE_POLICY.md), la checklist de PR et le contrôle CI statique sont présents ; le [workflow GitHub Actions](https://github.com/florian74410/IA-Trading-Bot/actions/runs/38494625230) a réussi (128 routes explicites + 77 actions, auto-tests négatifs). **Encore requis** : activer le statut GitHub de protection de branche, couvrir les routes dynamiques et réaliser les tests d'autorisation runtime. Le CI n'accorde aucune permission au programme à lui seul.
**Contrainte transverse dès P1.4 :** sécurité *ET* performance : isoler Argon2id et handshakes des chemins rapides, viser une régression p95 ≤ +5 % et p99 ≤ +10 % sur mesures comparables ; aucun affaiblissement Auth/ownership pour atteindre les seuils. Voir [plan de benchmark](../Security/AUTH_DEBUG_2.1_SECURITY_PERFORMANCE.md). Ces seuils sont des objectifs provisoires, pas des résultats mesurés.

---

### PHASE 1 — Architecture et contrat de sécurité

- [x] Valider le **modèle A**, les trois rôles ADMIN / USER / GUEST et la séparation DEBUG / RELEASE (décisions de conception confirmées).
- [x] Inspecter les composants existants de DEBUG 2.0 : Clients/SQLite, Core, ancien login, UI Gateway, permissions et association wallet/clientId (revue initiale Git).
- [x] **P1.3 — Inventorier les voies HTTP/WebSocket/CP1 et accès directs possibles.** Routes et canaux documentés, rapport GEN-1 confronté aux sources ; les contrôles complets d'exposition réseau restent à faire au jalon P1.4 / Phase 7. Voir `Documentation/Security/AUTH_ENDPOINT_AUDIT_v1.md §7`.
- [x] **P1.4 — Définir les frontières de confiance** navigateur → Gateway → Core → Router/Engines, la provenance des identités et les protections fail-closed ; inclure la revue des namespaces, adresses d'écoute, ports publiés, relais et configurations réseau avant exposition.
  - **Périmètre de la validation :** contrat de conception Gateway/Core/Router/Engines, refus par défaut et sécurité à faible latence approuvés en principe ; relevé GEN-1 du 14/10/2026 confirme 13 conteneurs avec zéro publication Docker et douze sockets IA-TB en loopback du namespace partagé. Voir [rapport réseau](../Security/AUTH_DEBUG_2.1_NETWORK_BOUNDARY_AUDIT.md), [contrat](AUTH_DEBUG_2.1_TRUST_BOUNDARIES.md), [plan de latence](../Security/AUTH_DEBUG_2.1_SECURITY_PERFORMANCE.md). **Les contrôles Auth/RBAC, secrets de service, benchmarks et pare-feu hébergeur restent à implémenter/vérifier avant exposition publique.**
- [x] **P1.5 — Confirmer SQLite, volumes Docker, accès OS et sauvegarde/restauration.** Inventaire et [contrat de reprise](AUTH_DEBUG_2.1_BACKUP_RESTORE_CONTRACT.md) approuvés par Overflow le 14/10/2026 ; [audit réel GEN-1](../Security/AUTH_DEBUG_2.1_STORAGE_AUDIT.md) réconcilié (13 conteneurs même UID 1001, cinq montages RW, clés client/CP1 présentes, clé wallet absente). **Conserver l'existant fonctionnel ; corriger progressivement l'isolation interservices avec tests et rollback. Wallets et clé wallet gelés (ni création, ni migration, ni manipulation) dans ce chantier.** Les sauvegardes réelles, changements de droits/volumes et tests de restauration restent aux phases d'implémentation autorisées ; aucune mutation GEN-1/Contabo.
- [x] **P1.6 — Versionner indépendamment `auth_schema_version`, `auth_protocol_version`, `permissions_version`** : contrat, compatibilité CP/1, migration et rollback approuvés par Overflow le 14/10/2026. Voir [`AUTH_DEBUG_2.1_VERSION_COMPATIBILITY.md`](AUTH_DEBUG_2.1_VERSION_COMPATIBILITY.md) et [`manifest JSON de conception`](AUTH_DEBUG_2.1_VERSION_MANIFEST_PROPOSAL.json) **non actif**. La cryptographie définitive et tous les tests d'implémentation restent à réaliser ; aucune migration GEN-1.
- [x] **P1.7 — Matrice RBAC détaillée et ownership `clientId` validés par Overflow (14/10/2026).** [Contrat des rôles](AUTH_DEBUG_2.1_RBAC_CONTRACT.md), [212 routes et 77 actions classées](AUTH_DEBUG_2.1_RBAC_MATRIX_PROPOSAL.json) et [48 tests négatifs prévus](../Security/AUTH_DEBUG_2.1_RBAC_NEGATIVE_TEST_PLAN.md). **Nouvelle exigence durable : toute nouvelle fonctionnalité, route ou action doit déclarer sa classe de données, les rôles autorisés, l'ownership, les effets et les tests ; inconnue = refus.** Moteur RBAC et tests réels encore à implémenter, Wallet gelé.
- [x] **P1.8 — Décision de périmètre : PAS d'export/import automatique DEBUG ↔ RELEASE.** Overflow juge cette fonctionnalité inutile au stade 2.x : la première RELEASE aura seulement un compte ADMIN **créé manuellement par la CLI native et indépendant de DEBUG**, ou une reprise administrative ultérieure explicitement approuvée. Une éventuelle migration de `clients.sqlite` à l'occasion d'une version majeure 3.x sera une **opération manuelle séparée**, sauvegardée, testée et autorisée à ce moment-là. **Aucune donnée métier, clé, wallet, session, permission ni arborescence ne sera migrée par Auth 2.1.** [Proposition précédente archivée et abandonnée](AUTH_DEBUG_2.1_ACCOUNT_PORTABILITY_CONTRACT.md).
- [x] **Périmètre Wallet gelé par décision d'Overflow (14/10/2026)** : aucune génération, rotation, migration, lecture de secret, restauration, suppression ou conversion de clé wallet dans DEBUG 2.1 Auth ; préserver les références et données historiques à l'identique. Architecture Wallet future à étudier dans un chantier séparé, hors P1.6.

**Validation :** P1.1–P1.8 clôturés comme décisions de conception, dont P1.8 supprimé du scope (pas une fonctionnalité livrée). Le chantier Wallet est gelé ; démarrage Phase 2 uniquement sur fixtures/DB factices et copies isolées, aucune modification de données/ports GEN-1.

**Décision de sécurité RBAC supplémentaire (14/10/2026) :** [intégrité de la politique et de la matrice](../Security/AUTH_DEBUG_2.1_RBAC_POLICY_INTEGRITY.md) : revue CODEOWNERS, contrôles CI anti-élévation GUEST, politique immuable/signée au déploiement et fail-closed avant activation. Le JSON documentaire ne donne jamais les permissions effectives.

### PHASE 2 — Stockage et comptes utilisateurs

**Bilan vérifié du lot intégré (14/10/2026) : 6/9 critères clôturés sur leur périmètre décrit ; 3 restent ouverts.** Le paquet npm `argon2@0.45.1` et le lockfile ont été synchronisés sous Node.js 22 ; `npm ci` et le module natif ont été testés par GitHub Actions. Le script de synchronisation ponctuel a été supprimé après réussite. `App/Tools/CLI/iatb-users.js` fournit une CLI **exclusivement sur fixtures DEBUG synthétiques**, sans password/jeton dans argv : `migrate-v3`, `create-first-admin`, `review-debug`, gestion ADMIN. Validation par UID OS non-root, TTY et propriétaire des fichiers 0600 ; consentement manuel et sauvegarde obligatoires. Le Core Auth 2.1 ne s'active qu'en DEBUG isolé ; **aucune migration, login, compte ou update réel n'a été appliqué**. [CI de validation finale : 309/309 tests réussis](https://github.com/florian74410/IA-Trading-Bot/actions/runs/38567253653), dont vérification `npm ci`. Les tests complets inter-Engines restent programmés pour la Phase 6 ; aucun déploiement GEN-1 ni merge n'a été réalisé.

- [x] **P2.1 — Préflight et sauvegarde/restauration SQLite cohérente sur fixtures isolées : VALIDÉ.** [Rapport de clôture](AUTH_DEBUG_2.1_P21_FIXTURE_VALIDATION_REPORT.md) : **26/26 tests GitHub Actions réussis** ([run P2.1](https://github.com/florian74410/IA-Trading-Bot/actions/runs/38501734180)) + [RBAC SUCCESS](https://github.com/florian74410/IA-Trading-Bot/actions/runs/38501734170). Code : [préflight sans effet de bord](../../Tools/CI/auth_storage_preflight.py), [tests DB fictives](../../Tools/CI/test_auth_storage_preflight.py), [bundle AES-256-GCM authentifié réservé aux fixtures](../../Tools/CI/fixture_aead_bundle.js). WAL/DELETE, identité chiffrée fictive, crash/bypass `flock`, restauration après archive chiffrée, refus mauvaise clé/archive altérée : vérifiés. **Validation limitée aux fixtures ; aucune DB réelle ni Wallet utilisé, aucune intervention GEN-1.**
- [ ] **P2.2 — Inventaire exhaustif des écrivains et coordination de sauvegarde interservices sur banc isolé : OUVERT.** [Contrat et critères bloquants](AUTH_DEBUG_2.1_PHASE2_WRITER_COORDINATION.md) : écrire un protocole `PREPARE/QUIESCED/RELEASE/ABORT` et le tester sur tous les vrais chemins critiques (SQLite, JSONL, Annexes, startup/migrations/rétention), y compris writer non coopératif, crash/restart, snapshot chiffré **réellement** restaurable sur copies autorisées, contrôle de clé originale, performances p95/p99 et rollback. **P2.1 ne satisfait pas ces garanties ; P2.2 conditionne toute migration/déploiement.**
  - **Arbitrage Overflow du 14/10/2026 — simplicité et calendrier :** privilégier **un coordinateur léger dans Core**, réutilisant les services et mécanismes existants (registre minimal, ACK/timeout et reprise), **sans ajouter de microservice, de bus d'événements ni de couche d'abstraction générale**. Pendant l'implémentation, réaliser les tests unitaires et sur fixtures propres à chaque composant ; **reporter la campagne complète de sécurité/cohérence entre Engines à la fin du développement Auth 2.1 (Phase 6, puis validation sur banc isolé avant la Phase 7)**. Les critères P2.2 restent obligatoires pour la validation finale : ne pas cocher P2.2 comme « validé » avant les tests interservices, ne pas migrer de données réelles ni déployer sur GEN-1. Cet arbitrage change l'ordonnancement, pas les garanties de sécurité.
  - **Progression P2.2 (14/10/2026) :** gardes facultatives `snapshotGate` sur Clients, Settings, Portfolio, Fundamental, MarketData Registry/Telemetry/Microstructure, Financial/Trading/Usage JSONL et **Mosaics Annexes** (création, remplacement atomique et suppression). Le coordinateur local possède allowlist, epochs, ACK et abort ; **aucune garde n'est injectée dans les services actifs**. Vérifications ciblées : **81/81 tests Node.js réussis** (67 précédents + 8 Mosaic + 6 protection clé client), plus **10/10 tests SQLite Python** de la proposition v3 **non active**, [CI GitHub Actions SUCCESS](https://github.com/florian74410/IA-Trading-Bot/actions/runs/38509073888), [P2.1 SUCCESS](https://github.com/florian74410/IA-Trading-Bot/actions/runs/38509073847) et [RBAC SUCCESS](https://github.com/florian74410/IA-Trading-Bot/actions/runs/38509073901). La migration SQL v3 proposée n'est **pas** dans le répertoire de migrations actif. Restent notamment : `paths.js` à l'import, scripts/Annexes hors Mosaics, activation contrôlée, zéro perte d'événement accepté, coordination et restauration interservices, benchs p95/p99. **P2.2 et la Phase 2 restent OUVERTS** conformément aux critères de clôture et à l'arbitrage de tests globaux Phase 6. [Revue de réalisation et critères bloquants](AUTH_DEBUG_2.1_PHASE2_IMPLEMENTATION_REVIEW.md). Aucune donnée réelle ni GEN-1 modifiés.
  - **Nouvelle avancée (14/10/2026) — bundle chiffré client :** `App/Tools/CI/auth21_encrypted_snapshot_trial.js` produit une image SQLite **en mémoire** (WAL inclus), après ACK `PREPARE/QUIESCED` du seul writer fictif `clients`, et prouve la compatibilité de la clé maître originale avant chiffrement. Archive AES-256-GCM avec **clé transport distincte**, restauration en scratch privé, déchiffrement des identités AES-256-GCM + vérification HMAC, refus des clés/ciphertexts incompatibles même sous une archive AEAD valide, rollback du staging sur erreur. **[20/20 tests natifs SUCCESS](https://github.com/florian74410/IA-Trading-Bot/actions/runs/38538904645)** ; campagne P2.2 **212/212 Node + 15/15 SQLite Python = 227/227 tests réussis**. **Outil réservé aux fixtures**, pas de coordination effective des autres Engines, pas d'injection dans les services, aucune archive client réelle ni déploiement ; **P2.2 reste [ ]** et ses tests multi-Engines/performances se feront en Phase 6. [Rapport détaillé](AUTH_DEBUG_2.1_ENCRYPTED_CLIENT_SNAPSHOT_TRIAL.md).
  - **Lot regroupé P2.2 — Clients + Settings + Portfolio + Annexes (14/10/2026) :** `App/Tools/CI/auth21_multi_resource_snapshot_trial.js` s'appuie sur **un seul** `SnapshotCoordinator`, avec **4 participants de fixture** devant tous acquitter `PREPARE/QUIESCED`, 3 DB SQLite natives en mémoire (WAL inclus), 2 annexes en liste blanche, clé maître client originalement compatible, archive AES-256-GCM à clé de transport distincte, **manifeste authentifié** (epoch/tailles/SHA-256), publication atomique sans écraser une archive existante, restauration des DB normalisées `DELETE` sur les copies, preuve AES-GCM/HMAC des clients et **rollback du staging si corruption ou incompatibilité**. **[20/20 tests ciblés SUCCESS](https://github.com/florian74410/IA-Trading-Bot/actions/runs/38542293574)** ; campagne P2.2 **232/232 Node.js + 15/15 Python = 247/247 tests réussis**. Les schémas Settings/Portfolio et annexes sont **synthétiques**, les writers ne sont **pas** les services actifs, et aucune cohérence inter-Engines n'est revendiquée. [Rapport multi-ressources](AUTH_DEBUG_2.1_MULTI_RESOURCE_ENCRYPTED_SNAPSHOT_TRIAL.md). **P2.2 reste [ ] jusqu'à la Phase 6**.
  - **Lot regroupé (14/10/2026) — startup et inventaire :** `App/Core/Shared/paths.js` possède désormais **un mode de préflight `IATB_PATHS_PREFLIGHT_READONLY=1` qui interdit tout effet de bord à l'import et toute initialisation explicite de répertoires/clés** ; le mode **normal du runtime reste inchangé** (créations historiques encore présentes). `App/Tools/CI/auth21_writer_inventory.js` vérifie sans importer les stores la présence de marqueurs `snapshotGate`/`assertWritable` chez **12 propriétaires de SQLite, JSONL et Annexes** ; cette vérification **n'est ni exhaustive ni une preuve d'injection des gardes en runtime**. **[14/14 tests dédiés et 261/261 tests P2.2 SUCCESS](https://github.com/florian74410/IA-Trading-Bot/actions/runs/38544638762)** (246 Node + 15 Python). Les imports directs de `paths.js`, writes d'autres scripts et gardes réelles restent à traiter et à valider lors des étapes prévues ; **P2.2 reste [ ]**. [Rapport startup/writers](AUTH_DEBUG_2.1_STARTUP_PREFLIGHT_WRITER_INVENTORY.md).
  - **Lot regroupé — raccordement Core-local et gardes de clé (14/10/2026) :** un nouvel `auth21_core_local_trial_wiring.js` crée quatre `LocalSnapshotWriter` (`clients`, `settings`, `mosaics`, `annex-root`) et **un seul** coordinateur. `server.js` les injecte effectivement dans les constructeurs Core **uniquement** lorsque `IATB_AUTH21_LOCAL_SNAPSHOT_TRIAL=1`, en DEBUG, sous un répertoire temporaire fermé `iatb-auth21-core-runtime-*` et avec marqueur validé **avant tout import de `paths.js`**. `ClientCrypto` refuse désormais aussi de créer/chmod sa clé maître si son garde optionnel est en gel. Pas de mode de sauvegarde exposé en HTTP. **[13/13 tests de raccordement Core + 3/3 tests supplémentaires de clé réussis, 277/277 tests P2.2 SUCCESS](https://github.com/florian74410/IA-Trading-Bot/actions/runs/38555718984)** (262 Node + 15 Python). Le serveur complet n'est pas démarré par cette suite, les autres Engines ne partagent pas ce coordinateur et le comportement du serveur normal demeure inchangé : **pas de couverture runtime interprocessus revendiquée, P2.2 reste [ ]**. [Rapport Core-local](AUTH_DEBUG_2.1_CORE_LOCAL_TRIAL_INJECTION.md).
  - **Complément Updates / rétention (14/10/2026) :** pendant le **mode d'essai Core-local seulement**, `UpdateManager` et `AIUpdateBuilder` reçoivent `readOnlyTrial` : pas de création d'archives ni de dossiers au démarrage, aucun upload/download/install, aucun nettoyage de prévisualisation/rétention ; même `installAIUpdate` refuse avant copie. Testé **sur sous-processus et dossiers fictifs**, y compris le fonctionnement normal inchangé hors mode d'essai. **[7/7 nouveaux tests réussis, campagne P2.2 284/284 SUCCESS](https://github.com/florian74410/IA-Trading-Bot/actions/runs/38556607421)** (269 Node + 15 SQLite Python). Aucun contrôle équivalent démontré sur les scripts shell ou les Engines indépendants ; **P2.2 reste [ ]**. [Rapport consolidé](AUTH_DEBUG_2.1_CORE_LOCAL_TRIAL_INJECTION.md).
- [x] Définir et tester les migrations SQLite transactionnelles sur fixtures, sans suppression des données métier, des liens client/wallet ni des clés. **VALIDÉ pour le périmètre offline v2→v3** (backup et contrôle avant/après). Migration réelle interdite avant P2.2/Phase 6.
  - **Avancement (14/10/2026) :** `Core/Clients/auth21_proposed_migrations/003_auth21_schema_v3.sql` définit sessions/révocation, préférences `clientId`, audit et dernier ADMIN. Nouveau **prototype fixture-only** de backup + application transactionnelle du SQL v3 avec rollback (`App/Tools/CI/auth21_v3_migration_trial.js`) et de conversion PBKDF2 → Argon2id **après preuve du mot de passe**, par CAS atomique + audit (`auth21_credential_upgrade_trial.js`). **15/15 tests SQL Python réussis**, [P2.2 CI](https://github.com/florian74410/IA-Trading-Bot/actions/runs/38524995360). **16/16 tests Node natifs réussis après correction d'un nom de colonne dans le test** (exécution réelle par Overflow : 15/16 initialement sous Node 18 ; correction `passwordHash` → `password_hash` puis **CI Node 22 : 16/16 SUCCESS**). Ils sont désormais exécutés par le workflow P2.2, avec les 81 tests Node préexistants et 15 tests Python SQLite : **[97/97 Node + 15/15 Python SUCCESS](https://github.com/florian74410/IA-Trading-Bot/actions/runs/38529194438)**.  **Ni la migration v3 ni le CAS ne sont intégrés au runtime.** [Rapport et limites](AUTH_DEBUG_2.1_SQLITE_V3_MIGRATION_TRIAL.md).
- [ ] Intégrer **Argon2id** avec dépendance compatible Node 22 et paramètres calibrés pour GEN-1.
  - **Avancement (14/10/2026) :** module isolé `Core/Clients/password_hasher_v2.js` avec Argon2id natif asynchrone (`argon2@0.45.1` installé seulement dans CI) et contrôle borné des paramètres PHC ; **[11/11 tests réels Node 22 SUCCESS](https://github.com/florian74410/IA-Trading-Bot/actions/runs/38521734959)**. Pas de dépendance ajoutée au `App/package-lock.json`, aucun login runtime modifié, calibrage GEN-1 et intégration à faire. [Protocole KDF](AUTH_DEBUG_2.1_PASSWORD_KDF_TRANSITION.md).
- [x] Conserver provisoirement la vérification des anciens hash PBKDF2 pour une migration contrôlée vers Argon2id ; aucune réinitialisation automatique des identités. **VALIDÉ** dans `password_hasher_v2` et par test HTTP avec SQLite v3 réelle sur fixture.
  - **Avancement :** le vérificateur asynchrone reconnaît PBKDF2 et retourne `needsUpgrade` **sans écriture**. Un CAS SQL isolé est maintenant préparé et 15 fixtures Python de schéma/SQL sont réussies ; **16/16 tests natifs CAS Node 22 réussis et également 16/16 confirmés par Overflow sur Macro ; intégration login et conflits interservices restent non validés**. Aucun fallback PBKDF2 n'est autorisé sur enregistrement Argon2id.
- [x] Mettre en place les tables/champs de sessions, révocations, audit et préférences personnelles isolées par `clientId`. **Validé sur SQLite v3 isolée** : sessions et préférences chiffrées persistantes après redémarrage, révocation et isolation `clientId` testées. Intégration globale Core/Engines à vérifier en phases 3/4/6.
  - **Avancement validé sur fixtures Node 22 (14/10/2026) :** `App/Core/Clients/auth21_session_store.js` (opt-in, non activé) émet des jetons opaques après vérification réelle du mot de passe, n'enregistre en SQLite que leurs SHA-256, impose expiration absolue, révocation simple/globale et préférences AES-256-GCM isolées par `clientId` de session. GUEST en lecture seule. Le SQL v3 proposé révoque les sessions et incrémente `security_version` après changement de rôle, mot de passe ou état client. **[23/23 nouveaux tests Node réussis](https://github.com/florian74410/IA-Trading-Bot/actions/runs/38531347902)** ; campagne globale P2.2 **120/120 tests Node + 15/15 tests SQLite Python SUCCESS**. Le module refuse l'authentification si les triggers de révocation essentiels manquent. Aucun login, cookie, AutoLock ou moteur runtime n'est branché ; case maintenue `[ ]` avant intégration et validations Phase 3/6. [Rapport sessions](AUTH_DEBUG_2.1_SESSIONS_AND_PREFERENCES.md).
- [x] Empêcher la création silencieuse d'une nouvelle clé maître lorsque l'ancienne est manquante ou illisible en présence de données existantes. **VALIDÉ dans ClientCrypto** : refus sur clé absente/malformée en présence de `clients.sqlite` ou des fichiers `-wal/-shm/-journal`, lecture hex stricte et tests de non-régénération. La validation de restauration interservices reste suivie en P2.2/Phase 6.
  - **Avancement renforcé (14/10/2026) :** `ClientCrypto` refuse de régénérer `client_master.key` en présence de `clients.sqlite` ou sidecars `-wal/-shm/-journal`. Lecture de clé désormais **strictement 64 caractères hex** sans troncature silencieuse. Nouveau `App/Tools/CI/auth21_key_restore_trial.js` : sauvegarde SQLite online compatible WAL, clé maître fictive copiée dans dossier temporaire fermé, restauration séparée, déchiffrement AES-256-GCM de vrais champs clients et validation HMAC (`email_hash`/`username_hash`), comparaisons de toutes les tables et des liens Wallet ; refus clé valide mais erronée, absente, tronquée, AEAD/index altérés, permission de clé dangereuse et symlinks directs/indirects. **[22/22 tests clés/restauration Node 22 SUCCESS](https://github.com/florian74410/IA-Trading-Bot/actions/runs/38536276833)** ; campagne CI P2.2 **192/192 Node + 15/15 SQLite Python = 207/207 SUCCESS**. **Outil réservé aux bases synthétiques**, copies de clé non chiffrées interdites avec données réelles ; sauvegarde authentifiée de DB + clé maître originale, restauration sur copie autorisée, coordination interservices et preuve de compatibilité GEN-1 restent nécessaires. Case `[ ]` conservée. [Rapport clé/restauration](AUTH_DEBUG_2.1_CLIENT_KEY_RECOVERY.md).
- [x] Préparer la réinitialisation **des seuls anciens comptes de connexion DEBUG**, avec sauvegarde et autorisation explicite, sans perdre les données/wallets liés. **Préparation validée** : provenance DEBUG vérifiée, sélection individuelle, backup et suppression du seul login sur fixtures ; aucune suppression automatique réelle.
  - **Avancement (14/10/2026) :** `App/Core/Clients/auth21_first_admin_trial.js` permet un **inventaire DEBUG strictement en lecture seule** (provenance `debug-user:` vérifiée par HMAC et clé fictive, classification explicite des anciens `SUPERADMIN` non prouvés) et une **simulation sur fixture** du retrait individuel d'un ancien login DEBUG : confirmation `clientId` obligatoire, ADMIN et autorisation locale, nouvelle sauvegarde SQLite, revalidation transactionnelle de l'identité et des empreintes, audit atomique, conservation de `clients` et `client_wallets`. **Aucun compte DEBUG réel réinitialisé ou supprimé** ; l'ancienne logique de bootstrap DEBUG reste active sur le runtime courant, donc la procédure réelle est **INTERDITE** avant désactivation du bypass, CLI sécurisée, sauvegarde chiffrée et autorisation explicite. [26/26 tests du parcours SUCCESS](https://github.com/florian74410/IA-Trading-Bot/actions/runs/38534762053) ; [dossier de transition](AUTH_DEBUG_2.1_FIRST_ADMIN_DEBUG_TRANSITION.md). Case `[ ]` conservée.
- [ ] Garantir la persistance d'un compte ADMIN à travers les mises à jour et interdire la suppression/rétrogradation du dernier ADMIN actif.
  - **Avancement (14/10/2026) :** `App/Core/Clients/auth21_admin_store.js` gère **uniquement des comptes existants** avec double barrière session ADMIN + autorisation d'opérateur local (future CLI SSH, non branchée). Opérations rôle, activation, statut, retrait du login sans supprimer client/wallet et reset Argon2id conditionnel sont atomiques/auditées. Les **6 triggers SQL v3 de protection du dernier ADMIN**, dont **2 anti-`INSERT OR REPLACE`**, sont exigés avant utilisation ; les triggers de révocation invalident les sessions modifiées. **[24/24 tests ADMIN natifs SUCCESS](https://github.com/florian74410/IA-Trading-Bot/actions/runs/38532488254)** (159/159 tests CI P2.2, dont 144 Node + 15 Python). Le test de fermeture/réouverture SQLite confirme la persistance, mais **simulation de création du premier ADMIN sur SQLite fictive** ajoutée : nouvelle identité, identité existante sans login ou conversion explicite d'un `SUPERADMIN` sélectionné, Argon2id, double accord manuel/local, backup SQLite préalable, vérification atomique (y compris version, profil et mot de passe), persistance testée par login. **26/26 tests supplémentaires de transition**, campagne [185/185 tests SUCCESS](https://github.com/florian74410/IA-Trading-Bot/actions/runs/38534762053) (170 Node + 15 SQLite Python). **Vraie CLI locale/SSH, vérification opérateur OS, intégration et mise à jour du build NON réalisées** ; case `[ ]` maintenue. [Rapport](AUTH_DEBUG_2.1_ADMIN_PERSISTENCE.md).

**Validation :** migrations et rollback sur copie isolée, contrôles d'intégrité, cohérence des associations et essais de restauration réussis. Aucun effacement réel avant approbation.

### PHASE 3 — Authentification et sécurité serveur
**Cookies navigateur / CSRF (branche DEBUG, 14/10/2026) :** ajout de `auth21_browser_cookie.js` et d'un mode **explicitement opt-in** de `auth21_http_boundary.js`. Cookie `__Host-iatb21` (`Secure`, `HttpOnly`, `SameSite=Strict`, `Path=/`), jeton CSRF dérivé d'un HMAC avec clé serveur >=32 octets ; toutes les mutations authentifiées exigent `X-IATB-CSRF`, TLS réellement chiffré et origine HTTPS exacte. Le jeton de session n'est pas transmis dans le corps JSON en mode navigateur. Vérifié par [CI 317/317 SUCCESS](https://github.com/florian74410/IA-Trading-Bot/actions/runs/38574193227), dont refus logout sans CSRF et logout réussi avec CSRF. **Important : le mode navigateur n'est pas encore branché à `openCoreAuthTrial` ni aux pages Web**, et le RBAC sur toutes les routes historiques/Router/Engines n'est pas terminé ; Phases 3/4 restent ouvertes. Aucun déploiement ou update intégré.

**Durcissement des requêtes navigateur — 14/10/2026 :** `auth21_http_boundary.js` refuse maintenant tout en-tête `Origin` absent de l'allowlist exacte `allowedBrowserOrigin` (par défaut aucun Origin autorisé), avant toute vérification du mot de passe ; ajoute `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer` et CSP `default-src 'none'; frame-ancestors 'none'`, tout en conservant `no-store`/`nosniff`. [CI 316/316 SUCCESS](https://github.com/florian74410/IA-Trading-Bot/actions/runs/38573372139) ; un test vérifie l'origine interdite, celle explicitement autorisée, les en-têtes et le refus en configuration par défaut. **Pas de cookie HttpOnly ni de CSRF synchronisé implémentés** ; le Core DEBUG isolé n'autorise encore aucune origine navigateur par défaut. Éviter de considérer Phase 3/4 comme terminées. Aucun update ni déploiement.

**Sécurité Auth21 isolée — 14/10/2026 :** verrouillage d'inactivité à 300 secondes avec déverrouillage par mot de passe, et limitation locale des tentatives de login et de déverrouillage (5 échecs par fenêtre de 5 minutes, stockage mémoire borné). Tests de refus HTTP ajoutés. **Protection non distribuée** : les compteurs sont réinitialisés après redémarrage, les cookies sécurisés/CSRF et la protection Gateway restent ouverts. Phases 3/4 non clôturées ; aucune intégration de l'update ni déploiement GEN-1.

**AutoLock DEBUG isolé — 14/10/2026 :** `Auth21SessionStore` utilise maintenant le champ SQLite `last_seen_at` pour enregistrer l'activité explicite, avec **verrouillage opt-in à 300 secondes**, non prolongé par les lectures/polling ; `/auth21/activity` refuse un jeton verrouillé et `/auth21/unlock` exige la vérification du mot de passe d'origine, tout en refusant jeton révoqué/expiré. Le Core DEBUG isolé fixe le seuil à 300 secondes ; ni le runtime normal ni le navigateur n'utilisent encore ces API. [CI **313/313 tests réussis**](https://github.com/florian74410/IA-Trading-Bot/actions/runs/38571000546), dont tests natifs SQLite, verrouillage à la seconde 300, mot de passe faux/valide, activity non autorisée et charge utile falsifiée. Le contrat d'activité utilisateur réellement fiable côté UI, cookies HttpOnly/SameSite/Secure, CSRF, anti-bruteforce, Gateway/Router/Engines restent à intégrer. **Ne pas clôturer Phase 3/4 ni commencer l'update.**

**Première intégration Phase 3/4 — 14/10/2026 :** le Core isolé expose maintenant `GET/PUT/DELETE /auth21/preferences?scope=...&key=...` avec vérification de session à chaque demande ; l'identité `clientId` vient exclusivement du jeton signé côté serveur, jamais du navigateur. GUEST ne peut écrire ni supprimer ; payload `clientId` ou paramètres de propriété ajoutés refusés ; les routes legacy restent interdites dans ce mode. **[311/311 tests P2.2 réussis](https://github.com/florian74410/IA-Trading-Bot/actions/runs/38569782467)** ; workflows RBAC et P2.1 également SUCCESS. Cette première API de préférences est limitée à la DB fictive en Core DEBUG isolé, n'applique pas encore le RBAC à toutes les routes Gateway/Router/Engines, ni AutoLock/cookies/CSRF/anti-bruteforce ; **Phases 3 et 4 restent ouvertes**. Aucune intégration d'update ou migration GEN-1.


- [ ] Supprimer les bypass de l'ancien système en mode authentifié et neutraliser `/api/setup`, inscription/recovery publiques non prévues en DEBUG 2.1.
- [ ] Implémenter login, logout, lock, unlock avec compte actif, mot de passe valide et sessions créées/révoquées côté serveur.
- [ ] Intégrer cookies opaques `HttpOnly`, `SameSite`, `Secure` sous HTTPS ; expiration absolue, rotation et protections CSRF.
- [ ] Mettre en place un **AutoLock après 5 minutes d'inactivité utilisateur**, sans prolongation par les rafraîchissements automatiques de données.
- [ ] Exiger la **ressaisie du mot de passe** pour déverrouiller ; bloquer les API tant que la session est verrouillée, même si l'écran de verrouillage est contourné.
- [ ] Ajouter limitation des tentatives, délais progressifs, messages d'erreur non révélateurs et journalisation sans mot de passe/token.
- [ ] Révoquer immédiatement les sessions après désactivation, changement de rôle, rotation du mot de passe ou incident de sécurité.
- [ ] Protéger toutes les pages, APIs, canaux Router/Engines et données sensibles côté serveur ; seuls login et ressources publiques explicitement autorisées restent anonymes.
- [ ] Empêcher l'usurpation de `clientId` ou du rôle par cookies forgés, paramètres ou en-têtes HTTP fournis par le navigateur.
- [ ] Tester les refus 401/403 et le comportement fail-closed en cas de panne DB/Auth/Core.

**Validation :** authentification et verrouillage réellement vérifiés côté serveur ; suite de tests de sécurité et de contournement réussie.

**Avancée intégration RBAC (14/10/2026) :** ajout d'un garde commun `auth21_rbac_guard.js` à refus par défaut, contrôle du rôle, de la méthode et de la propriété exacte `clientId` même pour ADMIN. Le garde est utilisé pour les modifications de préférences sur le Core DEBUG isolé. La passerelle `createIsolatedCoreGate` peut désormais recevoir explicitement le mode navigateur cookie sécurisé, sans l'activer sur le serveur HTTP normal. Tests négatifs ajoutés (rôle forgé, rôle GUEST, accès inter-clients, routes inconnues, usurpation de méthodes). **Les véritables routes Gateway/Router/Engine restent hors du branchement et ne sont pas déclarées sécurisées.** CI : https://github.com/florian74410/IA-Trading-Bot/actions/runs/38618893982. Aucun merge, update réel ou déploiement.

**Raccordement concret aux serveurs HTTP — 14/10/2026 :** `auth21_service_boundary.js` est désormais appelé **dans les véritables points d'entrée** `UI/Gateway/ui_service.js`, `Core/Router/router.js`, `services/trading-engine/trading_service.js`, `Risk/Engine/risk_service.js` et `Portfolio/Engine/portfolio_service.js`. Ce garde est **strictement activé par les trois drapeaux DEBUG Auth21** (`IATB_AUTH21_CORE_AUTH_TRIAL`, `IATB_AUTH21_LOCAL_SNAPSHOT_TRIAL`, `IATB_DEBUG_MODE` à `1`) : en mode isolé le Gateway ne proxifie que les chemins Auth21 explicites vers le Core, tandis que les autres chemins historiques, les canaux CP/1 Router et les HTTP directs des trois Engines sont rejetés. Le RBAC `ADMIN/USER/GUEST` sur les routes métiers normales **n'est pas encore intégré** ; leur blocage est provisoire et doit être remplacé par des contrôles opérationnels avant la Phase 4. Tests de comportement et vérification d'instrumentation des cinq vrais fichiers : [CI 329/329 SUCCESS](https://github.com/florian74410/IA-Trading-Bot/actions/runs/38620568414). Aucun flag activé en production, aucune base réelle modifiée, aucun merge ou update intégré.

**Lot sécurité Gateway 14/10/2026 :** le garde `auth21_service_boundary.js` vérifie désormais **la méthode HTTP exacte en plus du chemin autorisé** ; `/auth21/login` et `/auth21/unlock` ne sont accessibles qu'en POST, `/auth21/me` en GET, `/auth21/preferences` en GET/PUT/DELETE, sans transmission vers Core des combinaisons illégitimes. Le Router et les Engines restent strictement fermés en mode Auth21 DEBUG isolé. [CI 330/330 tests réussis](https://github.com/florian74410/IA-Trading-Bot/actions/runs/38621117458). **Ce durcissement n'est pas une clôture Phase 4 :** l'autorisation métier effective des routes Gateway/Router/Engines nécessite une preuve d'identité entre processus et des tests bout en bout, sans faire confiance aux en-têtes du navigateur. Aucun déploiement ni migration réelle.

**Preuve interprocessus Auth21 (14/10/2026) :** `auth21_ipc_proof.js` introduit une capacité HMAC-SHA256 de courte durée (30 secondes), à audience et opération HTTP exactes, propriété client explicite, identifiant aléatoire et protection anti-rejeu bornée. `auth21_rbac_guard.js` expose `issueAuthorizedProof` qui exige une session Core valide et l'autorisation RBAC avant émission, puis `authorizeInterprocess` qui vérifie la signature, audience/méthode/propriété et le rôle avant décision. **[CI 335/335 SUCCESS](https://github.com/florian74410/IA-Trading-Bot/actions/runs/38622073175)** : refus usurpation, expiration, mauvais propriétaire, mauvais rôle, replay, échange d'audience, trading LIVE inconnu. **Cette primitive est testée mais PAS encore déployée comme mécanisme d'autorisation dans les processus Router/Engines.** Provisionnement sécurisé des secrets, propagation fiable et anti-rejeu mutualisé après redémarrage restent nécessaires. Les routes historiques restent bloquées en DEBUG isolé ; Phase 4 non clôturée, aucun déploiement GEN-1.

**Lots IPC DEBUG isolé — 14/10/2026 :** intégration d'un vérificateur réel `auth21_ipc_boundary.js` à preuve HMAC et RBAC ; clé partagée existante exclusivement depuis `userdata/Security/auth21_ipc.key` (32 octets, mode 0600, racine temporaire prévalidée, aucune génération automatique), plus `auth21_ipc_probe.js` monté dans le véritable `Core/Router/router.js` uniquement avec `IATB_AUTH21_IPC_PROBE_TRIAL=1` et les drapeaux DEBUG précédents. Une session Core valide peut émettre une **preuve limitée** `POST /auth21/ipc/probe-proof`, permettant seulement `GET /auth21/ipc/probe` pour confirmer la signature, la bonne audience et l'anti-rejeu. Rien ne donne accès aux données métier ou au Trading LIVE. [CI 343/343 SUCCESS](https://github.com/florian74410/IA-Trading-Bot/actions/runs/38624089037), incluant tests de confidentialité des fichiers, symlink, origine/owner/audience, code de route Router et négatifs. **Limites :** tests principalement in-process/fixtures, pas encore exercice de réseau multi-processus complet ni distribution opérationnelle des preuves vers les véritables commandes CP/1, intégration RBAC métier Gateway/Engines et anti-rejeu partagé; phase 4 toujours ouverte, sans mise à jour DEBUG ni déploiement GEN-1.

**Réseau interprocessus — banc DEBUG 14/10/2026 :** un test complémentaire lance un **processus Node indépendant** et vérifie qu'il accepte une preuve HMAC signée dans le processus parent avec la clé privée du dossier temporaire ; refus de l'absence de preuve et anti-rejeu déjà testés. [CI 344/344 SUCCESS](https://github.com/florian74410/IA-Trading-Bot/actions/runs/38624350649). Le Core isolé dispose de l'émission conditionnelle (`POST /auth21/ipc/probe-proof`) et le véritable Router d'une vérification conditionnelle (`GET /auth21/ipc/probe`). Il s'agit d'un **handshake de diagnostic uniquement** : pas encore de requête HTTP réseau de bout en bout ni de commande CP/1 métier autorisée, pas de préparation de clé multi-service en production, pas de persistance anti-rejeu inter-redémarrage. Routes métiers et Trading LIVE toujours bloqués ; Phase 4 ouverte.

**Validation IPC réseau réel — banc DEBUG isolé 14/10/2026 :** test complémentaire de bout en bout **HTTP localhost entre deux processus Node**. Le parent construit une preuve `router/shared.read/GET`, le second ouvre un serveur de vérification avec une clé 0600 sous racine temporaire, accepte une première requête (HTTP 200), refuse le rejeu (403) et la requête sans preuve (403). [CI 345/345 SUCCESS](https://github.com/florian74410/IA-Trading-Bot/actions/runs/38624639896). Cette validation ne lance pas tout IA-TB, ne fait pas circuler de véritables commandes CP/1 métier et ne couvre pas encore les autorisations effectives dans les Engines. **Phase 4 non terminée** ; tout reste sur feature DEBUG isolé, sans déploiement.

**Essai de capacité Router lecture seule — 14/10/2026 :** `auth21_ipc_probe.js` contient désormais un vérificateur signé `createRouterReadOnlyCapabilities`, qui retourne exclusivement une métadonnée `auth21.readonly` sans données métier et affiche `writes:false`, `tradingLive:false`. Test anti-rejeu et absence de permissions LIVE validé : [CI 346/346 SUCCESS](https://github.com/florian74410/IA-Trading-Bot/actions/runs/38625390198). **ATTENTION : l'écriture du raccordement de ce nouveau point d'entrée à `Core/Router/router.js` a été bloquée par les contrôles de sécurité ; cette route n'est PAS montée sur le serveur réel.** Ne pas affirmer que le RBAC métier Router/Engines est intégré. Phase 4 ouverte ; aucun déploiement.

**Déblocage raccordement Router — 14/10/2026 :** le point d'entrée `/auth21/ipc/capabilities`, accessible uniquement en mode Auth21 DEBUG isolé avec opt-in IPC explicite, est maintenant raccordé dans `Core/Router/router.js`. Il réclame une preuve HMAC valide à usage unique, limitée à la lecture de métadonnées de capacités (`auth21.readonly`), sans exécution métier ni Trading LIVE. Écriture auparavant refusée finalement acceptée au nouvel essai, commit `cd8c6f7`. [CI 346/346 SUCCESS](https://github.com/florian74410/IA-Trading-Bot/actions/runs/38632392131). Cela ne clôture pas le RBAC métier ni les tests HTTP sur le serveur Router complet.

### PHASE 4 — Privilèges et isolation métier

- [ ] ADMIN : accès complet aux fonctions applicatives, sans accès SSH/root/Docker par le navigateur.
- [ ] USER : utilisation de l'application et écriture dans **ses propres données**, hors page Admin et fonctions administratives.
- [ ] GUEST : consultation uniquement ; sélection du marché, timeframe et affichage des indicateurs **locaux**, sans écriture serveur ni ordre.
- [ ] Vérifier chaque opération côté Gateway **et Core/Router/Engine**, indépendamment des éléments masqués dans le frontend.
- [ ] Isoler préférences, stratégies, portefeuilles, historiques et références publiques de wallets par `clientId` ; refuser les accès croisés (IDOR).
- [ ] Interdire les effets de bord par requêtes GET, canaux de communication, WebSocket ou fonctionnalités de prévisualisation.
- [ ] Préparer les permissions granulaires pour afficher plus tard certains modules aux ADMIN uniquement.
- [ ] Maintenir le Trading Engine LIVE **désactivé** pour tous les rôles en DEBUG.

**Validation :** matrice ADMIN/USER/GUEST vérifiée sur chaque route/commande sensible ; aucune escalade, modification GUEST ou fuite interutilisateur.

### PHASE 5 — Commandes natives et IA-TB CLI

- [ ] Développer **dans l'application IA-TB** le gestionnaire natif `iatb-users` (service métier commun avec Core).
- [ ] Fournir les commandes `list`, `create`, `role`, `enable`, `disable`, `reset-password`, `delete`, `audit`.
- [ ] Saisir les mots de passe par invite masquée (jamais en argument, sortie, historique shell ni journal) ; confirmations pour suppressions et promotions.
- [ ] Protéger les commandes par permissions Linux minimales et enregistrer les actions administratives sans secrets.
- [ ] Ajouter `iatb users ...` dans le dépôt séparé IA-TB-CLI : réutilisation des mêmes commandes natives sur GEN-1 via SSH, sans dédoubler leur logique.
- [ ] Ajouter diagnostics/erreurs explicites, tests unitaires CLI et tests de bout en bout sur instance isolée.

**Validation :** une commande native testée sur GEN-1 de test et son équivalent CLI depuis Macro produisent les mêmes effets attendus, avec logs et contrôle GitHub.

### PHASE 6 — Intégration Git DEBUG 2.1

- [ ] Adapter la page de connexion existante au thème IA-TB, **sans bouton d'inscription** ; intégrer verrouillage, déverrouillage et gestion des erreurs.
- [ ] Ajouter les migrations, le service d'authentification, les politiques serveur, les helpers CLI et les tests automatisés.
- [ ] Préparer le build **DEBUG 2.1** dans une branche dédiée, avec versions et manifeste de compatibilité.
- [ ] Exécuter les tests d'authentification, permissions, idempotence des migrations, isolation des données et régression UI/Core/Router/MarketData/Fundamental.
- [ ] Vérifier l'absence de secrets et clés dans les commits ; confirmer que les données DEBUG persistantes ne sont pas packagées dans les images.
- [ ] Documenter la récupération d'accès ADMIN, les procédures de sauvegarde, de retour arrière et les limites du système.
- [ ] Mettre à jour ROADMAP, documentation et changelog ; contrôler le diff, les tests et les résultats GitHub avant fusion.

**Validation :** build DEBUG 2.1 versionné, reproductible, testé et accepté ; **aucune exposition publique** ni remplacement direct du runtime GEN-1.

### PHASE 7 — Déploiement GEN-1 et ouverture réseau contrôlée

- [ ] Confirmer sauvegardes/restauration des bases, clés et volumes, état Docker, ports et configuration DEBUG avant déploiement.
- [ ] Déployer DEBUG 2.1 dans un environnement isolé en préservant les conteneurs existants ; valider la migration et un rollback réel.
- [ ] Réinitialiser les anciens comptes DEBUG uniquement selon l'inventaire et la sauvegarde approuvés.
- [ ] Créer le premier ADMIN via commandes natives appelées depuis IA-TB CLI ; vérifier sa persistance après redémarrage et changement de build.
- [ ] Créer des comptes USER/GUEST de test et valider permissions, AutoLock 5 min, expiration, révocation, accès directs et tests de contournement.
- [ ] Vérifier la non-régression MarketData/Fundamental et la persistance des préférences, stratégies et comptes ; confirmer LIVE désactivé.
- [ ] Tester l'accès **HTTP privé** (localhost/tunnel SSH ou VPN protégé), aucun port d'authentification en clair publié sur Internet.
- [ ] Au jalon d'ouverture Internet, **rediscuter et valider la solution TLS/HTTPS** et la publication réseau ; ne pas diffuser identifiants et sessions en HTTP public.
- [ ] Si ouverture publique autorisée : installer proxy HTTPS et renouvellement automatique, exposer uniquement le Gateway et contrôler Core/Router/Engines/prévisualisations.
- [ ] Vérifier scans de ports, absence de bypass DEBUG, fonctionnement en erreur réseau/Auth et plan de retour arrière ; demander la confirmation finale avant ouverture à tous.

**Validation finale :** comptes persistants, authentification obligatoire, verrouillage effectif, permissions appliquées, données isolées, récupération ADMIN vérifiée et contrôle d'exposition validé. **Ouverture Internet seulement après sécurité transport approuvée.**

---

## ÉVOLUTIONS ULTÉRIEURES — Hors livraison initiale DEBUG 2.1

- [ ] **Gestionnaire TLS dans Admin** : inventaire des certificats, alertes de validité, renouvellement ACME automatique par agent aux privilèges limités, remplacement sûr et rollback.
- [ ] **Wallets après premier déploiement**, puis alignement avec Supervisor : enregistrer des adresses **publiques** par client, en watch-only, sans conserver de clés privées sur le VPS ; étudier connexion via wallet navigateur, WalletConnect ou hardware wallet.
- [ ] **Ordres automatiques Supervisor** : vérifier les capacités réelles du connecteur. Une connexion WalletConnect ou une signature ponctuelle **n'accorde pas** une capacité générale de signature autonome. Étudier ultérieurement délégations explicites et révocables (session keys/smart accounts/contrats autorisés) avec actifs, plafonds, durée, destinataires et risques strictement limités, ou signature manuelle lorsque nécessaire.
- [ ] Préparer la migration volontaire et auditée des anciens wallets sans manipulation automatique de secrets privés.

## Conditions de livraison

**Aucune ouverture publique tant que les conditions suivantes ne sont pas satisfaites :**

- [ ] Authentification opérationnelle **fail-closed**, routes protégées et aucun bypass DEBUG.
- [ ] ADMIN valide créé, testé et récupérable sans intervention Web.
- [ ] AutoLock après 5 minutes et déverrouillage par mot de passe vérifiés.
- [ ] Matrice de privilèges et propriété des données validées, y compris tests négatifs.
- [ ] Sauvegardes, migrations, compatibilité et retour arrière testés.
- [ ] Aucun secret dans Git, les logs ou les commandes ; clés existantes préservées.
- [ ] Trading Engine LIVE désactivé.
- [ ] Accès public avec transport protégé **HTTPS** ; politique des certificats décidée au jalon réseau.
- [ ] Accord final explicite sur la publication réseau.

**Méthodologie obligatoire :** un point à la fois, travaux et tests regroupés côté assistant autant que possible, puis **une commande CLI compacte** sur Macro/GEN-1 uniquement si nécessaire. La commande vise modification, tests, validation, compte rendu et contrôle GitHub ; elle ne doit pas déployer en production ou ouvrir un port sans accord spécifique. L'utilisateur transmet la sortie réelle, le résultat est comparé au résultat attendu, **puis et seulement puis** le point est coché et le suivant démarre. Toute erreur reste `[ ]` avec diagnostic et correctif tracé.


### Bilan transversal de contrôle — 15/10/2026 (branche de conception)

**État vérifié sur code GitHub : non livrable / déploiement interdit.** Les trois workflows Auth21 valident des fixtures et de la conformité statique, pas une sécurité effective de toutes les routes.

- **Phase 1 :** clôturée uniquement en conception (comme indiqué ci-dessus).
- **Phase 2 :** ouverte ; P2.1 validé en fixtures, P2.2 reste ouvert faute de coordination et restauration réelles interservices.
- **Phases 3–4 :** non closes ; des modules de sessions, RBAC, IPC et route gates DEBUG sont présents, sans couverture exhaustive des véritables points d'entrée.
- **Phase 5 / intégration :** non close ; Gateway et Router répondent en mode Auth21 isolé par refus par défaut hors routes explicitement autorisées. Cela garantit le verrouillage mais **pas un flux métier fonctionnel**.
- **Phase 6 :** tests cryptographiques, quatre processus HTTP *simulés* et écriture persistante sur fixture ; les vrais Engines ne sont pas passés par un test HTTP complet commun.
- **Phase 7 :** audit/benchmarks/rollback sur GEN-1 non validés et interdits jusqu'au feu vert explicite d'Overflow.

**Extension transversale ajoutée (contrat de test, non monté) :** `auth21_engine_guard.js` prévoit un garde *fail closed* pour 12 frontières (Indicator, MarketData, Liquidity, Fundamental, Trading, Firewall, Strategy, Risk, Portfolio, Kraken, Supervisor, Router). Actuellement, seules des actions de lecture explicites peuvent passer ce contrat ; Wallet, ordres LIVE et écritures non inventoriées sont refusés. La présence du module ne protège pas un serveur tant que son entrée HTTP et ses opérations CP/1/WS ne l'invoquent pas.

**Critères indispensables avant de cocher l'intégration :** inventorier toutes les routes HTTP/WS/CP/1 de chaque moteur, brancher et tester un garde commun à l'entrée effective, vérifier identité de service et autorisation par opération/ownership, lier les écritures au corps exact, imposer l'anti-rejeu multi-processus, prouver une écriture DEBUG isolée avec le vrai Core/Router/Engine, auditer les protections des volumes, secrets et sauvegardes, mesurer p95/p99 et assurer rollback. Un middleware générique ne dispense jamais de la revue des autorisations métier propres à chaque Engine.

**Règle de livraison :** ne plus confondre « contrat créé », « CI fixtures verte », « routes réellement câblées », « tests interservices validés » et « déploiement approuvé ». **Aucun nouveau Docker DEBUG sur GEN-1**, aucun Trading LIVE, aucune migration ni intervention Wallet sans validation explicite d'Overflow.

### Validation locale des véritables entrées Engine — 15/10/2026

`auth21_engine_ingress.js` est désormais monté à la création des serveurs
Indicator, MarketData, Liquidity, Fundamental, Trading, Firewall, Strategy,
Risk, Portfolio et Supervisor. En mode Auth21 DEBUG isolé, il refuse les
requêtes avant tout dispatch legacy HTTP/CP1 et ferme aussi Upgrade et CONNECT.
Le runtime hors de ce mode conserve son comportement existant.

Validation locale sous Node 22.23.3 : **386/386 tests Node + 15/15 tests SQL
Python réussis**, dont **11 nouveaux tests**. Dix tests lancent chacun le
véritable script de service dans un processus distinct, sur copie temporaire
sans données utilisateur, et vérifient par sockets les refus HTTP, identité
forgée, CP1, WebSocket et CONNECT. Le onzième vérifie la conservation du
handler legacy hors mode isolé. Cette suite est ajoutée au workflow P2.2.
Ces nombres sont des résultats locaux ; la CI distante doit être consultée
séparément sur le commit publié.

**Limite explicite :** ce raccordement ferme les accès, il n'autorise encore
aucun parcours métier. Il ne prouve ni les échanges autorisés Core/Router/Engines,
ni l'isolation multiutilisateur, ni les sauvegardes interservices. Aucun service
Kraken autonome n'est présent dans `App` à cette révision ; l'adaptateur Kraken
est chargé par Trading. Les cases et les phases 2 à 6 restent ouvertes.
Aucun déploiement, migration réelle ou accès à GEN-1 effectué.


### P2.2 — Intégration multi-processus sur copies isolées (15/10/2026)

**Preuve CI : [Auth P2.2 SUCCESS — run 38661630603](https://github.com/florian74410/IA-Trading-Bot/actions/runs/38661630603).**
Le Core coordonne **8 participants** (4 écrivains locaux clients/settings/mosaics/annex-root et
les véritables processus Portfolio/MarketData/Fundamental/Trading) avec PREPARE,
QUIESCED, RELEASE, ABORT via commandes loopback signées HMAC et liées au contenu
SHA-256. Les principaux stores de ces Engines sont raccordés en mode
strictement DEBUG isolé ; aucune exécution Trading LIVE ni opération Wallet.

Tests exécutés avec de vrais processus Engine sur copie scratch : capture
d'images SQLite WAL et JSONL, archive AES-256-GCM, restauration vers un
répertoire vierge, contrôle de clé/chiffrement et intégrité SQLite/JSONL.
Un crash réel de Trading pendant la barrière provoque un échec de cleanup,
un état Core BLOCKED et le refus d'une nouvelle sauvegarde. Aucun GEN-1 touché.

**Critères restants avant clôture P2.2 :** inventaire exhaustif des écrivains
y compris scripts, annexes non couvertes et démarrages automatiques ; gel et
restauration de toutes les ressources utiles à l'application complète,
reprise *après redémarrage* de processus à génération durable, tests sur
vrais writers non coopératifs et absence d'événement perdu, comparatifs
p95/p99, restauration interservices de toutes les identités et clés
client originales sous la politique approuvée. Les tests complets Phase 6
restent requis. **P2.2 et Phase 2 restent [ ] jusqu'à satisfaction de ces
critères**, conformément à la règle de non-clôture anticipée.

### Validation CLI locale et verrouillage navigateur — 15/10/2026

Code validé : `e5179d68501d65f3b6d7196196a086bceb0d0660`, sur
`feature/debug-2.1-auth-design`, après rapprochement avec `a6105bcc`.
Preuves CI : [P2.2 SUCCESS](https://github.com/florian74410/IA-Trading-Bot/actions/runs/38757949452),
[P2.1 SUCCESS](https://github.com/florian74410/IA-Trading-Bot/actions/runs/38757949256),
[RBAC SUCCESS](https://github.com/florian74410/IA-Trading-Bot/actions/runs/38757949241).

- CLI : création chiffrée identité/login atomique, rôles, activation,
  désactivation, suppression du login uniquement, réinitialisation du mot
  de passe et audit minimal. Protection du dernier ADMIN maintenue ;
  réautorisation après KDF et révocation de la session opérateur après commande.
  Saisie Unicode sans écho ; secrets absents des arguments et sorties.
- Runtime isolé : administration **hors ligne**, uniquement sur schéma v3 et
  clé préexistants. Core et CLI prennent le même verrou noyau Linux ; une
  sauvegarde en attente de récupération bloque la CLI. Le verrou est libéré
  même après SIGKILL. Aucun contournement de la barrière de sauvegarde.
- UI : verrouillage manuel persisté côté serveur, reprise de l'écran
  verrouillé après rechargement et déconnexion possible depuis cet écran.
  L'API d'état ne fournit ni principal métier ni bearer. CSRF reste exigé ;
  mauvais mot de passe et actions métier sur session verrouillée sont refusés.
- Vérification locale : **452 tests Node réussis, 1 test TTY non-root ignoré**
  car cet hôte ne peut mapper un autre UID ; **15 tests SQL Python réussis**.
  Le test TTY a ensuite **réussi sans skip en CI Linux**, avec le véritable
  exécutable CLI et la base du banc. Trois tests supplémentaires de comportement
  UI ont réussi localement (rechargement, timeout, échec de déconnexion).
- Compagnon `IA-TB-CLI` : commit `9521c046e1d84d7de2d0033bc97bd8a3ee5d4e73`
  sur sa branche `feature/debug-2.1-auth-design` ; commande locale `iatb users`,
  aucun SSH ; **12 tests Python réussis**. Aucun changement de `main`.

**Pas de clôture des phases 2 à 6.** Cette validation ne remplace pas la
migration des parcours métier légitimes encore bloqués dans les 103 routes
Core recensées, l'inventaire des routes dynamiques/CP1/WS, la qualification
exhaustive des écrivains ni la campagne complète de charge/rollback.
Le plan conserve ces critères ouverts. Aucun accès ou déploiement GEN-1,
aucun ordre LIVE, aucune modification des clés Wallet.

**Correctif complémentaire validé — démarrage simultané des Engines :**
la CI `38758388170` a révélé une course `CP_SECRET_UNAVAILABLE` : un processus
pouvait voir un fichier de secret runtime encore vide pendant sa création.
Le commit `2587b9ef89bc4677143b370212ac082287a073b7` publie les octets complets
par lien atomique sans écrasement, après fsync, et conserve la clé du processus
vainqueur. Test déterministe : premier écrivain suspendu sur fichier vide,
second Engine démarré, identité de clé finale inchangée. Les clés Wallet
ne sont pas concernées.

Validation finale du code : **456 tests Node réussis localement, 1 skip TTY
limité à l'hôte**, puis CI Linux complète réussie :
[P2.2](https://github.com/florian74410/IA-Trading-Bot/actions/runs/38758885534),
[P2.1](https://github.com/florian74410/IA-Trading-Bot/actions/runs/38758885280),
[RBAC](https://github.com/florian74410/IA-Trading-Bot/actions/runs/38758885664).
Le statut global et les critères non satisfaits ci-dessus restent inchangés.
