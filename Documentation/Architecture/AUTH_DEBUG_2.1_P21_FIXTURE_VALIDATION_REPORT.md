# IA-TB DEBUG 2.1 — P2.1 — Procès-verbal de validation sur fixtures

> **Décision du 14/10/2026 : P2.1 TERMINÉ dans son périmètre explicite de préflight + sauvegarde/restauration de bases SQLite **fictives et isolées**.** Overflow a demandé de faire le nécessaire pour clore le point ; aucune autorisation de déploiement ou d'accès aux bases réelles n'en découle.  
> **Branche :** `feature/debug-2.1-auth-design`, PR #5 en brouillon.  
> **Évidence CI :** [Auth P2.1 Storage Fixture Tests — GitHub Actions SUCCESS](https://github.com/florian74410/IA-Trading-Bot/actions/runs/38501734180), `P2.1 SQLite fixtures — readonly preflight and rollback`, Python 3.11 + Node 22 ; [RBAC CI — SUCCESS](https://github.com/florian74410/IA-Trading-Bot/actions/runs/38501734170).  
> **Important :** une réussite sur données de test ne prouve **ni** une sauvegarde correcte des données GEN-1, **ni** un dispositif coordonné couvrant tous les moteurs.

## 1. Définition contractuelle du jalon clos

**P2.1 — « Préflight et sauvegarde/restauration SQLite cohérente sur fixtures isolées ».**

Le livrable est un **prototype testable de reprise d'identité**, sans utilisation ni lancement des modules d'initialisation susceptibles de générer des secrets sur le serveur réel :

| Contrôle | Démonstration réelle dans la CI |
| --- | --- |
| Préflight sans effet de bord | Inspection `lstat` des chemins autorisés, sans ouverture de clé ni SQLite et sans import runtime |
| Données de test | `clients.sqlite` basé sur les migrations SQL `001/002` d'IA-TB, `user_data.db` et `portfolio.db` fictives ; aucun compte réel |
| Journal SQLite | Base clients en `DELETE`, deux autres en `WAL` ; Online Backup de transactions de test validées |
| Identité persistante | `clientId` fictif conservé à la restauration, HMAC-canary de test et réelle méthode AES-256-GCM `ClientCrypto` sur fausse identité/fausse clé |
| Sécurité de la restauration | Refus d'une clé fictive absente/incorrecte, d'une DB corrompue, d'une FK violée ou d'une génération interbases divergente |
| Concurrence | Verrou coopératif interprocessus `fcntl.flock`, timeout fail-closed, attente avant snapshot, nouveau writer bloqué durant la copie |
| Crash / bypass | Verrou relâché après crash d'un processus ; **preuve explicite qu'un writer non coopératif contourne un verrou advisory** ; détection d'un drift de génération fictif |
| Protection de fichiers | Symlink, chemins hors sandbox, modes du lock non sûrs et root non marqué refusés ; staging partiel nettoyé |
| Archive de test authentifiée | **AES-256-GCM** avec clé de test éphémère : archive restaurée après suppression du snapshot en clair de fixture ; mauvaise clé et ciphertext altéré rejetés |
| Conservation du Wallet | Aucun `wallet_master.key` généré, aucun import/test du service Wallet ; Trading LIVE jamais lancé |

**Résultat : 26/26 tests P2.1 au vert dans GitHub Actions**, incluant quatre nouveaux cas d'archive chiffrée sur les 22 tests précédents. Le contrôle statique RBAC reste également vert.

### Commandes et preuves

```bash
python -m py_compile Tools/CI/auth_storage_preflight.py Tools/CI/test_auth_storage_preflight.py
node --check Tools/CI/fixture_aead_bundle.js
python -W error::ResourceWarning -m unittest discover -s Tools/CI -p 'test_auth_storage_preflight.py' -v
```

Les fichiers livrés :

- `Tools/CI/auth_storage_preflight.py` : inspection et primitives de backup **sur fixtures uniquement**, sans commande de backup de GEN-1.
- `Tools/CI/fixture_aead_bundle.js` : chiffrement et déchiffrement **exclusivement de fixtures marquées en répertoire temporaire privé** ; clé éphémère passée par stdin, non conservée. **Ce script n'est pas destiné aux sauvegardes réelles** : gestion de clés, format pérenne, taille streaming et audit cryptographique non validés.
- `Tools/CI/test_auth_storage_preflight.py` : 26 tests sur identité et données fictives.
- `.github/workflows/auth-p21-storage-fixtures.yml` : CI Python 3.11 / Node 22.

## 2. Ce que P2.1 ne prouve pas et ne doit surtout pas masquer

1. **Coordination de production ABSENTE** : `flock` n'empêche pas un writer non coopératif. Tous les vrais writers Core, Fundamental, Portfolio, MarketData, JSONL/Annexes/State, startup, migrations et retenues n'ont pas encore un coordinateur d'ACK effectif.
2. **Cohérence globale GEN-1 NON prouvée** : seuls trois SQLite fictives participent. GEN-1 comprend huit DB détectées et des fichiers persistants hors SQLite, sans inventaire exhaustif de tous les processus qui les modifient.
3. **Sauvegarde réelle NON implémentée** : les snapshots de fixture internes peuvent exister en clair temporairement dans un répertoire de test et utilisent des clés fictives. Ni chiffrement de backup réel, ni politique de rétention, ni restauration client sur copie autorisée, ni conformité opérationnelle prouvée.
4. **Performance de la pile de trading NON mesurée** : pas de p50/p95/p99 comparatif interservices, pas de profilage de pauses métier en conditions de charge, pas de benchmark réseau.
5. **Auth/RBAC runtime NON actifs** : P2.1 ne supprime aucun bypass du code historique, ne protège pas encore les montages Docker interservices, et ne publie aucun build.

Ces **obligations ne sont pas considérées comme accomplies** : elles sont conservées sous le jalon distinct **P2.2 — coordination et restauration multi-services sur banc isolé**, puis dans les critères transverses des Phases 6–7.

## 3. Portes de clôture P2.1

- [x] Préflight réellement sans effet de bord sur répertoires privés de test.
- [x] Backups SQLite `WAL`/`DELETE` et restauration sur fixture vérifiés.
- [x] Identité fictive + clé originale fictive et AES-GCM `ClientCrypto` vérifiés.
- [x] Tests négatifs perte de clé, corruption, incohérence, crash/verrou, writers non coopératifs, chemins non sûrs.
- [x] Archive **fictive** authentifiée chiffrée, reprise et refus tampering/mauvaise clé.
- [x] 26 tests et contrôle RBAC en succès sur **GitHub Actions**, pas uniquement une simulation locale.
- [x] Accord général d'Overflow pour clore P2.1, sans aucune autorisation de toucher au VPS.

**Décision : clôturer P2.1 comme étape de prototype/fixtures ; ouvrir P2.2 pour toutes les garanties réelles qui restent à construire.** Aucun code Core/Router/Engine de production n'a été modifié par ce prototype, aucun conteneur GEN-1 redéployé.

## 4. Verrou de déploiement inchangé

**INTERDICTION de publier/déployer un nouveau Docker DEBUG sur GEN-1 tant que TOUT le système Auth 2.1 n'est pas implémenté, intégré, testé, performant et explicitement validé par Overflow.** Wallet gelé ; pas de migration entre DEBUG et RELEASE ; règles Contabo et port HTTP 8080 inchangés.

La clôture de **P2.1** ne donne en aucun cas droit à un déploiement, une sauvegarde réelle, une migration, une restauration, une rotation de clé ni l'ouverture d'un service.
