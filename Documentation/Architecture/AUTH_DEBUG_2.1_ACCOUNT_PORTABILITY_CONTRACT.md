# ARCHIVE — IA-TB DEBUG 2.1 — P1.8 — Ancienne proposition de portabilité des comptes DEBUG ↔ RELEASE

> **STATUT : ABANDONNÉ / SUPERSEDED par la décision d'Overflow du 14/10/2026.** Ne pas implémenter les exports/imports ci-dessous, et ne pas en faire des exigences de conception, de tests ni de déploiement. Document conservé **uniquement comme historique** ; voir [checklist officielle P1.8](AUTH_DEBUG_2.1_WORKPLAN.md).  
> **Lien roadmap :** [AUTH_DEBUG_2.1_WORKPLAN](AUTH_DEBUG_2.1_WORKPLAN.md) ; [versionnage P1.6](AUTH_DEBUG_2.1_VERSION_COMPATIBILITY.md) ; [RBAC P1.7](AUTH_DEBUG_2.1_RBAC_CONTRACT.md) ; [sauvegardes P1.5](AUTH_DEBUG_2.1_BACKUP_RESTORE_CONTRACT.md).  
> **Principe :** transfert **volontaire** d'une identité et d'un accès de compte entre environnements **distincts**, jamais synchronisation automatique ni copie de base brute. Compte transféré toujours **désactivé en attente de réactivation** par l'opérateur de destination et réinscription d'un mot de passe.  
> **Invariants :** Wallet et `wallet_master.key` gelés, sessions et clés privées exclues, séparation DEBUG/RELEASE, pas de promotion ADMIN implicite, aucun changement GEN-1 / Docker / pare-feu Contabo / port HTTP 8080 pendant P1.8.

## 1. Deux opérations différentes à ne pas confondre

| Opération | Utilisation | Ce qu'elle doit conserver | Destination |
| --- | --- | --- | --- |
| **Backup / Restore (P1.5)** | Reprise **du même environnement** après incident, testée sur copie | Bases, clés originales liées à leur DB, générations de données cohérentes | Restauration intégrale contrôlée du même domaine d'identité |
| **Export / Import de compte (P1.8)** | **Transfert choisi** d'identité entre DEBUG et RELEASE isolés | Nom/email/username nécessaires, références logiques non sensibles ; aucune session ni donnée métier | Nouvel enregistrement de compte, chiffré sous **les propres clés de la destination**, rôle et identifiant déterminés par la destination |

**Ne pas réutiliser le mécanisme de Backup** pour cloner la base Auth DEBUG en RELEASE : son chiffrement, ses index HMAC, ses permissions et les secrets sont propres à l'environnement.

## 2. Périmètre de l'export minimal

**Admissible sous validation et consentement de l'opérateur :**

- Version de format/export `account_transfer_format=1`, `auth_schema_version`, `auth_protocol_version`, `permissions_version`, source `DEBUG` ou `RELEASE`, destination choisie, identifiant aléatoire d'export `bundle_id`, dates `issued_at` / `expires_at`, empreinte de schéma et métadonnées publiques de chiffre/signature.
- Pour chaque **compte sélectionné individuellement** : identifiant de référence `source_client_id` à titre de *correspondance d'audit uniquement*, statut de source, prénom, nom, identifiant de connexion et adresse email nécessaires à une réinscription ; données d'identité déchiffrées **uniquement à l'intérieur du processus source autorisé**, puis immédiatement rechiffrées pour la destination.
- Origine de l'autorisation : acteur CLI local / SSH autorisé, environnement attendu, nombre de comptes, résumé des conflits, déclaration explicite du sens de transfert.

**Exclu sans exception dans P1.8 :**

