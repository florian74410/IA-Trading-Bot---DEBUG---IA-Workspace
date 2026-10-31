# IA-TB DEBUG 2.1 — P1.5 — Contrat de sauvegarde, reprise et protection des clés

> **Statut :** spécification de conception à valider, **aucune sauvegarde/restauration exécutée**.  
> **Sources :** [inventaire P1.5](../Security/AUTH_DEBUG_2.1_STORAGE_AUDIT.md), `compose.debug.stack.yml`, `Core/Shared/paths.js`, rapport réel GEN-1 du 13/10/2026.  
> **Objectif :** préserver `clientId`, comptes, historiques, paramètres, clés maître et données wallet sans interruption excessive des moteurs, avec récupération vérifiée sur un espace isolé.  
> **Bornes :** pas de modification Contabo (port HTTP 8080 limité à l'IP publique de l'opérateur selon sa déclaration), pas d'ouverture réseau, pas d'ordres LIVE, pas de suppression/rotation de clés, pas d'arrêt ou de migration de GEN-1 sans nouvelle autorisation.

## 1. Stratégie retenue

**Principes :**

1. **Inventorier avant de copier** : découvrir les DB `*.sqlite`/`*.db` et dépendances dans les volumes DEBUG connus ; refuser symlink, accès hors racines autorisées et fichier anormal. Un manifeste indique chaque rôle, chemin relatif, taille, version de schéma (non sensible), date de capture et cohérence.
2. **Sauvegarde transactionnelle de chaque SQLite** : utiliser l'API `sqlite3.Connection.backup` de Python 3 ou `better-sqlite3.backup()` côté Node sur une **connexion à la DB d'origine autorisée**, vers une destination créée en mode privé, puis `PRAGMA quick_check` sur la copie et fermeture propre. Cette méthode prend en compte les transactions WAL et évite un simple `cp` du fichier vivant.
3. **Cohérence inter-bases** : une Online Backup individuelle ne garantit pas la même heure logique pour huit DB. Pour une migration de schéma/une reprise garantissant `clients` + `settings` + `portfolio`, prévoir un bref **gel des écritures métier supervisé** ou autre mécanisme applicatif de génération cohérente, à concevoir et tester ; ne pas arrêter les services pendant la phase de conception. Les lecteurs de marché peuvent continuer sur cache tant que la cohérence est garantie et que le mode maintenance est explicitement activé.
4. **Clés séparées mais liées au snapshot** : archiver `client_master.key`, `wallet_master.key` si présentes et les coffres legacy **dans un composant chiffré**, avec l'identifiant de génération du snapshot ; ne jamais recopier les clés dans Git, sur un chat ou dans les logs. Une clé manquante **avec données préexistantes** bloque la restauration avant tout démarrage, sans auto-génération.
5. **Périmètre de l'archive** : DB, `state/` pertinent, `runtime/state/security` le cas échéant, références de version d'image/Compose, annexes et mises à jour nécessaires ; classification claire `indispensable` / `reconstructible` / `diagnostic`. Les fichiers WAL/SHM ne doivent pas être copiés indépendamment avec des DB online backup.
6. **Confidentialité** : emplacement de staging `0700`, fichiers `0600`, transfert SSH autorisé, sauvegarde authentifiée **chiffrée avant stockage durable ou hors VPS**, clé/mot de passe de backup hors archive ; identité Linux de restauration limitée ; empreinte SHA-256 uniquement sur l'archive **déjà chiffrée** pour détecter corruption lors du transport.
7. **Validation par restauration** : restauration complète sur **copie isolée**, services HTTP non publiés, Trading LIVE désactivé, absence de port d'exécution et de credentials de marché réels ; vérifier DB/association `clientId`/comptes, capacité de déchiffrement avec les clés originales dans un test isolé, schémas et événements. Aucune restauration en place avant approbation explicite.

## 2. Séquence de sauvegarde future (Phase 2 / préparation GEN-1)

```text
[PRECHECK lecture seule]
  ├─ compare racines attendues et volumes montés, versions / permissions
  ├─ valide que clés requises sont présentes, lisibles par identité du service uniquement
  └─ relève les DB et l'état du mode WAL/DELETE sans toucher aux enregistrements
        |
        v
[TRANCHE CONSISTANTE autorisée]
  ├─ active barrière d'écritures de l'application (courte ; confirmée)
  ├─ Online Backup SQLite de toutes les DB critiques -> staging privé
  ├─ capture de l'état legacy, clés liées aux DB, manifeste horodaté
  └─ relâche barrière après confirmation de la cohérence
        |
        v
[VALIDATION HORS DU CHEMIN CRITIQUE]
  ├─ quick_check, FK, schéma et compatibilité de génération sur copies
  ├─ chiffrement authentifié du paquet, signature/manifeste et contrôle de taille
  ├─ transfert vers un emplacement sécurisé hors GEN-1
  └─ test de restauration sur copie isolée ; puis politique de rétention
```

