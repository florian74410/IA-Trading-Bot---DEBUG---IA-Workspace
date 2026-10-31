# IA-TB DEBUG 2.1 — P1.5 — Audit du stockage et des risques de restauration

> **État :** revue statique terminée, rapprochée du rapport GEN-1 du 13/10/2026. P1.5 **reste en cours** jusqu'au contrôle réel des permissions/montages et à la validation du plan de reprise.  
> **Références :** `fix/v2.0.1-debug` (code canonique `App/`, `compose.debug.stack.yml`) et [plan P1.5](../Architecture/AUTH_DEBUG_2.1_BACKUP_RESTORE_CONTRACT.md).  
> **Limites :** aucune lecture de contenu de clé, de wallet, de session, de variable d'environnement ou de fichier SQLite utilisateur ; aucune modification de GEN-1, de Contabo ni de Trading LIVE.

## 1. Topologie persistante : GitHub versus GEN-1

| Objet | Emplacement **dans conteneur** | Chemin hôte attendu dans DEBUG | Source / comportement |
| --- | --- | --- | --- |
| Client identity/accounts | `/iatb/debug/data/Database/clients.sqlite` | `/var/lib/iatb/debug/data/Database/clients.sqlite` | `Core/Shared/paths.js:31-32`, `Core/Clients/client_repository.js` ; `PRAGMA journal_mode=DELETE` |
| Clé des identités AES/HMAC | `/iatb/debug/data/Security/client_master.key` | `/var/lib/iatb/debug/data/Security/client_master.key` | `Core/Clients/client_crypto.js:6-23` |
| Clé maître wallet | `/iatb/debug/data/Security/wallet_master.key` | `/var/lib/iatb/debug/data/Security/wallet_master.key` | `Bank/Core/wallet_service_v2.js:3-4` ; migration legacy possible |
| Paramètres / wallets catalogués | `/iatb/debug/data/User Data/default/user_data.db` | `/var/lib/iatb/debug/data/User Data/default/user_data.db` | `Core/Settings/sqlite_settings_store.js:10-14`, mode WAL ; scope `bank_wallets` aussi possible |
| Portefeuille / ledger | `/iatb/debug/data/User Data/default/portfolio.db` | `/var/lib/iatb/debug/data/User Data/default/portfolio.db` | `Portfolio/Engine/portfolio_store.js:9-10`, WAL |
| Fundamental | `/iatb/debug/data/Shared Data/Fundamental/fundamental.db` | `/var/lib/iatb/debug/data/Shared Data/Fundamental/fundamental.db` | `Fundamental/Engine/database_core.js:6,38`, WAL + `synchronous=NORMAL` |
| MarketData | `/iatb/debug/data/Shared Data/MarketData/*.db` | `/var/lib/iatb/debug/data/Shared Data/MarketData/` | Registry, Telemetry et Microstructure : WAL |
| État et coffre legacy | `/iatb/debug/state/{user.dat,secrets_v2.dat,ai_settings_v2.dat,config_v1.0.dat}` (si présents) | `/var/lib/iatb/debug/state/` | `Core/Shared/paths.js:28,66`, `Core/Server/server.js:24` |
| Secrets internes CP/1 | `/iatb/debug/runtime/state/security/*.dat` | `/var/lib/iatb/debug/runtime/state/security/` | `Core/Shared/paths.js:21-22,50-60` |
| Logs/cache/runtime/updates | `/iatb/debug/runtime/`, `/iatb/debug/annexes/`, `/iatb/debug/updates/` | sous `/var/lib/iatb/debug/` | Cinq bind mounts `:rw` déclarés pour chaque service dans `compose.debug.stack.yml:8-35` |

**Observation du rapport GEN-1 :** huit DB SQLite identifiées, avec `PRAGMA quick_check: ok` pour chacune ; `clients.sqlite` contient **1 client, 0 compte d'authentification, 0 association `client_wallets`, 1 événement d'audit**. Plusieurs bases ont des fichiers `-wal`/`-shm`. Le rapport agrégé ne fournit pas de preuve des permissions OS effectives ni des montages réels **en écriture/lecture seule par conteneur**.

Le fichier `data/User Data/storage-preflight/user_data.db` est un artefact de test observé, à classifier ; **ne pas le supprimer automatiquement**. Les fichiers `-wal` et `-shm` ne doivent pas être traités comme des fichiers inutiles pendant qu'une DB est ouverte.

