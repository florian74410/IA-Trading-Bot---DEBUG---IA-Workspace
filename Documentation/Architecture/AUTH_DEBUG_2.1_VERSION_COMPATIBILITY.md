# IA-TB DEBUG 2.1 — P1.6 — Versionnement Auth, compatibilité et rollback

> **Statut : CONTRAT DE CONCEPTION APPROUVÉ par Overflow le 14/10/2026 (P1.6)** ; format concret des preuves, signature définitive, migrations et tests de compatibilité à implémenter/valider aux phases suivantes.  
> **Portée :** modèle d'API, de données et d'autorisation pour la future implémentation ; **aucune migration, activation Auth, clé ni configuration Docker n'est exécutée**.  
> **Source d'audit :** branche `fix/v2.0.1-debug`, `App/Core/Clients/migrations/{001_clients_v1.sql,002_client_accounts_v1.sql}`, `client_repository.js`, `communication_protocol_v1.js`, `component_cp1_adapter.js`, `Core/Router/router.js`, `ui_permissions.js` ; voir aussi [P1.4](AUTH_DEBUG_2.1_TRUST_BOUNDARIES.md) et [P1.5](AUTH_DEBUG_2.1_BACKUP_RESTORE_CONTRACT.md).

## 1. Décisions héritées à respecter

- **Conserver ce qui fonctionne déjà** : CP/1, moteurs, registre des clients `clientId`, données SQLite, chiffrement client AES-256-GCM et fonctions autorisées de DEBUG 2.0. Changer les contrats au moyen de passerelles versionnées, pas en réinterprétant silencieusement les messages existants.
- **Isolation interne** : réduire les droits et montages de chaque composant à l'implémentation, sans briser les 13 services ; un secret CP/1 commun n'est **pas** une preuve de permission humaine.
- **Wallet gelé** : ne changer ni schéma wallet, ni `wallet_master.key`, ni données, clés ou mécanisme de custody. Sur GEN-1, la clé wallet attendue est **absente**, ce qui ne constitue pas une autorisation d'en créer une.
- **GEN-1 inchangé** : pas de mutation de permissions, de bases, de conteneurs ni du filtre Contabo HTTP 8080 (autorisé uniquement depuis l'IP publique de l'opérateur selon sa déclaration).
- **Performance** : écarter Argon2id et les handshakes TLS de la boucle des ticks, mesurer p95/p99, privilégier les opérations de vérification locale bornées pour les requêtes humaines signées.

## 2. Trois numéros **indépendants**, plus deux notions existantes

| Identifiant | Domaine / source de vérité cible | Valeur initiale proposée | Règle d'évolution |
| --- | --- | --- | --- |
| `auth_schema_version` | Dans `clients.sqlite` : table nouvelle `auth_schema_migrations`, avec journal `version, checksum, applied_at, build_id`; valeur lue par Core Auth et CLI admin | `0` tant que le nouveau schéma Auth n'existe pas ; `1` après **première migration** sur copie validée | +1 pour modification du modèle stocké/contrainte ; jamais réutiliser un numéro avec SQL différent |
| `auth_protocol_version` | Contrat des **échanges d'identité et des capacités d'autorisation humaine**, exposé par Core et respecté par Gateway/Router/Engines | `1` pour le nouveau contrat Auth 2.1 ; absent dans DEBUG 2.0 | +1 lorsqu'un changement de preuve, claims, parsing, erreur ou règles de validation devient incompatible ; rejet si inconnu |
| `permissions_version` | Matrice RBAC serveur (rôles/scopes/ownership) du build Auth, signée ou attestée comme ensemble cohérent des composants | `1` pour politique ADMIN/USER/GUEST avec `deny-by-default` | +1 pour modification du sens d'une action, rôle, scope ou restriction ; invalider caches et capacités d'ancienne politique |
| `client_schema_migrations.version` | **Existant** dans `clients.sqlite`, avec scripts `001` et `002` | **2 dans le code** ; vérifier la valeur réelle par lecture avant opération | Historique legacy **préservé**, ne pas le réinitialiser, ne pas écraser `001/002`, ne pas attribuer leurs numéros à Auth |
| `clients.security_version` | **Existant**, champ de révocation/état par client | 1 pour données legacy observées dans le code | Incrément par utilisateur à révocation/changement de mot de passe/rôle/désactivation ; **ce n'est pas** `permissions_version` global |