- `client_master.key`, `wallet_master.key`, clés CP/1, clés de signature Auth, mots de passe **et leurs hashes/verifiers** (PBKDF2/Argon2id), sels, tokens de récupération, cookies et sessions, empreintes HMAC d'index source.
- Seeds, private keys et autres secrets wallet, `client_wallets`, adresses de portefeuille associées, autorisations de signature, API keys des providers, tokens OpenAI/X, secrets applicatifs, coffre legacy, sauvegardes SQLite brutes.
- Positions, ordres, stratégie personnelle, crédit et historique financier, profils complets de préférences, quota consommé, portefeuille et historiques de trading : **hors du transfert des comptes**. Une portabilité métier distincte pourra être spécifiée et approuvée ultérieurement.
- Rôle source comme **autorité** pour le destinataire, marque `ADMIN` ou `SUPERADMIN` automatiquement active, ancien `clientId` réutilisé comme clé primaire cible, statut de session `unlocked`.

**Protection des données personnelles :** demande explicite et finalité enregistrées ; affichage minimal du résumé, archive chiffrée, durée de vie courte, suppression contrôlée du staging, journal d'audit sans email en clair. Évaluer les obligations réglementaires/consentements pertinents avant tout usage réel.

## 3. Contrôle d'accès et séparation des environnements

- L'outil **natif IA-TB VPS**, accessible **uniquement par SSH/CLI** avec identité OS autorisée et contrôle administratif de l'environnement source, effectue les opérations. La CLI Macro peut en être l'interface SSH distante : aucune API Web de migration des comptes et aucun tunnel HTTP contenant l'archive.
- **Étape export :** sélection explicite des clients; consentement/autorisation appropriée; environnement source/destinataire et identifiants vérifiés; compte disabled/locked n'est pas automatiquement rendu actif; production d'un manifeste à afficher **sans données personnelles**.
- **Étape import :** contrôle indépendant par l'ADMIN de destination (CLI SSH), vérification de l'intégrité et de la destination du paquet, dry-run **obligatoire**, résolution explicite des doublons et des `clientId` ; import effectif uniquement après confirmation.
- Aucun export/import automatique par Supervisor, MarketData, Trading Engine, planificateur, update, Endpoint Gateway ni tâche de synchronisation.
- Pas de transfert d'un ADMIN prêt à l'emploi : **tous** les comptes importés sont créés `DISABLED_PENDING_ENROLLMENT` (statut conceptuel). Le rôle cible est explicitement choisi sous politique destination; par défaut **aucun rôle activé**. Un rôle ADMIN futur requiert une action **séparée** du CLI de destination avec contrôle du dernier ADMIN et audit. Rôles `VISITOR/SUPERADMIN` legacy refusés sans correspondance validée individuellement.
- L'import ne doit **jamais** créer implicitement le premier ADMIN, retirer/dégrader le dernier ADMIN local ou réactiver une session issue de la source.
- Au terme de la réinscription et après autorisation de l'administrateur cible, l'utilisateur définit un **nouveau mot de passe** stocké sous Argon2id calibré localement ; aucune récupération du mot de passe d'origine. Aucun email de réinitialisation externe sans processus de vérification séparé.

## 4. Identité `clientId` et collisions

**Sur source** : `source_client_id` indique le compte que l'opérateur a demandé d'exporter. **Sur destination** : `target_client_id` est généré à partir de la base destination et n'a pas à être égal au premier. Le mapping `(bundle_id, source_environment, source_client_id) -> target_client_id` est enregistré **dans un journal de migration local protégé**, sans devenir une identité utilisateur ou une clef trans-environnement.

- Recalculer `email_hash` / `username_hash` dans **l'environnement cible** avec sa propre clé d'index : les hashes HMAC de la source ne sont ni exportés ni transférables.
- Détecter email/username existants, `clientId` déjà réservé, bundle déjà importé, version de schéma incompatible et utilisateur désactivé. **Ne jamais écraser ni fusionner automatiquement** deux comptes et leurs données.
- En cas de conflit, effectuer un **dry-run** listant des codes d'erreur anonymisés et les actions possibles (skip, choisir une nouvelle identité avec vérification, annuler). Aucune option implicite `force overwrite`.
- Importer atomiquement le lot approuvé **ou ne rien écrire** ; un échec au compte N ne laisse pas une série d'identités actives ou partiellement persistantes. Audit et idempotence transactionnels.