### Racines Docker et exposition de volumes

Le Compose canonique monte en écriture **les cinq racines** `runtime`, `data`, `state`, `annexes`, `updates` dans chaque conteneur ; les 13 services partagent le namespace réseau Router et le même UID/GID configurable. `read_only:true` protège l'image/rootfs mais **n'empêche pas l'écriture dans les bind mounts `:rw`**. Il faut vérifier sur GEN-1 le `docker inspect` réel et les permissions OS. Le modèle multiutilisateur exigera, avant déploiement, une réduction des montages et des privilèges par service pour protéger clés Auth, sessions et wallets des Engines qui n'en ont pas besoin.

## 2. Risques de perte/désynchronisation — constatés dans le code

| Priorité | Risque concret | Preuve | Mesure requise avant migrations |
| --- | --- | --- | --- |
| **P0** | Si `client_master.key` est absent/illisible, `ClientCrypto._loadKey()` peut créer une clé neuve silencieusement | `Core/Clients/client_crypto.js:12-23` | **Refus strict** dès qu'il existe des données chiffrées ou identités existantes ; récupération/restauration de la clé originale avant ouverture ; aucune régénération automatique sur instance non vierge |
| **P0** | `WalletService._master()` tente une clé legacy puis en génère une neuve si introuvable ; le déchiffrement historique devient impossible | `Bank/Core/wallet_service_v2.js:3-4` | Vérifier présence/provenance et préserver les clés d'origine ; ne déclencher ni import, ni création de wallet, ni déchiffrement pendant P1.5 |
| **P0** | `Core/Shared/paths.js` crée un nouveau secret CP/1 ou service interne si absent | `Core/Shared/paths.js:50-60` | Séparer rotation intentionnelle et disparition accidentelle du secret ; vérifier présence et permissions avant démarrage d'un nouveau build |
| **P1** | Copier simplement un `.db` en WAL actif peut oublier des transactions récentes | Settings/Portfolio/Fundamental/MarketData utilisent WAL dans leur code ; WAL confirmés sur GEN-1 | Utiliser l'API SQLite Online Backup ou `VACUUM INTO` sur copies et contrôler `quick_check` et nombre d'enregistrements ; ne pas forcer un checkpoint en production sans besoin |
| **P1** | Plusieurs bases sont liées logiquement (clientId/settings/portefeuille), sans transaction globale | Plusieurs fichiers par sous-système et état `client_identity/active_client_id` dans Settings | Couper brièvement les mutations via mécanisme applicatif de maintenance **à concevoir**, ou capturer un ensemble à génération cohérente ; tester la restauration de tous les artefacts ensemble |
| **P1** | Le wallet peut migrer des références legacy lors de l'accès à `_all()` ; certaines méthodes de lecture écrivent | `Bank/Core/wallet_service_v2.js:9-22` | Ne pas utiliser l'API wallet comme outil d'inventaire avant snapshot ; lire métadonnées fichiers, puis copies isolées |
| **P1** | `client_repository.js` impose `journal_mode=DELETE`, tandis que les autres stores utilisent WAL | `Core/Clients/client_repository.js:32` et sources Stores | Procédure de sauvegarde compatible avec **les deux** modes, sans imposer WAL à la base Clients |
| **P1** | Le stockage principal des wallets peut se trouver dans `user_data.db` même si `client_wallets=0` | `WalletService._all()` utilise `bank_wallets` et éventuellement des références legacy | Ne pas conclure « aucun wallet » du simple `client_wallets=0` ; ne jamais écraser la DB des paramètres |
| **P2** | Absence de mécanisme de restauration GEN-1 testé et formalisé dans les scripts inspectés | `App/Tools/*preflight*` et `persistence_volume_smoke.js` sont des vérifications, pas des backups complets ; `IA-TB-CLI/iatb_helpers/restore.py` concerne la restauration **de clés SSH de Macro**, pas les DB du serveur | Implémenter ultérieurement un outil de sauvegarde cohérente + procédure de restauration isolée, pas de `cp` manuel sur DB active |

La conception des permissions d'accès `clientId` par utilisateur, de l'interdiction du `active_client_id` global et du fail-closed demeure régie par les points P1.4/P1.7 et Phases 2–4.

## 3. Périmètre de données à sauvegarder

**Indispensable à la reprise fonctionnelle :**

