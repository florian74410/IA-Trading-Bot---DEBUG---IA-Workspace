# IA-TB DEBUG 2.1 — Phase 2 / P2.1 — Préflight stockage et reprise Auth

> **État : P2.1 CLOS sur le périmètre de fixtures uniquement, avec 26/26 tests GitHub Actions en succès.** Voir [rapport de clôture](AUTH_DEBUG_2.1_P21_FIXTURE_VALIDATION_REPORT.md). **P2.2 OUVERT** pour la véritable coordination de tous les writers, restaurations autorisées et performances [plan P2.2](AUTH_DEBUG_2.1_PHASE2_WRITER_COORDINATION.md). Aucun accès, sauvegarde ni modification du GEN-1.  
> **Décisions validées par Overflow :** garder l'arborescence et les données existantes ; ne pas refondre ce qui fonctionne, améliorer l'isolation interne, **Wallet complètement gelé** ; pas de transfert de DB/données DEBUG ↔ RELEASE dans Auth 2.1.  
> **Sources :** [audit P1.5](../Security/AUTH_DEBUG_2.1_STORAGE_AUDIT.md), [backup/restore P1.5](AUTH_DEBUG_2.1_BACKUP_RESTORE_CONTRACT.md), [versions P1.6](AUTH_DEBUG_2.1_VERSION_COMPATIBILITY.md), [intégrité RBAC](../Security/AUTH_DEBUG_2.1_RBAC_POLICY_INTEGRITY.md).

## 1. But de P2.1

Obtenir un outil de préflight et une preuve de restauration reproductible **sur un environnement de test** avant toute future migration Auth ou redémarrage du Core. Ce point concerne la **continuité des comptes et de leurs données**, pas le passage DEBUG↔RELEASE ni le modèle Wallet.

**Inventaire GEN-1 déjà reçu, suffisant pour la conception :**

- 13/13 conteneurs en `1001:1001`, cinq volumes `:rw`, rootfs readonly ; les permissions interservices devront évoluer graduellement.
- `clients.sqlite` (mode DELETE dans la source) en `0600` ; identité client chiffrée liée à `client_master.key`, présent `0600`.
- Plusieurs autres SQLite en WAL (Settings/Portfolio/MarketData/Fundamental) ; `user_data.db` et `portfolio.db` en `0644` sous des répertoires `0700`.
- `wallet_master.key` absente : **ne jamais la générer, l'ouvrir, la restaurer ou tenter de déchiffrer une donnée Wallet** durant Auth 2.1.
- État observé : `clients=1`, `client_accounts=0` et `client_audit=1`. Ne pas supprimer l'identité historique ni créer d'ADMIN automatiquement.

## 2. Périmètre exact des essais

| Composant | Test sur copie/fixture fictive | GEN-1 réel |
| --- | --- | --- |
| `clients.sqlite` & `client_master.key` | Conservation des `clientId`, de la clé originale, intégrité SQLite et restauration à clé identique | Métadonnées déjà auditées ; aucune ouverture/écriture sans accord |
| `User Data/default/user_data.db`, `portfolio.db` | Backup SQLite WAL en ligne et contrôle des snapshots | Aucun checkpoint, chmod ni lecture du contenu privé |
| Autres DB SQLite métiers | Sauvegarde via SQLite Online Backup de fixtures représentatives et cohérence inter-DB explicite | Aucun parcours de bases privées ni copie en bloc |
| Clés CP1 internes | Vérification de l'existence/mode et maintien des permissions sur données de test | Secrets et contenu jamais lus ni exposés |
| Wallets, `wallet_master.key`, `client_wallets` | **Aucun test de manipulation Wallet** ; fixtures SQLite peuvent contenir un lien factice, sans appel WalletService ni clé réelle | **Gel absolu** |
| Stockage RELEASE | Fixture distincte facultative pour vérifier que les chemins ne se mélangent pas | **Aucun transfert DEBUG ↔ RELEASE** |

La restauration est un test de continuité **du même environnement**, jamais un outil de portabilité entre environnements.

## 3. Séquence technique de validation sur fixtures