## 5. Sécurité cryptographique de l'archive

Le chiffrement est **obligatoire avant tout stockage durable ou transfert hors hôte** ; le simple HTTPS/SSH n'est pas une protection d'archive au repos. Recommander un format de chiffrement authentifié standard éprouvé, audité, **lié à la clé publique pré-enregistrée de la destination** ; option à évaluer en implémentation : envelope encryption à clé de destinataire X25519 + KDF HKDF-SHA256 + AEAD AES-256-GCM (ou bibliothèque standard `age` validée), sans algorithme maison.

- Signature d'origine **distincte du chiffrement** si besoin d'authentifier l'émetteur, avec identité de source pré-approuvée par la destination ; Ed25519 est une **candidate**, non une décision d'algorithme définitive. Sans relation de confiance établie, refuser même un paquet correctement déchiffrable.
- Attacher de manière authentifiée `format_version`, `bundle_id`, `source_environment`, `destination_environment`, `recipient_key_id`, `issued_at`, `expires_at`, `count` et politique. Le checksum de transport du **ciphertext** est extérieur à l'AAD pour éviter une dépendance circulaire ; c'est l'AEAD et la signature optionnelle qui garantissent l'authenticité du contenu. Refuser les valeurs non canoniques, doublons, longueurs anormales, algorithmes inconnus, paquets expirés et destinataire inattendu.
- Créer un nouveau nonce aléatoire pour chaque chiffrement ; ne pas réutiliser clé/nonce, vérifier AEAD avant parsing, limiter taille et nombre de comptes et **ne pas extraire d'archive ZIP contenant des chemins fournis par l'expéditeur**.
- Clés de destination **privées exclusivement sur l'hôte cible avec droits restreints** ; l'exporteur connaît seulement sa clé publique approuvée. Les clés de signature/Auth propres aux environnements ne deviennent jamais des clés de portabilité par simple réutilisation.
- Limiter l'archive à un TTL raisonnable choisi au protocole (ex. 24 h **cible à calibrer**), enregistrer `bundle_id` consommé pour empêcher relecture/rejeu (y compris après restart).
- Sorties CLI/logs : état, nombre, hash d'archive **chiffrée**, identifiant non secret, sans identité en clair ni mot de passe ; staging `0700`, fichier `0600`, nettoyage des échecs, suppression selon politique de rétention.

**Attention opérationnelle :** exporter une identité source chiffrée en AES-GCM **nécessite** sa clé d'origine au moment de l'export. Ré-enchiffrer sur le destinataire ne signifie pas copier cette clé. Si la clé source manque alors que les données sont présentes, refus **fail-closed**, sans auto-génération.

## 6. Procédure proposée — CLI seulement (commandes illustratives NON disponibles)

```text
SSH autorisé sur source:
    iatb-users auth export --to RELEASE --clients <sélection> --dry-run
    -> affiche uniquement des métadonnées et détections de blocage
    iatb-users auth export --to RELEASE --clients <sélection> --confirm
    -> écrit archive chiffrée destinée à RELEASE, pas de base SQLite brute

Transfert SSH protégé de l'archive chiffrée via l'opérateur :
    -> pas de navigateur, pas de webhook, pas d'API HTTP 8080

SSH autorisé sur destination:
    iatb-users auth import --from DEBUG --file <archive chiffrée> --dry-run
    -> vérifie origine/destinataire/version, signatures, collisions, intégrité
    iatb-users auth import --from DEBUG --file <archive chiffrée> --confirm
    -> écrit des comptes désactivés + journal d'import en transaction

Activation séparée plus tard:
    iatb-users auth enroll <target_client_id>
    -> mot de passe nouveau + confirmation permissions par ADMIN destination
```

**Ne pas exécuter ces commandes** : elles servent uniquement d'illustration de CLI future, pas d'un binaire déjà disponible. Le nommage définitif sera aligné sur la CLI lorsque l'implémentation sera développée.

## 7. Compatibilité, rollback et tests