**Ne pas confondre :** `CP/1` est le protocole interservices existant, `schemaVersion` dans les réponses CP est le schéma de réponse de chaque Engine, `ui_permissions v1.10.0` est une étiquette de module et `DEBUG 2.1` est une version du produit. Aucun de ces numéros n'est un substitut aux trois versions Auth.

Une instance Auth ne doit jamais déduire les numéros manquants à partir de la version de l'interface ou du numéro de build : *absence = état legacy non migré, à traiter explicitement*.

## 3. Contrat SQLite Auth 1 et migrations

**Base ciblée :** `/iatb/debug/data/Database/clients.sqlite`, avec clé client `/iatb/debug/data/Security/client_master.key` conservée et associée au même ensemble logique ; RELEASE emploiera plus tard ses **propres** chemins, bases et clés.

**Historique inchangé** : `client_schema_migrations`, `clients`, `client_accounts`, `client_wallets`, `client_audit` et les identifiants `clientId`. La table `client_accounts` de DEBUG 2.0 accepte PBKDF2-SHA256, un sel, un compteur d'itérations et des rôles legacy ; ne pas réinitialiser les données ni promouvoir `SUPERADMIN`/VISITOR automatiquement.

**Migration Auth 1 — future, sur copie testée :**

- Créer `auth_schema_migrations` avec un journal immuable (ordre croissant, checksum exact du SQL, horodatage, build et statut final uniquement après `COMMIT`).
- Ajouter sans destruction `auth_sessions` (identifiant **haché**, `client_id`, création, expiration absolue, activité utilisateur réelle, locked/revoked, epoch de sécurité) et structures d'audit/lockout nécessaires, index bornés.
- Ajouter l'identification explicite du schéma de hachage mot de passe (PBKDF2 legacy vs PHC Argon2id) **sans** écrire de mot de passe ni perdre les hash anciens ; rehash Argon2id uniquement après login validé et dans une transaction.
- Préserver toute association `client_wallets` et les éventuelles données wallet stockées ailleurs (Settings historiques inclus) : **aucune migration wallet à P1.6**.
- Rôles canoniques Auth = `ADMIN`, `USER`, `GUEST`. Traduction des autres rôles legacy **uniquement via plan explicite et audit**, jamais via une valeur par défaut `ADMIN`.
- Séparer DEBUG et RELEASE physiquement et logiquement ; pas de copie de sessions, de privilèges, de cookies, de clés ni de jetons d'un environnement à l'autre.

**Bloquant préalable à chaque migration :** instantané SQLite cohérent et chiffré, concordance clé originale/DB, vérification `PRAGMA quick_check` et FK, test de restauration de l'ensemble sur copie, disponibilité d'espace disque, manifeste des versions et décision d'opérateur. Si le chemin Auth n'existe pas encore, il doit être initialisé uniquement dans une installation véritablement vierge *ou dans une migration validée*, jamais silencieusement sur des données préexistantes.

L'outil de préflight **ne doit pas importer directement `Core/Shared/paths.js`** si ses effets d'initialisation créent des secrets ; faire un relevé de chemins et des fichiers en lecture seule avant de charger les modules pouvant muter.

**Transactions** : appliquer une migration Auth 1 de façon atomique et vérifier le résultat avant de enregistrer sa version ; `PRAGMA foreign_keys=ON` et `integrity_check` sur copie. Les migrations SQL existantes sont versionnées par `client_schema_migrations` : elles ne sont pas un rollback fiable à elles seules. La reprise complète utilise un snapshot cohérent **avec ses clés et sa version de protocole**.

