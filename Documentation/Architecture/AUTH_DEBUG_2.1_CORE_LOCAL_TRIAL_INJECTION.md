# IA-TB DEBUG 2.1 — Phase 2 — Raccordement Core-local des gardes de sauvegarde

**Date : 14/10/2026 — branche `feature/debug-2.1-auth-design`.**
**Statut : mode de raccordement opt-in sur dossier temporaire DEBUG testé en CI ; NON activé en runtime normal ni sur GEN-1.**

## Changements regroupés

1. `App/Core/Backup/auth21_core_local_trial_wiring.js` crée un seul `SnapshotCoordinator` local et quatre `LocalSnapshotWriter` nommés `clients`, `settings`, `mosaics` et `annex-root`. Les écrivains ont tous un enregistrement `prepare/release/abort`. Le module n'ouvre ni base ni serveur et n'expose aucun endpoint.
2. Le raccordement est impossible sans `IATB_AUTH21_LOCAL_SNAPSHOT_TRIAL=1`, `IATB_DEBUG_MODE=1`, sans bootstrap DEBUG automatique, et sans marqueur privé `.iatb-auth21-core-local-trial` situé dans un nouveau dossier système temporaire `iatb-auth21-core-runtime-*`, de droits `0700`. Les cinq chemins de runtime/données/annexes/updates/legacy doivent pointer sous ce dossier exact ; aucune redirection externe ou symlink préexistant de sous-dossier n'est acceptée. La vérification a lieu dans `App/Core/Server/server.js` **avant** le `require('../Shared/paths')`, lequel peut normalement générer des clés internes.
3. Sur ce mode uniquement, `server.js` passe `snapshotGate` à la construction de `SQLiteSettingsStore`, `ClientRepository` et `MosaicStore`, et contrôle `annex-root` avant sa création de `Annexes/Strategies`. Les clients et settings restent compatibles avec leur comportement précédent en l'absence du flag.
4. `App/Core/Clients/client_crypto.js` valide désormais un éventuel `snapshotGate` **avant** toute création ou `chmod` de `Security/client_master.key`. Dans le mode Core-local, le garde `clients` est aussi passé au constructeur `ClientCrypto`; les chemins de la base SQLite sont explicites. Cette protection ne crée pas de rotation de clé ni ne change le format des secrets.
5. Aucun coordinateur, route ou API HTTP de sauvegarde n'est ajouté au serveur normal. Aucune modification des services indépendants Portfolio/Fundamental/MarketData/Trading n'est activée : **ces Engines n'utilisent toujours pas ce coordinateur Core-local**.

## Résultats de la validation

- **[GitHub Actions P2.2 — SUCCESS, run 38556607421](https://github.com/florian74410/IA-Trading-Bot/actions/runs/38556607421)** : 84/84 tests historiques (81 + 3 `ClientCrypto`), **34/34** tests de startup/inventaire/Core local/mises à jour (14 + 13 + 7), 16/16 migration v3, 23/23 sessions, 24/24 ADMIN, 26/26 premier ADMIN/DEBUG, 22/22 clé/restauration, 20/20 bundle Clients, 20/20 bundle multi-ressources, 15/15 Python SQLite = **269/269 Node + 15/15 Python = 284/284**. Aucun échec.
- Les tests supplémentaires `auth21_core_local_trial_wiring.test.js` vérifient l'acceptation du seul contexte temporaire DEBUG, le rejet des modes non autorisés, des chemins détournés, permissions ou symlinks dangereux, les quatre ACK/écritures gelées, la libération et ABORT, le refus de créer Mosaics pendant le gel, et les points de raccordement du serveur par lecture de sa source **sans lancer de serveur**.
- Les trois nouveaux tests `client_master_key_safety.test.js` valident que la clé n'est pas créée ou chmod pendant un gel et que les gardes invalides échouent avant toute création de répertoire. Le comportement normal de `ClientCrypto` reste testé.

## Durcissement regroupé — Updates et IA Update Builder

- `App/Core/Updates/update_manager_v1.0.js` reçoit un mode de test `readOnlyTrial` strictement facultatif, déclenché uniquement par le Core-local autorisé. Le constructeur n'initialise plus les dossiers de staging ou le journal ; `record`, `newInboxPath`, `receiveUpload`, `download`, `inspectArchive`, `install`, `cleanupPreview` et `cleanupOld` ne produisent aucune mutation. Les API à callback retournent `AUTH21_UPDATES_READ_ONLY` avant toute ouverture de flux HTTP/ZIP.
- `App/Core/Updates/ai_update_builder_v1.0.js` utilise la même restriction. Aucune création du dossier `AI-Generated` au constructeur ; `applyPlan` et `validateGenerated` refusent directement ; `list` retourne une liste vide sans explorer le disque.
- `App/Core/Server/server.js` injecte `readOnlyTrial:!!AUTH21_LOCAL_WRITERS` dans les deux gestionnaires. L'assistant `installAIUpdate` vérifie également le mode avant toute copie locale.
- `App/Tools/Tests/auth21_core_updates_read_only_trial.test.js` valide **7 scénarios en sous-processus** dans des racines fictives : pas de création, upload/download/install refusés sans réseau, pas de nettoyage de rétention, pas d'archive IA, lectures inoffensives et initialisation historique inchangée hors du mode d'essai.
- Ces restrictions **ne prouvent pas** la couverture des scripts de maintenance et autres Engines : cette intégration reste un critère ouvert de P2.2.

## Frontières de sécurité à ne pas franchir

- Le flag d'essai **ne doit pas être utilisé pour lancer une instance exposée à des clients**. Il ne constitue pas une preuve que tous les writes de `server.js` et de ses dépendances sont bloqués ; les tests n'exécutent pas le serveur complet. Les autres chemins mutables et les scripts shell peuvent encore écrire.
- Un `LocalSnapshotWriter` bloque les opérations **du processus JavaScript qui le possède** ; il n'arrête pas une écriture directe d'un autre processus. Pas de gel du portefeuille ou des Engines distants démontré.
- L'activation normale de `paths.js`, du login legacy DEBUG, des scripts de démarrage et mises à jour reste inchangée ; éviter toute migration de schéma réelle tant que les writers et backs-ups multi-Engines ne sont pas coordonnés.
- La vraie sauvegarde/restauration complète, la gestion des erreurs de redémarrage, les rétentions, la protection transactionnelle de tous les supports et les mesures p95/p99 restent bloquantes et relèvent de la validation Phase 6 convenue avec Overflow.
- GEN-1, wallets privés, comptes réels, DB métiers et toutes les branches de publication sont restés inchangés.

**Conclusion : un mode de raccordement Core-local testé et volontairement limité aux fixtures ; P2.2 et la Phase 2 restent [ ] tant que les vraies dépendances runtime et les autres Engines ne sont pas couverts.**