**Interdits :** une archive `tar` de DB ouvertes supposée transactionnellement cohérente ; `PRAGMA wal_checkpoint(TRUNCATE)` forcé sur services en activité ; `cp` d'une clé à un endroit partagé ; scripts `rm -rf` sur racines de données ; téléchargement d'un backup brut via l'UI HTTP 8080 ; `docker compose down/up` pour un simple préflight.

## 3. Séquence de restauration future (sur copie d'abord)

| Étape | Condition de validation |
| --- | --- |
| Autorisation et isolation | Opérateur identifié, environnement de TEST séparé de DEBUG et RELEASE ; aucun service LIVE ni port public |
| Vérification archive | Chiffrement authentifié valide, signature/empreinte de l'archive, manifeste cohérent et chemins bornés |
| Clés et coffres | Présence de la clé d'origine **avant** ouverture des DB chiffrées ; refus en cas de divergence ; ne jamais régénérer silencieusement |
| SQLite | Chaque DB récupérée en accès local isolé, `quick_check` OK, `foreign_key_check` OK si FK actives, migrations contrôlées |
| Identités | Valeurs `clientId` stables, 1 client historique présent, aucune création automatique d'un ADMIN fictif, liens vers wallet/settings intacts |
| Comptes/rôles | `client_accounts` inchangée jusqu'à création explicite d'un ADMIN et migrations validées ; séparation DEBUG / RELEASE stricte |
| Contrôle métier | Préférences, 0 ou plusieurs wallets, historique portfolio et documents pertinents récupérables sans fuite de secrets |
| Rollback | Capturer l'état précédent avant toute activation ; procédure inverse écrite, non destructive, testée sur copie |
| Mise en production | Jamais automatique ; approbation ultérieure spécifique à la cible GEN-1 et aux vérifications de sécurité |

### Pourquoi l'archive et la clé doivent voyager ensemble conceptuellement

L'identité est chiffrée en AES-256-GCM avec une clé maître ; elle sert aussi indirectement à calculer les index de recherche HMAC. Une nouvelle clé casserait la récupération des identités et la recherche cohérente par email/username, même si la base SQLite est intacte. La même protection s'applique aux secrets Wallet chiffrés. **Le système doit refuser une reprise incomplète plutôt que prétendre avoir initialisé un nouveau compte sain.**

## 4. Politique de backup à tester

| Classe de données | Fréquence proposée (à confirmer) | Rétention minimale proposée |
| --- | --- | --- |
| Avant migration Auth/schema/clé/deploy | **Snapshot obligatoire immédiatement avant changement** | Conserver jusqu'à validation et rollback contrôlé |
| Identités et wallets chiffrés | Quotidien hors plage sensible, ou après changement administratif | Copies journalières récentes + historique hebdomadaire, selon stockage chiffré disponible |
| Settings, portfolio et Fundamental | Quotidien / après changement important | Rétention bornée + vérification d'intégrité régulière |
| Télémétrie MarketData reconstructible | Selon coût de stockage et besoin d'audit | Politique distincte pour éviter backups trop lourds |
| Test de restauration isolée | Avant le premier déploiement 2.1, puis périodiquement | Rapport d'intégrité et de restauration sans données sensibles |

**RPO/RTO** à fixer après essai : proposition initiale **RPO ≤ 24 h** en routine et snapshot impératif avant migration ; **RTO cible ≤ 60 min** pour restauration testée. Ces durées ne constituent **aucune garantie** sans outillage, rétention et test chronométré. Une copie sur le même VPS n'est pas un backup suffisant en cas de perte totale du VPS.

## 5. Permissions et isolation avant implémentation

La disposition actuelle (cinq volumes `:rw` présents sur chaque conteneur avec UID/GID communs) privilégie la simplicité d'accès ; elle **n'isole pas les clés de comptes** d'un Engine compromis. Modèle cible :