| Risque / contexte | Réaction attendue |
| --- | --- |
| Export DEBUG vers RELEASE | Autorisé **uniquement** après demande explicite et relation de confiance destination validée ; nouveaux comptes désactivés, jamais de promotion ADMIN |
| Export RELEASE vers DEBUG | Même contrôle, source protégée ; une donnée de production ne doit jamais être importée silencieusement dans DEBUG |
| Numéro de format non supporté, future schema version, `permissions_version` inconnue | Refus sans tentative de conversion permissive ; demander outil compatible |
| Archive invalide, clé cible incorrecte, signature source non approuvée, TTL expiré | Refus, aucun déchiffrement visible, aucune écriture DB |
| Bundle déjà consommé | Refus/reconnaissance idempotente `ALREADY_IMPORTED` sans créer nouveau compte ; journal vérifiable |
| email/username existant ou collision `source_client_id` | Refus/dry-run, mapping explicite à confirmer, aucune fusion |
| Source sans `client_master.key` malgré données existantes | Export refusé, aucune clé auto-créée |
| Permissions source ADMIN/SUPERADMIN ou USER `disabled` | Destination n'active rien automatiquement; rôle/droit exige décision CLI destination et audit |
| Erreur disque/DB/crash au milieu d'un lot | Transaction annulée, aucune identité active et aucun effet partiel |
| Demande wallet/API secrets/positions/sessions | Refus `ACCOUNT_SCOPE_FORBIDDEN`, aucun matériau secret inclus |
| Retour arrière après import | Supprimer seulement comptes **nouvellement créés par ce bundle, non activés et sans dépendance**; sinon désactiver, auditer et demander procédure manuelle ; jamais delete cascade sur `client_wallets` |

**Tests sur fixtures isolées** : zéro clé ou compte GEN-1 ; test copie chiffrée et impossible à ouvrir sans clé cible ; signature/ciphertext falsifiés ; archive replay ; conflit email/ID ; conversion roles ; clientId mapping ; un échec transactionnel au Nᵉ utilisateur ; absence de clé ; versions 0/2 ; archive surdimensionnée ; destination RELEASE incorrecte ; absence wallet/API keys/hash/cookies en payload ; test restore de l'environnement destinataire sur copie ; comptes importés non connectables jusqu'à réenrôlement. Tests validés par machine Linux x86_64, Node 22, SQLite 12, avant toute fonction réelle.

## 8. Latence et charge

- **Hors chemin critique trading** : export/import initiés manuellement en CLI, jamais dans la boucle MarketData/Router/Engines.
- Export : lecture cohérente des clients sélectionnés sans opération longue bloquant les écritures ; chiffrement dans un processus de fond de maintenance borné et throttlé.
- Import : validation puis transaction courte, indexation locale des identités, aucun callback sur système Wallet ou des APIs marchés. Mesurer p95 de la pile seulement lorsqu'une opération est autorisée sur une fixture, et vérifier l'absence de chute de performances sur les flux de prix.
- **Ne pas élargir la RAM/CPU VPS inutilement** avec des archives volumineuses ; limiter taille/lot, cadence et timeout.

## 9. Critères de clôture P1.8 — conception seulement

- [x] Séparation Backup/Restore et export/import account clarifiée.
- [x] Périmètre minimal, exclusions des secrets/sessions/password hashes/wallets, `clientId` cible, sécurité au repos et at-rest décrits.
- [x] Import CLI explicite, dry-run/confirmation, activation différée, refus d'ADMIN implicite, tests et reprise proposés.
- [ ] **Accord d'Overflow sur le contrat et les exclusions**, choix optionnels de portabilité identitaire, TTL/chiffrement final à benchmarker.
- [ ] **Pendant Phases 2–7** : outillage réel et tests E2E sur comptes fictifs, conformité cryptographique, rollback, revue performance et autorisation spécifique avant toute opération réelle.

**P1.8 est proposé, non encore validé.** Aucune donnée ni clé de GEN-1 exportée ou importée, aucun code runtime modifié, aucune publication sur le port Contabo 8080.