## 4. Auth Protocol 1 : contrat **nouveau**, CP/1 conservé

### Couche machine existante

- Garder `protocol: "CP/1"` et les validations existantes `request_id`, `timestamp` (tolérance actuellement 30 secondes), `target`, `action` et HMAC machine sur les chemins internes déjà protégés.
- Les messages CP/1 pour moteurs et lectures **strictement publiques / autonomes** peuvent continuer selon une allowlist machine versionnée, sans nouvel aller-retour Auth à chaque tick.
- Sur `/communication/v1/ui/write` et toutes les actions concernant l'identité humaine, ajouter une **seconde preuve**. L'actuelle valeur `caller.role=WRITE/READ_ONLY` est un libellé généré par Router, **pas une autorisation**.
- Ne pas activer en DEBUG 2.0 un champ de privilège supplémentaire supposé interprétable par les Engines anciens. Un Engine qui ne connaît pas la validation Auth 1 ne reçoit pas de mutation utilisateur sensible.

### Capacité Auth 1 (proposition de structure ; pas encore une API active)

```json
{
  "auth_protocol_version": 1,
  "issuer": "core-auth",
  "aud": "router",
  "environment": "DEBUG",
  "subject_client_id": "CL000001",
  "role": "USER",
  "target": "portfolio",
  "action": "portfolio.example_action",
  "arguments_digest": "<sha256-of-canonical-arguments>",
  "permissions_version": 1,
  "client_security_version": 1,
  "session_epoch": "<opaque-revocation-epoch>",
  "issued_at_ms": 0,
  "expires_at_ms": 0,
  "nonce": "<unique-id>",
  "key_id": "<approved-auth-signing-key-id>"
}
```

L'exemple illustre des **champs et contraintes**, non une preuve signée valide. Les timestamps zéro et l'action fictive sont des placeholders ; ne jamais copier cette charge comme jeton utilisable.

**Signature :** distinguer le secret CP/1 partagé de l'autorité Auth. **Option d'architecture recommandée à benchmarquer : Ed25519**, avec clé de signature privée **Core uniquement** et clé **publique de vérification** sur Router/Engines. Ce choix empêche un simple vérificateur de signer à son tour. Il évite aussi de distribuer un nouveau secret HMAC signataire à tous les moteurs ; son coût doit être benchmarké face à une preuve HMAC limitée à une frontière réellement isolée. Les clés Auth privées et la clé maître client n'appartiennent ni au Gateway ni à tous les Engines. L'algorithme, le mode de rotation et la représentation canonique restent à figer dans les tests d'implémentation.

**Validation obligatoire** : présence et type stricts de tous les champs critiques ; issuer/audience/environment exacts, entier `auth_protocol_version`, `permissions_version` connue, `client_security_version` courante pour opération sensible, signature valide, horloge bornée, `target` / `action` / `arguments_digest` identiques à l'opération effective, `nonce` à usage unique en mutation, pas de payload malformé/énormes objets/doublons, pas de conversion implicite d'ADMIN en USER ou l'inverse. Le champ de version et les champs de portée font partie **des données signées**, jamais d'en-têtes de confiance forgés côté navigateur.

**Durée :** capacité courte (quelques secondes envisagées, à calibrer avec charge, horloge et p99), non renouvelée automatiquement pour rejouer des écritures. Les revocations, locks, modifications de compte ou permissions priment sur un TTL encore valide ; les opérations sensibles exigent un état de révocation actualisé à l'exécution, fail closed si indisponible. Les lectures communes ne doivent pas dépendre d'un appel SQL par tick ; les données privées conservent une expiration contrôlée.

## 5. Compatibilité et négociation explicites

