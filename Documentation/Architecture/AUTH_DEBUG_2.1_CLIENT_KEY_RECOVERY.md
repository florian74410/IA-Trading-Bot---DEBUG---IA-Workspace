# IA-TB DEBUG 2.1 — Phase 2 — Master Key client : restauration et preuve cryptographique

**Date :** 14/10/2026 — branche `feature/debug-2.1-auth-design`.
**État : contrôles sur BASES SYNTHÉTIQUES TEMPORAIRES VALIDÉS ; sauvegarde/restauration réelle et migration runtime NON ACTIVÉES.**

## Modifications apportées

- `App/Core/Clients/client_crypto.js` : `decodeMasterKey` exige exactement **64 caractères hexadécimaux** (32 octets), avec seulement le blanc de début/fin autorisé. `Buffer.from(...,'hex')` seul pouvait tronquer silencieusement un suffixe corrompu ; tout contenu invalide est désormais refusé sous `CLIENT_MASTER_KEY_INVALID`. Le verrou existant sur base SQLite, fichiers `-wal/-shm/-journal` et clé absente est conservé.
- `App/Tools/CI/auth21_key_restore_trial.js` : **outil de banc exclusivement fictif**, qui refuse les DB hors répertoires temporaires `iatb-auth21-v3-*`, clé étrangère au dossier, permissions clé autorisant group/others, lien symbolique de clé et lien symbolique indirect via répertoire parent. Requiert SQLite avec FK activées et clé préexistante au format canonique.
- Le banc prouve la clé sur les **vraies enveloppes AES-256-GCM** de `clients`, `client_accounts`, `client_preferences` et audits, y compris vérification HMAC des index déterministes de `email_hash` et `username_hash` ; si aucune empreinte/index ne permet de prouver la clé, il refuse de conclure (`AUTH21_RESTORE_KEY_UNPROVEN`).
- `backupRestoreFixture` effectue `better-sqlite3.db.backup()` (compatible WAL), vérifie que la clé n'a pas changé, copie la clé maître **uniquement dans un sous-dossier de fixtures privé** et effectue une seconde restauration SQLite séparée. Le contrôle compare digest de toutes les tables clients avant/après, quantité de champs déchiffrables, preuves d'index HMAC et nombre de références Wallet.
- `attestRestoredPairFixture` permet une **vérification indépendante en lecture seule** d'un couple base restaurée/clé maîtrisée à l'intérieur du dossier fictif. Il prouve la compatibilité de cette paire mais **pas** l'identité avec un snapshot original sans empreinte de référence séparée.
- Refus observés dans les fixtures : mauvaise clé hex valide, clé manquante, clé malformée/tronquée/suffixée, ciphertext/tag AES-GCM altéré, email/username index incohérent, base vide (preuve impossible), duplication de destination, chemin externe, mauvaises permissions et échappement par symlink de clé ou de dossier.

## Validation reproductible

- **[GitHub Actions P2.2 SUCCESS — 38536276833](https://github.com/florian74410/IA-Trading-Bot/actions/runs/38536276833)**, Node.js 22 : **22/22 nouveaux tests de restauration**, 81/81 tests des writers et clés préexistants, 16/16 migration/CAS, 23/23 sessions, 24/24 administration, 26/26 premier ADMIN/DEBUG, 15/15 SQLite Python. **192/192 Node.js + 15/15 Python = 207/207 tests réussis**.
- `App/Tools/Tests/auth21_key_restore_trial.test.js` utilise des identités et champs AES-256-GCM réellement chiffrés avec une **clé aléatoire éphémère de fixture**, et des tables SQLite natives incluant un essai WAL. Les liens Wallet sont des identifiants publics factices sans secret.
- La compatibilité de la **clé réelle de GEN-1** ou des anciennes données du service actif **n'a pas été évaluée** : aucune lecture, copie ou migration autorisée à ce stade.

## Limites de sécurité et conditions de validation finale

1. Dans ce banc, la base et la clé sont des copies **non chiffrées au repos dans un répertoire temporaire fermé (mode 0700, clé 0600)**. **NE JAMAIS** utiliser le banc avec des données réelles : l'outil ne constitue pas une sauvegarde chiffrée ni une méthode de transfert sécurisée.
2. Phase 2 / Phase 6 : coupler les instantanés SQLite à un coffre chiffré/authentifié pour DB + key originelle + métadonnées, vérifier l'intégrité d'un paquet restauré, protéger l'accès au stockage, garder distinctes les clés de chiffrement du bundle et les clés d'identité.
3. Valider sur **copie autorisée** la compatibilité des anciens enregistrements, de tous champs `*_enc`, des rôles, `wallet_links`, du protocole CLI et des archives annexes avant aucune opération runtime.
4. Garantir que **toutes les mutations** et writers actifs passent par le coordinateur interservices et vérifier les états exceptionnels de `paths.js` au chargement. Mesurer p95/p99 et simuler crash/restart/rollback sur banc isolé complet.
5. Avant migration réelle : refuser toute restauration si clé absente/illisible/non prouvée ; préserver l'ancienne clé originale, ne pas auto-créer de nouvelle clé, éviter toute action métier lors du préflight ; accord explicite d'Overflow requis avant GEN-1.

**Statut de la Phase 2 : toujours OUVERTE**. Les preuves cryptographiques de restauration sont désormais testées sur fixtures ; pas encore de garantie de restauration complète de production.