1. Toutes les bases métier nécessaires : `clients.sqlite`, paramètres `User Data/*/user_data.db`, `portfolio.db`, DB Fundamental et MarketData ; découvrir les fichiers réellement présents, pas uniquement une liste figée.
2. Les clés maîtres existantes (`client_master.key`, `wallet_master.key`) et les éventuels coffres historiques, sans les afficher et sans en générer d'autres.
3. Les métadonnées de version, migrations, configs persistantes `state/`, répertoires `annexes/` et `updates/` nécessaires au rollback, image Docker et Compose exacts **référencés** par identifiant/version.
4. Les secrets de service persistants `runtime/state/security/` lorsque leur conservation est nécessaire à la validité des communications au redémarrage ; ne jamais les fusionner entre DEBUG et RELEASE.
5. Conserver les journaux uniquement selon la politique de diagnostic/rétention ; ne pas mélanger logs de production avec archives de clés.

**Exclus avant validation spécifique :** données sensibles en clair transférées au chat/GitHub ; DB réelle réouverte dans une application non isolée ; wallets réels importés ; copie DEBUG→RELEASE automatique.

## 4. Contrôle supplémentaire requis pour valider P1.5

Le code source et le rapport précédent ne suffisent pas à vérifier l'**UID/GID/mode** des répertoires, l'existence et permissions de chaque clé ni le `Mode` effectif des mounts Docker. Le diagnostic doit être **strictement lecture seule** et retourner **uniquement** :

- Pour les cinq répertoires racines DEBUG : `present/type, uid, gid, chmod octal` ; aucun nom d'utilisateur ou donnée brute nécessaire.
- Pour `data/Security/`, `client_master.key`, `wallet_master.key`, `data/Database/clients.sqlite`, `data/User Data/default/{user_data.db,portfolio.db}`, `state/`, `runtime/state/security/` : existence, type, UID, GID, mode ; **pas de contenu, hash de clé ni chemin d'accès non prévu**.
- Pour les 13 conteneurs IA-TB : compte Docker (`Config.User`), rootfs readonly, statut et mode RW/RO des cinq bind mounts canoniques, sans `docker inspect` JSON brut ni environment.
- Éventuelle présence de la seule **structure** des sauvegardes ; aucun accès aux archives ni aux secrets.

**Interprétation :** si l'absence d'une clé maître est détectée, **ne pas lancer de Core, WalletService, bootstrap, migration, `docker compose up`, ni restauration** sans décision sur les données existantes. Privilégier un diagnostic plus ciblé en lecture seule.

## 5. Critère de clôture du point

- [x] Localisation du stockage canonique documentée et rapprochée du rapport GEN-1.
- [x] Risques de création silencieuse de clés, dualité des journaux et sauvegarde en ligne documentés.
- [x] Contrat de sauvegarde/restauration rédigé.
- [x] Relevé distant OS/Docker du 14/10/2026 examiné : 13/13 conteneurs UID 1001:1001, rootfs RO et cinq volumes RW ; modes et présences des fichiers relevés (voir §6).
- [x] Overflow valide le 14/10/2026 le contrat : conserver les protections fonctionnelles, isoler progressivement les services et ne toucher à aucune clé ou logique wallet pendant le chantier Auth.
- [ ] **Lors des Phases 2 et 7** seulement : snapshots réels, restauration sur copie, tests de rollback, puis déploiement conditionnel ; **ne pas les faire sur GEN-1 durant P1.5**.

**État : P1.5 validé au niveau de la conception et du diagnostic réel**, conformément à la décision d'Overflow du 14/10/2026. Les sauvegardes réelles, restaurations, conversions de clés et modifications de montages restent hors périmètre de cette validation. **Wallet : aucun changement**, la clé wallet absente reste dans son état actuel.
---

## 6. Réconciliation : permissions et montages réellement actifs sur GEN-1 (14 octobre 2026)

**Preuve transmise par Overflow :** sortie du préflight P1.5 en lecture seule (`stat` de métadonnées ciblées, `docker ps` et `docker inspect`). Aucun secret lu, aucune commande Docker mutante exécutée, aucune copie de données produite.

### Métadonnées observées