| Core Auth | Gateway / Router / Engine | Schéma SQLite Auth | Décision |
| --- | --- | --- | --- |
| Aucun (DEBUG 2.0) | CP/1 legacy sans validation Auth | `0` (ou absent) | **Legacy en accès privé uniquement**, aucun nouveau rôle multiutilisateur certifié ; ne jamais ouvrir public |
| Auth 1 | Tous les points d'entrée concernés déclarent `auth_protocol_version=1` et `permissions_version=1` | `1` | Autoriser **uniquement après** résultats positifs des tests Auth/RBAC/ownership et configuration transport privée |
| Auth 1 | Router ou Engine non capable de vérifier les preuves de permission humaine | `1` | **Refuser les actions humaines sensibles** ; machine-only explicitement permise possible |
| Auth 1 | Protocole absent/0/inconnu ou version de permissions inconnue | `1` | 403/409 (preuve invalide) ou 503 (service non prêt) ; aucune substitution vers ADMIN/bypass |
| Auth 1 | Router Auth 2 futur avec claims/permissions non compatibles | `1` ou supérieur | Refuser avec `AUTH_VERSION_UNSUPPORTED` avant métier ; rétrocompatibilité uniquement documentée et testée |
| Auth 1 | Tous services Auth 1, mais DB Auth non migrée ou plus récente que le binaire | 0 ou >1 | Pas de login ni de mutation privée ; statut `AUTH_SCHEMA_MISMATCH`, plan opérateur requis |
| N'importe laquelle | Capacité `environment=RELEASE` reçue en DEBUG ou inversement | Toute | Refuser sans négocier les droits ni importer la session |

**Ne pas supposer une compatibilité partielle** en fonction de la seule forme des objets JSON. Des champs inconnus peuvent être permis uniquement sur des lectures publiques documentées ; une preuve d'autorisation Auth doit valider une liste explicite et refuser toute extension sensible tant qu'aucune nouvelle version n'est supportée.

**Observabilité :** les endpoints de health peuvent révéler uniquement les trois versions et un `compatibility_status` non secret. Les raisons détaillées d'un refus sont conservées dans un audit privé, jamais des clés, cookies, signatures ou jetons entiers.

## 6. Rollout et retour arrière, sans interruption imprévue

1. **Conception (P1.6, maintenant)** : documenter versions et tests ; aucune exécution SQL ni déploiement.
2. **Préparation (Phase 2)** : créer fixtures DB vierges + copies anonymisées ; vérifier préflight en lecture seule et `client_schema_migrations`, mesurer baseline, isoler clés et permissions, sauvegarder l'ensemble en cohérence.
3. **Migration sur copie** : appliquer Auth Schema 1 en transaction ; vérifier `quick_check`, FK, conservation `clientId`, ACL/ownership et lecture des identités avec la **même** clé ; vérifier que les données wallets n'ont pas changé.
4. **Compatibilité du stack** : Core/Gateway/Router/Engines vérificateurs et matrice RBAC en version Auth 1/policy 1 ; ne pas commencer à accepter des actions sensibles avant que chaque garde serveur soit opérationnelle. Les services ne supportant pas le contrat restent hors des actions utilisateur.
5. **Activation privée** : après approbation spécifique de déploiement, sessions déjà révoquées/recréées côté serveur, tests négatifs, rollback sur copie ; Contabo reste filtré, aucun login HTTP public.
6. **Retour arrière sûr** : en cas de migration ou compatibilité refusée, placer les fonctions Auth/mutations en maintenance **fail closed** ; restaurer sur copie isolée snapshot cohérent DB+clés+manifest du build correspondant ; si un retour à un vieux binaire DEBUG 2.0 sans garde Auth est nécessaire, ne **jamais** le servir comme plateforme authentifiée ni l'exposer sur HTTP public. Ne pas exécuter l'ancien code sur une base Auth 1 dont il ignore les migrations et versions.
7. **RELEASE (futur)** : migration explicite, chiffrée, opt-in et testée, sans copier sessions, permissions ADMIN ou clés privées ; jamais de promotion implicite par changement d'environnement.

