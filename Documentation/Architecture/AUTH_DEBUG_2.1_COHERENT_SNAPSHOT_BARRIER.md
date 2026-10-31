# IA-TB DEBUG 2.1 — P2.1 — Barrière de cohérence interbases (protocole à implémenter)

> **État :** conception du protocole + **prototype de test coopératif uniquement sur SQLite fictives**. Non intégré aux Engines, pas un mécanisme de sauvegarde GEN-1 opérationnel.  
> **Périmètre :** même environnement DEBUG, stabilité des comptes clients, paramètres et portfolio pendant un snapshot ; *aucune migration DEBUG ↔ RELEASE*.  
> **Décision de déploiement :** **aucun nouveau Docker DEBUG sur GEN-1** tant que toute l'authentification 2.1 n'est pas développée/intégrée/testée et approuvée par Overflow. Ne pas toucher aux Wallets, aux clés Wallet, aux règles Contabo ni aux bases réelles.

## 1. Pourquoi un SQLite Online Backup par fichier n'est pas suffisant

SQLite `backup()` garantit une vue transactionnellement cohérente **d'une base individuelle**, y compris si celle-ci utilise WAL. Il ne fige **pas simultanément** `clients.sqlite`, `user_data.db`, `portfolio.db` et les autres DB. Un client pourrait être modifié dans Core après la copie de `clients.sqlite` mais avant celle du Portfolio, donnant une archive incohérente **bien que chaque DB passe `PRAGMA quick_check`**.

La simple égalité d'un `epoch` factice dans les DB est utile en test, mais ne démontre pas une capture atomique des moteurs réels.

## 2. Proposition — Coordinateur de maintenance avec barrière coopérative

1. **Demande explicite d'opération autorisée** (CLI native de maintenance, jamais depuis la boucle MarketData) ; cible, versions, protections, espace et état validés avant toute mutation.
2. **Préparer** : un coordinateur identifié (Core/Supervisor, à choisir) publie `PREPARE_SNAPSHOT(generation)`. Chaque *writer métier* ayant accès à une des DB du jeu doit fermer proprement les transactions en cours, interrompre ses futures écritures métier et accuser réception de `QUIESCED(generation, writer_id, in_flight=0)` après vidage de ses buffers/transactions.
3. **Barrière de tous les écrivains** : aucune copie tant que la liste d'écrivains **réellement active** n'a pas répondu. Toute absence d'ACK, nouveau writer non enregistré, TTL expiré, redémarrage d'Engine ou erreur de synchronisation = **abandon fail-closed** de la sauvegarde cohérente, puis reprise supervisée sans archive validée.
4. **Fenêtre de snapshot** : barrière active, connexions SQLite de sauvegarde indépendantes, Online Backup de chaque DB, copie sécurisée des éléments requis dans un staging privé ; maintenir la même génération pendant toute cette fenêtre.
5. **Valider et publier** : `quick_check`, `foreign_key_check`, liens `clientId` entre données concernées, manifeste et concordance génération ; chiffrement authentifié de l'archive avant son stockage durable ou externe. La sauvegarde **n'est visible comme complète** qu'après validation et finalisation atomique du manifeste.
6. **Relâcher** : `RELEASE_SNAPSHOT(generation)`, chaque writer reprend après confirmation de la génération, buffers bornés et logs expurgés ; rollback de staging incomplet en cas d'erreur.
7. **Observabilité & performances** : mesurer attente des ACK, durée de pause des écritures métier, temps SQLite backup, CPU/RAM/I/O, backlog, p50/p95/p99 des requêtes et ticks ; seuils et erreurs bloquantes validés avant intégration.

Les **lecteurs** et caches de flux publics peuvent rester actifs si l'accès en lecture est sans effet et si les buffers sont bornés. Les mutations utilisateur entrantes pendant la barrière doivent être refusées temporairement avec réponse claire de maintenance, ou mises dans une file bornée et idempotente avec traçabilité ; **ne jamais perdre silencieusement une mutation ni exécuter deux fois un ordre**. Le Trading LIVE est désactivé dans DEBUG.

## 3. Prototype technique : `fcntl.flock` sur fixtures

Le [préflight Python](../../Tools/CI/auth_storage_preflight.py) propose uniquement pour les fixtures isolées :

- `fixture_writer_guard(root)` : acquérir `LOCK_SH` pendant **toutes** les transactions SQLite liées, y compris si plusieurs DB changent successivement.
- `fixture_snapshot_barrier(root)` : acquérir `LOCK_EX` pendant vérification de génération et sauvegardes de toutes les DB.
- `coherent_fixture_snapshot(root)` : sauvegarde en ligne des trois DB fictives sous la barrière exclusive, puis restitution du verrou.
- Un fichier de verrou créé sous le **répertoire temporaire privé marqué** `/tmp/iatb-p21-fixture-*/.iatb-auth-p21-coherence.lock` (mode `0600`), sans symlink, avec validation UID, permissions et délai d'attente fini.
- Linux/POSIX : verrou **advisory** via `fcntl.flock`, libéré automatiquement quand un descripteur/processus se termine. L'outil ne met **aucune barrière** sur les vrais chemins des Engines ou de GEN-1.