| Cible | Type / permission | UID:GID | Conclusion |
| --- | --- | --- | --- |
| Racines `runtime`, `data`, `state`, `annexes`, `updates` | `DIR 0700` chacune | `1001:1001` | Restreint les autres UID Linux, pas les 13 conteneurs du même UID |
| `data/Database`, `data/Security` | `DIR 0700` | `1001:1001` | Barrière pertinente sur l'hôte, non interservices |
| `data/Database/clients.sqlite` | `FILE 0600` | `1001:1001` | DB clients présente, protégée contre autres UID sauf élévation de privilèges |
| `data/Security/client_master.key` | `FILE 0600` | `1001:1001` | Clé client d'origine **présente** : sa conservation et concordance avec les données sont impératives |
| `data/Security/wallet_master.key` | `ABSENT` | — | Absence constatée **seulement**, pas preuve qu'il n'existe pas de wallets historiques dans Settings/legacy ; ne pas générer automatiquement |
| `data/User Data/default/user_data.db`, `portfolio.db` | `FILE 0644` | `1001:1001` | Lecture par « autres » autorisée sur le fichier lui-même, **mais racine `data` 0700** empêche normalement sa traversée aux UID distincts ; prudence en cas de copie/déplacement ou modification d'ACL/mount |
| `state/user.dat`, `secrets_v2.dat`, `ai_settings_v2.dat` | `ABSENT` | — | Ces trois chemins legacy n'existent pas dans le déploiement audité ; aucune conclusion générale sur d'autres sauvegardes |
| `runtime/state/security` | `DIR 0755` | `1001:1001` | Permission locale permissive, mais ancêtre `runtime` 0700 ; réduire à `0700` lors du hardening testé, pas immédiatement |
| `internal_service_key.dat`, `communication_protocol_key.dat` | `FILE 0600` | `1001:1001` | Deux secrets internes existants, nécessitant une séparation de droits lors de la refonte interservices |

### Docker : état des 13 conteneurs audités

- **13/13** : `Config.User=1001:1001`, `ReadonlyRootfs=true`.
- **13/13** : exactement les cinq bind mounts attendus en `RW=true` vers `/iatb/debug/{annexes,data,runtime,state,updates}`.
- **Déduction de sécurité :** le rootfs en lecture seule ne rend pas les cinq volumes immuables. Chaque processus du même UID et ayant ces montages peut potentiellement lire/écrire des DB et clés auxquelles il ne devrait pas avoir accès. `chmod 0600` n'isole pas deux conteneurs exécutés avec le même UID et le même volume. Réduction de privilèges/montages **bloquante avant activation multiutilisateur/publication**, à faire sur build isolé avec tests et rollback.

### Décisions et réserves

1. **Ne rien modifier sur GEN-1 lors du P1.5** (pas de `chmod`, `chown`, suppression, création de clé, `docker compose`, backup réel, ni changement Contabo).
2. **Préserver strictement** `client_master.key` et les huit DB SQLite précédemment observées. Une restauration de DB sans sa clé doit échouer de façon explicite.
3. **Ne pas matérialiser `wallet_master.key` au préflight** ; son absence ne valide ni n'invalide les inventaires wallet historiques. Avant d'autoriser l'utilisation du WalletService ou la création d'une clé sur un stockage existant : inventaire non intrusif sur copie et politique fail closed.
4. **Cible de durcissement ultérieure :** DB privées `0600` et répertoires secrets `0700` quand compatible, propriétaires/UID différenciés, mounts `:ro` ou absents hors services autorisés ; éviter des `chmod` immédiats sur WAL/SHM actifs. Séparer DEBUG/RELEASE et les secrets de signature des Engines.
5. **Contrôle de sécurité non encore effectué :** permissions détaillées des huit DB/WAL/SHM, ACL Linux étendues, présence de copies de sauvegarde externes et restauration sur environnement isolé. Aucune de ces incertitudes ne change l'interprétation des permissions relevées.

### État P1.5 après ce rapport

- [x] Revue statique des emplacements et risques terminée.
- [x] Relevé GEN-1 permissions et mounts reçu et rapproché du code.
- [x] Stratégie de sauvegarde/restauration proposée et documentée.
- [ ] **Validation finale par Overflow du contrat et de l'acceptation des réserves** (point P1.5 non coché dans la checklist canonique tant qu'elle n'a pas été confirmée).
- [ ] Implémentation Auth, isolation des mounts et tests de backup/restore : jalons ultérieurs, **aucune exécution réelle autorisée par ce document**.