**Sauvegarde de sécurité** : la capacité de restaurer un snapshot n'autorise pas une baisse silencieuse de `permissions_version` ou de `client_security_version` vers une valeur qui réactive des sessions ou rôles révoqués. Le plan de retour arrière doit révoquer toutes les sessions issues de la génération abandonnée et imposer une nouvelle connexion, avec suivi de l'epoch de sécurité.

## 7. Cas négatifs indispensables

- **Migration/DB** : absence clé client avec base chiffrée ; DB vide vs DB existante ; version Auth absente, inconnue ou supérieure ; checksum SQL différent ; migration interrompue ; base WAL/DELETE ; restore snapshot cohérent ; `clientId` inchangé ; erreur d'intégrité ; stockage plein.
- **Protocole** : CP/1 sans preuve humaine pour action utilisateur ; `auth_protocol_version=0,2,null` ; `permissions_version=0,2` ; signature invalide ; cible/action/body modifiés ; claims dupliqués ; `environment` inversé ; expiré, future timestamp, nonce rejoué ; clé publique sans clé privée et rotation `key_id`.
- **Rôles** : `SUPERADMIN` et `VISITOR` historiques non promus ; ADMIN/USER/GUEST et clientId spoofés ; last ADMIN protégé ; droits changés pendant une requête ; Core Auth indisponible ; état lock après cinq minutes ; un compte désactivé ou supprimé ne peut plus agir.
- **Déploiement/rollback** : ancien binaire lancé devant DB version 1 ; une Engine non mise à jour ; absence d'un volume requis ; rollback doit préserver les données et ne restaurer aucune session déjà révoquée ; tests tous exécutés en environnement isolé.
- **Performance** : lecture de marché autonome p95/p99 inchangée dans tolérances mesurées, aucune requête Argon2id/TLS handshake à chaque tick ; signature/validation en profilage ; résultats rapportés séparément du refus d'accès (aucun droit élargi pour optimiser).

Les tests sont **spécifiés, pas exécutés**. Ils seront implémentés avec fixtures et conteneurs factices avant toute activation du système.

## 8. Livrables et validation P1.6

- [x] Audit des numéros existants (clients 001/002, CP/1, rôles legacy, UI policy) effectué.
- [x] Contrat de versions et matrice de compatibilité proposés ; distinction schéma/protocole/permissions explicite.
- [x] Procédure de migration/rollback et tests négatifs décrits, avec gel Wallet et préservation des données/performances.
- [x] **Revue et approbation des règles de versionnage et de compatibilité par Overflow le 14/10/2026** ; options de signature et détail d'API encore candidats et à benchmarker.
- [ ] Implémentation des migrations, validations cryptographiques, tests de compatibilité et benchmarks — **Phases 2 à 7 seulement**.

**Contrat de contrôle métier complémentaire :** [P1.7 — RBAC / propriété `clientId`](AUTH_DEBUG_2.1_RBAC_CONTRACT.md) détaille l'application de `permissions_version` aux 212 routes inventoriées et aux 77 actions UI-CP/1 ; proposition distincte en attente de validation, tests prévus sur banc isolé.

**Précision P1.8 :** le versionnage Auth couvre les **migrations internes dans chaque environnement** et le rollback local, pas une importation DEBUG ↔ RELEASE. Le module de portabilité automatique a été écarté par Overflow ; une éventuelle migration manuelle de `clients.sqlite` lors d'une future v3.x est un chantier distinct. Aucun transfert de donnée métier ni de Wallet.

**Conclusion : P1.6 validé au niveau du contrat de conception.** Aucun changement runtime, CP/1, base GEN-1, Contabo ou wallet ; tests/migrations et performance restent des jalons obligatoires avant activation.