1. Créer un dossier temporaire isolé (mode `0700`) avec DB clients factice, clé **factice** créée explicitement par le test, un `clientId` factice, schéma legacy `001/002` et comptes de test, et une DB en WAL avec écriture transactionnelle récente.
2. Vérifier par lecture de métadonnées que les dossiers et fichiers attendus sont présents, avec une liste blanche de chemins et interdiction de suivre un lien symbolique hors racine. **Ne pas importer `Core/Shared/paths.js` ou `ClientCrypto` pendant un préflight réel tant qu'ils peuvent générer des clés par effet de bord.**
3. Réaliser des SQLite Online Backups de chaque DB de test (`sqlite3.Connection.backup` ou `better-sqlite3.backup()`) pour inclure les données WAL sans effectuer un simple `cp` de fichier actif.
4. Capturer un **ensemble cohérent** de bases liées au même `clientId` via un gel d'écritures factice contrôlé. Un backup individuel ne garantit pas la cohérence **entre** huit bases : le banc de test doit démontrer la procédure retenue.
5. Construire un manifeste de snapshot **ne comportant pas de données personnelles ou de secret**, versions, tailles et checksum d'archives **chiffrées** ; vérifier `PRAGMA quick_check` et les contraintes sur copie.
6. Restaurer sur un autre dossier temporaire isolé sans publier de port et sans démarrer Trading LIVE ; vérifier le même `clientId`, le bon état de comptes factices, le déchiffrement possible uniquement avec la **clé factice d'origine**, pas avec une clé régénérée.
7. Injecter sur fixtures les erreurs effectivement couvertes : clé client absente/incorrecte, SQLite corrompu, FK invalide, génération inter-DB différente, interruption backup, symlinks, timeout et contournement du verrou coopératif, archive chiffrée altérée. **Tests espace disque plein, intégration RBAC et schéma de production inconnu restent à compléter dans P2.2 / jalons suivants.**
8. Détruire seulement le dossier de fixtures explicitement créé **par le test**. Ne jamais nettoyer un chemin GEN-1 ou un dossier utilisateur arbitraire.

## 4. Isolation future et performances

- Préparer une matrice `service -> DB/volume/secret -> RO/RW/absent`, remplacer les droits partagés uniquement quand un build séparé aura validé les dépendances réelles de tous les Engines.
- Core Auth seul conserve le minimum de permissions sur identités et clé client ; Gateway et Engines doivent être privés des secrets inutiles et des montages globaux.
- Garder le système historique opérationnel jusqu'à validation des tests de mise à niveau et du rollback ; pas de refonte du modèle Wallet.
- Sauvegarde hors boucle trading/collecte ; mesurer charge CPU/RAM, pause éventuelle de cohérence et delta p95/p99. Ne pas diminuer la sécurité pour satisfaire un benchmark.

## 5. Implémentation initiale et résultats locaux

