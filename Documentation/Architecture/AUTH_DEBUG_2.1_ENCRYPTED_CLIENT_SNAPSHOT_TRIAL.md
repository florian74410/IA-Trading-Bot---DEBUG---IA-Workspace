# IA-TB DEBUG 2.1 — P2.2 — Bundle chiffré client SQLite + clé maître (banc isolé)

**Date :** 14/10/2026 ; **branche :** `feature/debug-2.1-auth-design`.
**Statut : validé sur données fictives exclusivement, non branché au serveur et non qualifié comme sauvegarde globale des Engines.**

## Implémentation

- `App/Tools/CI/auth21_encrypted_snapshot_trial.js` est un adaptateur de test **uniquement pour les fixtures** sous `/tmp/iatb-auth21-v3-*` : racine privée `0700`, marqueur dédié `0600`, chemins bornés, refus des clés non privées/symboliques. Pas d'import par le runtime ni de route Web ou commande GEN-1.
- **Capture cohérente coopérative :** `SnapshotCoordinator` doit connaître le writer `clients` et obtenir `PREPARE/QUIESCED` avant l'image ; missing writer ou ACK invalide = **ABORT sans archive**. Avec `better-sqlite3.serialize()`, l'image SQLite — y compris les transactions WAL commitées — est produite **en mémoire**, sans copier de fichier source SQLite brut dans un nouveau staging pendant la capture. Le writer est relâché après capture ; aucun autre moteur/processus n'est encore coordonné.
- **Preuve pré-chiffrement :** pendant le gel, l'outil réouvre la source en lecture seule et prouve que la clé maître d'origine déchiffre effectivement les champs AES-256-GCM et reproduit les index HMAC email/username ; clé erronée ou ciphertext corrompu = **aucune archive produite**.
- **Chiffrement :** clé de transport AES-256-GCM aléatoire de 32 octets, distincte de la clé maîtresse des identités. AAD lie l'enveloppe à `IA-TB-AUTH21-ENCRYPTED-CLIENT-TEST-1`. Un **unique fichier chiffré privé `0600`** contient l'image SQLite + la clé maître d'origine + empreintes internes, jamais la clé de chiffrement transport ni des contenus clients en clair. Taille DB bornée 12 Mio, enveloppe bornée 18 Mio (limites de test, pas profil de production).
- **Restauration :** authentification AEAD **avant** écriture ; validation d'un schéma de paquet fixe et de ses empreintes ; extraction dans un **nouveau** dossier privé réservé aux fixtures ; vérification SQLite `integrity_check`/FK, AES-GCM des identités et HMAC des index avec la clé d'origine à l'aide de `attestRestoredPairFixture`. En cas d'échec, suppression du staging fictif, refus de succès et absence de modification de la DB source.
- Ce nouvel adaptateur est séparé du premier `Tools/CI/fixture_aead_bundle.js` P2.1 : celui-ci prouvait le mécanisme AEAD sur des canaris fictifs de 3 DB, tandis que cet adaptateur contrôle une **vraie enveloppe chiffrée `ClientCrypto` et sa clé**. Le rapprochement en **un outil de sauvegarde unique et complet** reste à concevoir pour l'intégration Phase 6.

## Preuves GitHub Actions

- [GitHub Actions P2.2 — SUCCESS, run 38538904645](https://github.com/florian74410/IA-Trading-Bot/actions/runs/38538904645) : **20/20 tests `auth21_encrypted_snapshot_trial.test.js`**, plus 81 writer/key, 16 migration/CAS, 23 sessions, 24 ADMIN, 26 création ADMIN/DEBUG, 22 récupération de clé et 15 SQLite Python : **212/212 Node + 15/15 Python = 227/227 réussis** sur Node 22.
- Cas validés : authentification/déchiffrement de la base restaurée, clés maîtres et transport séparées, WAL et deux clients, corruption de tag/ciphertext, mauvaise clé de transport, archive déjà existante, refus du writer absent ou sans ACK, retour à l'état writable après RELEASE, source AEAD corrompue/clé source erronée, permissions, marker, symlinks, archive à permissions trop larges, et **archive AEAD valide mais clé interne incompatible** rejetée avec nettoyage du staging.

## Limites bloquantes — Phase 2 toujours OUVERTE

1. **Pas de cohérence inter-Engines démontrée.** Seul `clients` participe au coordinateur de test. Les vrais writers SQL/JSONL/Annexes et démarrages, ainsi que leurs volumes séparés, ne sont ni gelés ni restaurés par ce module.
2. **Taille et mémoire :** sérialiser toute une DB en mémoire convient uniquement aux petites fixtures. Le pipeline runtime exigera une capture incrémentale/chiffrement en streaming, gestion des quotas et surveillance mémoire/disque ; aucun bench p95/p99 GEN-1 n'a été réalisé.
3. **Restauration fictive seulement :** le dossier de restauration contient temporairement une DB et une clé d'identité en clair, uniquement avec clés et comptes inventés. Ne jamais exécuter ce module sur une copie cliente réelle, ni présenter ce chemin comme un outil de backup métier.
4. **Transport et secrets :** la clé AES de sauvegarde est fournie de l'extérieur et n'est pas gérée par le module ; la politique opérateur OS, coffre, rotation, rétention, destruction sûre et transferts SSH restent à spécifier et vérifier.
5. **Rollback global à démontrer :** cohérence `clients + settings + portfolio + state + annexes`, preuve de génération, clé originale, récupération après crash/interruption, writer non coopératif et tests multi-processus renvoyés à la campagne d'intégration Phase 6 selon arbitrage Overflow.
6. **Aucune activation de `auth21_schema_v3` ou de nouveau login sur DEBUG/GEN-1**, aucun déploiement Docker et aucun accès aux wallets privés. Toujours obtenir autorisation explicite avant toute opération sur GEN-1.

**Conclusion : le sous-composant « archive client chiffrée avec clé d'origine » est testé sur bases fictives ; P2.2 et la Phase 2 restent ouverts avant cohérence interservices, intégration et validation complète.**