| Service | Lecture/écriture nécessaire | À interdire quand possible |
| --- | --- | --- |
| Core Auth / administration CLI native | DB clients, clés client, sessions, audit ; utilisateur OS à droits limités | Écriture en libre accès aux données MarketData sans besoin |
| Wallet service (phase ultérieure) | Clés wallet sous autorité strictement bornée, données wallet privées | Clé wallet montée dans tous les Engines |
| Fundamental/MarketData/Portfolio | Leurs propres SQLite, logs et états nécessaires | Lecture des clés maîtres Auth/wallet et coffre API |
| Gateway | Pages/UI, socket ou client réseau Auth contrôlé | Montage des clés, accès brut à `clients.sqlite` |
| Router/Engines | Secrets d'identité machine limités au rôle, capacités signées vérifiables | Fichiers de session, clé privée signataire Core, données des autres clients |
| Sauvegarde | Accès `backup` minimal requis, écriture en staging privé, validation sur copie | Génération de nouvelles clés maîtres, commandes Docker arbitraires, lecture exposée au Web |

Mettre en place des UID/permissions et montages adaptés **avec migration progressive, tests de connectivité et rollback** ; ne pas remplacer tous les mounts instantanément au risque de casser IA-TB.

## 6. Mesures de performance attendues

- Online Backup sur connexions dédiées, avec cadence et charge mesurées ; éviter les checkpoints/travaux disque lourds dans la boucle de trading.
- Sauvegarde de DB très actives (télémétrie) par morceaux/pauses contrôlées si le backend le permet ; surveiller les WAL et l'espace disque avant démarrage.
- Temps du gel inter-bases à mesurer, objectif **le plus court possible** sans supprimer la garantie de cohérence ; pas d'ordre LIVE.
- Benchmarks selon [Security Performance Plan](../Security/AUTH_DEBUG_2.1_SECURITY_PERFORMANCE.md) ; aucune régression notable du p95/p99 des traitements marché par les tâches de sauvegarde.

## 6 bis. Confrontation au déploiement observé

Le [diagnostic GEN-1 du 14/10/2026](../Security/AUTH_DEBUG_2.1_STORAGE_AUDIT.md#6-réconciliation--permissions-et-montages-réellement-actifs-sur-gen-1-14-octobre-2026) confirme que les 13 conteneurs exécutent `1001:1001` avec rootfs en lecture seule **et les cinq volumes persistants montés en écriture**. Les racines sont en `0700`, la DB client et les clés existantes en `0600`, mais les DB Settings/Portfolio en `0644` et le répertoire `runtime/state/security` en `0755`. La permission des parents protège contre d'autres UID sur l'hôte ; **pas** contre les services sous le même UID. La clé `wallet_master.key` est absente du chemin attendu ; ne pas inférer absence de données wallet et ne pas la générer. Les fichiers legacy vérifiés dans `state/` sont absents.

**Décision cible :** faire une copie/sauvegarde sûre et tester sa restauration **avant** tout changement d'UID, de chemin ou de permission. Préserver le fonctionnement de l'existant, puis réduire les volumes accessibles au Gateway/Engines et durcir les dossiers secrets sur un build isolé. Toute action nécessitant les clés maîtres doit échouer en sécurité si elles ne sont pas disponibles avec les données préexistantes. Aucun durcissement appliqué au VPS dans P1.5.

## 7. Portes de validation

**P1.5 — Conception et inventaire, sans opération de sauvegarde réelle :**

- [x] Emplacements et journaux SQLite (WAL/DELETE) repérés.
- [x] Risques de clés, wallets legacy, identités et liens logiques identifiés.
- [x] Stratégie de sauvegarde/reprise/rollback sur copies spécifiée, coûts/performances considérés.
- [x] Permissions et montages réels GEN-1 du 14/10/2026 inspectés sans lire les secrets.
- [x] Overflow approuve le 14/10/2026 la stratégie de sauvegarde et la correction d'isolation interservices, avec conservation de ce qui fonctionne déjà et gel du chantier Wallet.
- [x] P1.5 coché après revue du rapport réel et approbation du contrat ; mise en œuvre et restauration à tester plus tard.

**Décision spécifique Wallet (14/10/2026) :** pas de nouvelle clé wallet et aucune opération de génération, import, conversion, rotation, migration, suppression, déchiffrement ou restauration de secret wallet dans DEBUG 2.1 Auth. Préserver les références existantes ; les futures évolutions du modèle Wallet nécessiteront un projet et une autorisation distincts. Le plan de sauvegarde couvre la conservation des fichiers déjà présents, sans toucher aux contenus ni créer de clé absente.

**Implémentation et preuve de restauration réelle (Phases 2 et 7) :** toute écriture/sauvegarde/reprise sur GEN-1 requiert une autorisation séparée. Les prototypes et leurs tests devront fonctionner sur DB factices ou copies isolées.