- [Outil de préflight P2.1](../../Tools/CI/auth_storage_preflight.py) : le mode CLI ne réalise **que des `lstat` sur des chemins prédéfinis**. Aucun import de `paths.js`, de `ClientCrypto`, de `WalletService`, aucune lecture de clé et aucune ouverture SQLite en mode inventaire. Le rapport sort uniquement les types de fichiers, modes, UID/GID et blocages.
- [Tests P2.1](../../Tools/CI/test_auth_storage_preflight.py) : **26 cas** dont 14 initiaux, 6 de barrière, 2 de crash/contournement et 4 de chiffrement d'archive, sur un répertoire privé temporaire avec DB clients fictive créée depuis les migrations SQL historiques réelles `001`/`002`, Settings et Portfolio fictifs en WAL. Deux connexions WAL restent ouvertes pendant la sauvegarde et les fichiers `-wal` sont capturés par l'API SQLite Online Backup.
- Les sauvegardes et restaurations de tests sont **exclusivement internes à `/tmp` avec un marqueur de fixture** ; aucune sous-commande de backup/restore sur GEN-1 n'est fournie. Les copies sont normalisées en mode `DELETE` **sur la copie seulement**, avec `quick_check` et `foreign_key_check` ; le fichier source WAL n'est pas checkpointé par cet outil.
- La présence d'une clé **factice** correspondante est vérifiée par un canary HMAC synthétique ; **un 14ᵉ test supplémentaire invoque le vrai module `App/Core/Clients/client_crypto.js` exclusivement sur la fixture pour chiffrer et déchiffrer une identité fictive AES-256-GCM après restauration.** Une clé différente ne peut pas la déchiffrer. La capacité à reprendre une DB réelle n'est **pas prouvée** : le test ne doit jamais charger la clé client GEN-1. La procédure de gel multi-bases interservices reste à développer.
- **Essai local isolé (14/10/2026)** : `python3 -W error::ResourceWarning -m unittest discover -s Tools/CI -p 'test_auth_storage_preflight.py' -v` → **14/14 tests initiaux réussis**, puis [GitHub Actions](https://github.com/florian74410/IA-Trading-Bot/actions/runs/38498590581) **SUCCESS** sur Python 3.11/Node 22. Les **20/20 tests** ont été exécutés sur [GitHub Actions (run 38499587022)](https://github.com/florian74410/IA-Trading-Bot/actions/runs/38499587022) avec succès, y compris six tests supplémentaires de concurrence. Aucun Wallet ni GEN-1.
- **Ce que cela ne démontre PAS :** sauvegarde chiffrée exploitable de GEN-1, reprise de huit bases à une génération interservice atomique, capacité d'accéder aux **vraies données et à la vraie clé client GEN-1**, latence p95/p99 de trading, intégrité de l'ensemble des volumes, ni isolation Docker.
- **Verrou utilisateur :** aucun nouveau Docker DEBUG déployé sur GEN-1 tant que l'architecture Auth 2.1 n'est pas totalement implémentée/testée et que l'autorisation explicite d'Overflow n'a pas été obtenue.

## 5 bis. P2.1 — Barrière coopérative interbases (prototype non déployé)

Le [contrat technique de cohérence interbases](AUTH_DEBUG_2.1_COHERENT_SNAPSHOT_BARRIER.md) complète le préflight et les backups sur fixtures. Le nouvel outil utilise `fcntl.flock` sous le seul dossier temporaire de test :

- `fixture_writer_guard()` : verrou partagé pendant **toutes** les transactions de la génération fictive, même si plusieurs SQLite changent l'une après l'autre.
- `coherent_fixture_snapshot()` : verrou exclusif autour des validations de génération et des SQLite Online Backups ; un writer coopératif doit terminer avant la copie, et un writer nouveau attend la fin.
- `fixture_snapshot_barrier()` : méthode de test d'exclusivité ; expiration bornée, liens symboliques et modes de fichiers non sûrs refusés.
- Six tests supplémentaires de concurrence : interdiction d'un état inter-DB partiellement modifié, protection des writes concurrents, timeout sans snapshot, symlink/modes refusés, racine GEN-1 interdite, partage du verrou entre **processus OS distincts**.
- Les fichiers de verrou de fixture restent `0600`, privés, et ne contiennent aucun secret.
- **Très important : `flock` est advisory et ne protège que des writers qui le prennent volontairement.** Ces tests ne coordonnent pas nos 13 conteneurs réels. Un protocole `PREPARE/QUIESCED/RELEASE` orchestré avec ACK de tous les vrais Engines et Core reste indispensable, avec rollback et timeout lors d'un writer non coopératif. Aucun chemin de tick Trading ne doit faire de hash coûteux.

**Historique CI de la barrière de test (20 cas) :** [run P2.1](https://github.com/florian74410/IA-Trading-Bot/actions/runs/38499587022). **Dernière validation de P2.1 : 26/26 SUCCESS** ([run P2.1](https://github.com/florian74410/IA-Trading-Bot/actions/runs/38501734180)) et [RBAC SUCCESS](https://github.com/florian74410/IA-Trading-Bot/actions/runs/38501734170). Aucun nouvel accès GEN-1, pas de pause moteur réelle, Wallet inchangé.

## 6. Critères de clôture P2.1 (fixtures uniquement)

- [x] Préflight sans effet de bord sur chemins connus ; ne charge pas `paths.js`, `ClientCrypto` ni WalletService lors de l'inventaire.
- [x] Trois DB fictives, migrations Clients historiques `001/002`, journal SQLite WAL/DELETE et Online Backup validés.
- [x] Restauration sur une copie de fixture, `clientId` et identité AES-256-GCM de test préservés avec la bonne clé factice ; mauvaise clé refusée.
- [x] Barrière coopérative multiprocessus, timeout, crash, writer non coopératif, rollback de staging et détection de génération incohérente : scénarios de test validés.
- [x] Bundle de fixture **chiffré et authentifié AES-256-GCM** testé avec restauration après suppression du snapshot original de test. Tampering et mauvaise clé refusés sans restauration partielle.
- [x] **26/26 tests GitHub Actions success** ([run](https://github.com/florian74410/IA-Trading-Bot/actions/runs/38501734180)) ; [RBAC success](https://github.com/florian74410/IA-Trading-Bot/actions/runs/38501734170).
- [x] Clôture demandée par Overflow, **sans autorisation de toucher aux données ou conteneurs réels**. [Procès-verbal](AUTH_DEBUG_2.1_P21_FIXTURE_VALIDATION_REPORT.md).

**P2.1 clôturé comme étape sur fixtures, pas comme mécanisme de reprise de GEN-1.** Les preuves manquantes sont conservées dans [P2.2](AUTH_DEBUG_2.1_PHASE2_WRITER_COORDINATION.md) : **inventaire exhaustif des writers, coordination effective et ACK, JSONL/Annexes, tests crash/restart de la pile réelle, sauvegarde chiffrée restaurable sur copies autorisées et performances p95/p99.** Leur validation reste obligatoire **avant** tout déploiement. Wallet gelé ; aucune modification GEN-1/Contabo.