Les [tests](../../Tools/CI/test_auth_storage_preflight.py) vérifient **six cas supplémentaires** : un writer qui garde le verrou sur un changement en plusieurs DB, le snapshot exclusif qui bloque un nouveau writer, timeout sans snapshot partiel, fichier verrou symlink/mode refusé, refus de racine non-constructible/GEN-1, verrou actif dans **un processus distinct**, puis libéré après fermeture.

**Limite non négociable :** `flock` est coopératif. Un programme qui écrit dans SQLite **sans prendre le verrou partagé** n'est pas bloqué par ce mécanisme. Le protocole réel exige donc une intégration explicite de **tous** les écrivains, un inventaire fiable et des tests de crash/restart ; il peut nécessiter un coordinateur supervisé plus robuste qu'un simple fichier de verrou. La séparation des clés/volumes Docker et les privilèges RBAC ne sont pas fournis par `flock`.

## 3 bis. Crash, redémarrage et processus non coopératifs — démonstration de sécurité

Deux tests supplémentaires (**22 au total**) vérifient : (a) la terminaison brutale d'un processus factice détenteur du verrou partagé libère le verrou OS, sans prétendre réparer une transaction applicative interrompue ; (b) un processus **non coopératif** peut écrire dans une base malgré le verrou exclusif `flock` d'un autre processus. La divergence de génération ainsi créée est détectée au préflight et le snapshot est refusé. **La détection n'est pas une protection exhaustive** : un writer clandestin qui conserve un `epoch` valide peut toujours contourner le prototype.

Cette limite impose l'inventaire exhaustif des writers, les ACK par identifiant/génération, la gestion des restarts et la restriction des droits sur les volumes avant un déploiement réel. Les fichiers JSONL et Annexes n'entrent pas dans le périmètre de l'Online Backup SQLite. Voir l'[inventaire élargi](AUTH_DEBUG_2.1_SQLITE_WRITER_INVENTORY.md).

## 4. Invariants de sécurité et de non-régression

- Inventorier **les vrais writers** de Core, Settings, Portfolio, MarketData/Fundamental et autres bases avant d'imposer une barrière. Un Engine sans ACK ne doit pas être ignoré pour accélérer une sauvegarde.
- Aucun module d'initialisation pouvant créer une clé ne doit être chargé pendant un préflight lecture seule. **Absence de `client_master.key` avec données existantes = refus**, aucune génération automatique.
- **Wallet totalement gelé** : aucune génération de `wallet_master.key`, migration, lecture de seed, test de déchiffrement d'un secret réel ou exécution de WalletService. Un snapshot futur doit prendre en compte l'existence de données historiques sans les interpréter dans ce chantier.
- Le staging de fixtures est **non chiffré**, temporaire et fictif ; jamais exportable comme archive GEN-1. Une sauvegarde réelle future exigerait chiffrement, gestion des clés, permissions, tests de restauration et autorisation dédiée.
- Toute tâche de sauvegarde doit rester **hors chemin critique** des Engines ; la coordination au moment du snapshot est exceptionnelle, mesurée et peut provoquer une courte pause contrôlée. Aucune opération cryptographique lourde par tick.
- Échec d'un writer, timeout de lock, corruption, drift génération, manque d'espace ou mismatch clé => aucune archive complète publiée ; nettoyage borné de staging ; aucun contournement de RBAC.

## 5. Résultats P2.1 et garanties à construire en P2.2

- [x] Prototype coopératif sur fixtures isolées uniquement sous `/tmp`, avec validations de chemins/modes et libération de verrou après crash.
- [x] **26/26 tests P2.1 en réussite GitHub Actions** ([run 38501734180](https://github.com/florian74410/IA-Trading-Bot/actions/runs/38501734180)) et [RBAC success](https://github.com/florian74410/IA-Trading-Bot/actions/runs/38501734170) : 22 scénarios précédents + 4 tests d'archive AES-256-GCM fictive.
- [x] Conclusion documentée : **un writer non coopératif contourne le verrou advisory**, donc aucune garantie de coordination pour le runtime réel.
- [ ] **P2.2 :** inventaire exhaustif des écritures SQLite et hors SQLite, ACK multi-writers, démarrage/migrations, tests crashes/restarts et rollback.
- [ ] **P2.2 :** sauvegarde réellement cohérente sur copies autorisées, chiffrement de production, restauration vérifiée et contrôle de la clé client originale avant migration.
- [ ] **P2.2 / Phases 6–7 :** mesures de performance p95/p99 sur services et autorisation spécifique avant publication.

**P2.1 ne valide que les fixtures.** La [suite P2.2](AUTH_DEBUG_2.1_PHASE2_WRITER_COORDINATION.md) reste bloquante pour une intégration réelle ; **aucun changement de conteneur ni de donnée GEN-1**.
