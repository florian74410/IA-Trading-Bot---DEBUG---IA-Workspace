# IA-TB DEBUG 2.1 — P2.2 — Bundle multi-ressources chiffré (Clients / Settings / Portfolio / Annexes)

**Date :** 14/10/2026 — **branche :** `feature/debug-2.1-auth-design`.
**Statut : prototype isolé validé sur données synthétiques et quatre writers simulés ; NON intégré aux Engines et NON qualifié pour GEN-1.**

## Lot de développement consolidé

- Nouveau `App/Tools/CI/auth21_multi_resource_snapshot_trial.js`, **uniquement appelé par tests**, distinct de l'archive mono-base client déjà disponible. Utilise une unique instance `SnapshotCoordinator` existante — aucun bus ou microservice ajouté — avec liste fermée des participants **`clients`, `settings`, `portfolio`, `annexes`**.
- Tous les quatre participants doivent être enregistrés et répondre à `PREPARE/QUIESCED` avec `{epoch,writerId,pending:0}` avant que la moindre donnée soit capturée. Un participant absent, un ACK invalide ou un objet imitant le coordinateur provoque **ABORT sans archive**. Les writers dans les tests sont des `LocalSnapshotWriter`, **pas les services actifs**.
- Capture native de **trois fichiers SQLite distincts** (`clients-fixture.sqlite`, `settings-fixture.sqlite`, `portfolio-fixture.sqlite`) par `better-sqlite3.serialize()` en mémoire, avec les transactions WAL commitées, contrôles `integrity_check` et `foreign_key_check` avant sauvegarde. Les schémas Settings/Portfolio du banc sont **des schémas synthétiques minimaux**, non la preuve des migrations et formats réels des Engines.
- Deux chemins fictifs d'annexes autorisés **strictement par liste blanche** : `annexes/preferences.jsonl` et `annexes/notes/export.json`. Répertoires temporaires privés `0700`, fichiers `0600`, contrôle des symlinks/chemins, tailles bornées (12 Mio maximum par DB et 1 Mio par annexe, enveloppe totale de test bornée). Les annexes de tous les Engines ne sont **pas inventoriées exhaustivement**.
- La **clé maître clients originale** est vérifiée cryptographiquement contre les champs AES-256-GCM et index de recherche HMAC avant capture. La clé AES-256-GCM de transport reste **distincte** de la clé d'identité et ne figure pas dans l'archive.
- Un manifeste **dans le contenu authentifié** porte le numéro d'epoch, le nom de chaque ressource, sa taille exacte et son SHA-256. Une archive contenant une entrée supplémentaire, absente ou corrompue est refusée. Le fichier de sortie n'est publié qu'après chiffrement, par écriture temporaire privée + synchronisation du fichier + **création atomique sans remplacement** (`linkSync`, puis suppression du temporaire).
- À la restauration : AEAD validé avant extraction ; tailles et empreintes du manifeste contrôlées ; copie récupérée exclusivement dans un **nouveau dossier fictif privé** ; toutes les DB sont normalisées **sur copies restaurées uniquement** du mode WAL vers le journal `DELETE`, puis contrôlées par SQLite ; la DB Clients et la clé restaurée passent l'attestation AES-GCM/HMAC ; les références Wallet sont préservées. **Toute erreur supprime le staging** sans modifier aucune base source.

## Preuves CI

- **[GitHub Actions P2.2 SUCCESS — run 38542293574](https://github.com/florian74410/IA-Trading-Bot/actions/runs/38542293574)**, Node 22 : **20/20 tests du nouveau module**, **232/232 tests Node** au total et **15/15 tests SQLite Python**, soit **247/247 tests réussis**, zéro échec.
- `App/Tools/Tests/auth21_multi_resource_snapshot_trial.test.js` : vraie SQLite sur trois fichiers, WAL sur chacun, restauration de deux annexes, quatre ACK et libération, refus participant absent/en surplus/ACK incomplet, faux coordinateur, mauvaise clé transport/clé identité, corruption AEAD ou manifeste pourtant authentifié, corruption interne de DB Settings pourtant réauthentifiée, annexe absente, non privée, symlink ou trop volumineuse, absence de remplacement d'une archive ou restauration existante et restitution des tables de portefeuille.
- Le premier test WAL a révélé une interaction normale avec les fichiers auxiliaires quand on réouvrait une DB restaurée. Le correctif **normalise le mode journal sur les seules copies** avant validation ; relance entière de CI réussie.

## Limites et portes avant toute qualification métier

1. **P2.2 reste ouvert.** La cohérence entre Engines n'est **pas démontrée** par des ACK fictifs. Les vrais points d'écriture, flushs JSONL, fichiers annexes, migrations de démarrage et redémarrages doivent tous enregistrer leurs gardes et garantir `pending=0` au moment de l'ACK ; inconnus/non coopératifs = ABORT.
2. **Ressources fictives** : les schémas Settings et Portfolio sont de petits schémas de banc ; les deux chemins d'annexes sont des exemples, **pas l'inventaire complet**. Les autres SQLite et fichiers state/annexes du système doivent être catégorisés avant restauration réelle.
3. **Mémoire** : `serialize` et JSON/base64 constituent une stratégie réservée aux fixtures et petites DB. En production il faudra un streaming de sauvegarde SQLite cohérente et de chiffrement, avec quotas, durée de gel mesurée, disque et rétention.
4. **Secrets à la restauration** : la DB et la clé originale sont déposées en clair **uniquement dans l'espace de test privé** ; le bundle n'a pas de gestionnaire de clé transport (fournie en mémoire), d'authentification de l'opérateur système, de coffre, de politique de rétention ni d'effacement sécurisé. **NE PAS exécuter sur des données réelles.**
5. **Crash et durabilité** : la publication finale sans remplacement est atomique dans le banc ; crash pendant préparation/capture, fsync du répertoire, restauration multi-ressources sous panne disque, nettoyage de résidus et validation de génération interprocessus doivent encore être éprouvés.
6. **Performance et sécurité end-to-end** : p95/p99, échecs des Engines, IDOR/RBAC et restauration après redémarrage restent à valider selon l'arbitrage Overflow en Phase 6. Aucun `snapshotGate` branché dans les services actifs, aucun Docker GEN-1 et aucun fichier Wallet privé touché.

**Conclusion : lot Clients + Settings + Portfolio + Annexes, manifeste et rollback en échec validé sur 20 scénarios natifs ; Phase 2 et P2.2 toujours OUVERTS jusqu'aux intégrations et à la campagne globale Phase 6.**
