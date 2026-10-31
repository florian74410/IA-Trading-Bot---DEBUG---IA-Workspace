# IA-TB DEBUG 2.1 — P1.7 — Contrat RBAC et isolation multiutilisateur

> **Statut : contrat RBAC P1.7 validé par Overflow le 14/10/2026** ; les 212 entrées et 77 actions restent une **référence documentaire non active**. Aucun moteur RBAC nouveau n'est encore déployé.  
> **Périmètre :** navigateur, Gateway, Core Auth, Router, Engines, accès directs et propriété `clientId` ; 212 entrées d'inventaire statique P1.3 (dont alias, gardes et catch-all).  
> **Sources :** `App/UI/Permissions/ui_permissions.js`, `App/Core/Admin/admin_permissions.js`, `App/UI/Gateway/ui_service.js`, `App/Core/Server/server.js`, `App/Core/Router/router.js`, `App/Core/Clients/client_service.js`, `App/Core/Clients/client_repository.js`, [P1.3 inventaire](../Security/AUTH_ENDPOINT_INVENTORY_v1.json), [P1.4](AUTH_DEBUG_2.1_TRUST_BOUNDARIES.md) et [P1.6](AUTH_DEBUG_2.1_VERSION_COMPATIBILITY.md).  
> **Compagnons :** [matrice de décision JSON **non exécutable**](AUTH_DEBUG_2.1_RBAC_MATRIX_PROPOSAL.json), [plan de tests négatifs](../Security/AUTH_DEBUG_2.1_RBAC_NEGATIVE_TEST_PLAN.md) et [contrat d'intégrité de la politique](../Security/AUTH_DEBUG_2.1_RBAC_POLICY_INTEGRITY.md).  
> **Sécurité de cette étape :** documentation exclusivement ; pas de modification de GEN-1, Docker, Contabo 8080, API Wallet ni d'ordres LIVE.

## 1. Constat : le comportement DEBUG 2.0 **n'est pas** la politique future

- `ui_permissions.js` classe **tous les GET/HEAD comme READ**, tous les POST non ADMIN par défaut comme USER_WRITE et n'implémente pas GUEST. Son `normalizeRole` assimile les rôles inconnus à USER. Il s'agit d'une **classification héritée insuffisante** pour les données de comptes, logs, secrets et actions qui mutent via un endpoint de lecture.
- `Core/Admin/admin_permissions.js` accepte `VISITOR`, `USER`, `ADMIN`, `SUPERADMIN` ; le `roleOfUser(...)` legacy peut choisir ADMIN par défaut. **Auth 2.1 n'accorde aucun ADMIN par fallback** et toute conversion de rôles historiques est explicite/auditée.
- Gateway `IATB_AUTH_MODE=disabled`, transmet actuellement les headers navigateur et utilise une identité `SESSION` fictive quand activée ; Core `session(req)` a un `localBypass:true` et `/api/bootstrap` renvoie `authenticated:true`. **Le code actuel n'est pas sécurisé pour un accès public.**
- Router `/communication/v1/ui/read` et `/write` reposent sur une allowlist de `action` et un `caller.role` interne non lié à un utilisateur authentifié. Le jeton CP/1 prouve un appel machine, pas `clientId`/RBAC. Des actions dites « read » peuvent être coûteuses ou provoquer une collecte : la **sémantique réelle** prime sur HTTP/nom de fonction.
- Beaucoup d'objets sont actuellement stockés dans la DB Settings partagée (`User Data/default/user_data.db`), dans une mémoire de process ou sous un `active_client_id` global. Une permission USER d'écriture **doit rester refusée** pour ces ressources tant qu'elles ne sont pas réellement partitionnées par client.

Le contrat ci-dessous décrit **la cible après implémentation** et les transitions à prévoir. Le maintien des fonctionnalités actuelles est exigé : avant l'activation Auth 2.1, ne pas casser les services existants ; ne pas permettre de les réexposer publiquement sous un bypass.

## 2. Principes RBAC et classes de données

**Trois rôles explicites** : `ADMIN`, `USER`, `GUEST`. Un invité peut disposer d'un compte/session de rôle GUEST mais **aucun visiteur anonyme ne devient GUEST automatiquement**. Les ressources publiques minimales de login constituent un périmètre distinct. Tous les comptes actifs sont liés à un `clientId` immuable du Core Auth.

- **ADMIN** : administre fonctions et paramètres **applicatifs partagés**, politiques de fournisseurs, configuration et comptes avec procédures sensibles ; peut travailler sur **ses propres** données USER. ADMIN ne gagne jamais accès aux clés privées ou données personnelles brutes des autres clients du seul fait de son rôle. Les commandes Linux/SSH, `iatb-users`, Docker et secrets d'hôte restent réservés à la CLI sécurisée.
- **USER** : lit/modifie ses **propres** profils, réglages personnels, historiques, portefeuille/stratégies personnels, notifications et fonctions IA autorisées par quota, après implémentation du stockage propriétaire et des contrôles. Ne peut modifier aucun paramètre global des Engines/provideurs, aucun fichier partagé, aucune donnée d'autres clients, ni lancer d'actions d'administration.
- **GUEST** : **lecture seule de contenus non personnels explicitement publiables** (cotations, bougies, catalogues publics, sources/news et éventuellement synthèses non confidentielles) ; choix de marché/timeframe/indicateurs d'affichage uniquement **dans l'état du navigateur**, sans écriture serveur ni activation de collecte ou de coût provider/IA.
- **SERVICE** : principal machine **hors RBAC humain** pour CP/1, Data Firewall, collecte, tâches planifiées ; scopes machines précis par service. Un moteur ne reçoit pas ADMIN, ne choisit pas `clientId`, ne peut exécuter une action utilisateur sensible sans preuve humaine valide.
- **ANONYMOUS** : login, bootstrap **minimal non authentifié**, ressources statiques login explicitement autorisées ; jamais API générique, données de sessions, administration ou données personnelles.

**Classes** : `PUBLIC_MINIMAL` (login), `SHARED_PUBLIC_READ` (donnée générale assainie), `OWNER_READ` / `OWNER_WRITE` (identité de session, données privées), `GLOBAL_ADMIN_READ` / `GLOBAL_ADMIN_WRITE` (configuration, métadonnées système, effets globaux), `INTERNAL_SERVICE` (machine authentifiée + scopes), `FROZEN_WALLET` (hors chantier), `DENY` (inconnu et legacy dangereux).

**Important :** `GLOBAL_ADMIN_READ` comprend logs, diagnostics, coûts globaux, settings avec champs de secrets, registres techniques et état système. Ne pas les faire passer à GUEST en raison de HTTP GET. `OWNER_READ` nécessite ownership/filtrage des lignes avant sérialisation et même pour une liste.

## 3. Matrice des capacités (politique cible)

| Ressource / action | ADMIN | USER | GUEST | Obligation serveur |
| --- | --- | --- | --- | --- |
| Login / logout / lock / unlock | Compte personnel | Compte personnel | Compte personnel si compte GUEST | Auth service, anti-bruteforce, cookies protégés, CSRF sur mutations |
| Cotations, candles, symboles, news et calendrier **assainis et partagés** | Lecture | Lecture | Lecture | Source publique allowlist + caches, aucune info par client ou provocation de collecte |
| Définition/catégorie d'indicateur ou stratégie **publiques** | Lecture | Lecture | Lecture | Pas de code/stratégie privée dans réponse ; évaluer coût CPU des calculs |
| Dashboard technique, logs, registres d'erreurs et métriques internes | Lecture | Refus | Refus | ADMIN ; probes internes minimales via principal machine |
| Profil et informations de compte | Personnel + fonctions d'administration limitées | **Propriétaire uniquement** | Métadonnées personnelles minimales pour la session si besoin | `clientId` obtenu de Core Auth et non URL/body |
| Préférences de thème, marché, timeframe et disposition | Persistance **personnelle** | Persistance **personnelle** | Local navigateur uniquement | Ne pas écrire la DB Settings `default` pour USER/GUEST |
| Stratégies personnelles, historique IA, portfolios, positions et ordres historiques | Propres données | Propres données | Refus | Partition par `clientId`, SQL owner predicate, aucune requête cross-tenant |
| Gestion globale MarketData, News/Fundamental, sources, feeds, indicateurs installés, cache/registry | Modification contrôlée | Refus | Refus | ADMIN ; audit des modifications globales |
| Paramètres globaux (API keys, providers, Firewall, supervision, puissance, stratégies globales) | Modification contrôlée | Refus | Refus | ADMIN ; retour sans secret ; confirmation sur opération sensible |
| Gestion des comptes (create/disable/promote/reset/list) | **Via CLI SSH `iatb-users` uniquement** | Refus | Refus | Aucun endpoint Web arbitraire de gestion comptes ; garde du dernier ADMIN |
| Notifications privées et consommation/quotas IA | Propres données + synthèse globale limitée | Propre compte seulement | Refus | Migration données multi-tenant préalable ; quota et prévention de fuites |
| Chat IA / compagnon / Chart Viewer assistant | Sur données autorisées, pas de shell arbitraire | Sur ses propres données avec coûts bornés | Refus | Sortie IA soumise aux mêmes RBAC (outils/actions aussi), anti-injection par outils |
| Mosaïques utilisateur | Propre définition | Propre définition | Local navigateur uniquement | Endpoints actuels de catalogues **globaux** réservés ADMIN tant que non partitionnés |
| Console CP/1, update, restart, shutdown et Firewall admin | ADMIN applicatif seulement si opération expose une API expressément permise et confinée | Refus | Refus | Jamais de pouvoir Linux/root ; confirmation + audit + revérification serveur |
| Trading LIVE / ordres et transferts réels | **Hors périmètre / refus DEBUG** | **Hors périmètre / refus DEBUG** | Refus | Trading Engine OFF, Risk + Firewall + mode LIVE explicite dans futur projet |
| Wallet, clé wallet, import/export/révélations/swap/transfer/onchain lié aux wallets | **Aucune modification de logique ou clé dans Auth 2.1** | Pareil | Aucun accès aux données wallet | Préserver code/data historiques sans exécuter de migration ni exposer ces routes au nouveau public avant chantier distinct |

**Méthode de déploiement :** si une fonction actuellement globale doit devenir personnelle sans casser la fonctionnalité, maintenir temporairement sa gestion en ADMIN sur l'environnement privé jusqu'à création/validation de son équivalent par client. Un bouton visible ne vaut pas permission. Ne pas faire passer la logique de détention de wallets dans cette migration.

## 4. Répartition des routes réelles par domaine (P1.3)

### 4.1 Gateway / navigation

- **Anonyme minimal** : page de connexion séparée future, `POST /api/login`, assets de login explicites ; réponse `/api/bootstrap` sans `authenticated:true` fictif, ne retourne aucune info de compte sans session.
- **GUEST et au-dessus** : vues Trading/chart/news ne contenant que des modules réellement partagés/publics ; les pages `/portfolio`, `/bank`, `/keys`, `/settings` restent protégées suivant les **données exposées**, pas un simple garde `GET`. Un fragment UI caché n'assure aucune confidentialité.
- **ADMIN** : `/admin*`, `/ui-api/project-tree`, `/ui-api/project-file`, `/firewall-admin/*`. Un explorateur de fichiers peut exposer source, configurations ou secrets et doit rester strictement borné à des fichiers explicitement autorisés, même pour ADMIN ; revoir la nécessité de la fonctionnalité.
- **Session/health** : `/ui-api/session` renvoie seulement la session courante ; `/ui-health`, `/router-health` et `/communication-health` sont des probes minimales réservées aux canaux internes ou sans détails sensibles. Pas de `authMode`, infos de ports ou bypass pour les visiteurs.
- **Static** : `/assets/*` ne publie anonymement que le sous-ensemble prévu pour login, pas `Frontend/Protocols`/tout projet. `/ui-data/market/candles` est une lecture de marché **sans provenance personnelle**, jamais un accès indirect au Router non filtré.
- **Routage** : `/api/internal/*` DENY côté navigateur ; `/api/*` et `/communication/*` seulement via **table explicite méthode+chemin+action**. Les proxys catch-all inconnus du Gateway et Router renvoient 404/403 sans forwarding.

### 4.2 Core API

- **GLOBAL_ADMIN_READ/WRITE** : `/api/admin/*`, `/api/updates*`, `/api/ai-updates*`, `/api/shutdown`, `/api/security/firewall/toggle`; `GET /api/logs`, `GET /api/status` (statut complet), `GET /api/settings` (configuration brute), `GET /api/credits/usage`, `GET /api/token-usage` (globaux), `POST /api/settings/apis*`, `/api/settings/general`, `/api/settings/supervisor/brains`, `/api/settings/ai`, `/api/settings/power`, `/api/settings/test-*`, `/api/credits/pricing`, `/api/app-settings/select`. Pour toute lecture exposée au USER, créer un DTO **sanitisé et propriétaire**, pas simplement élargir la route existante.
- **OWNER_READ/WRITE (après séparation)** : `GET/POST /api/client/me`, `/api/profile`, `/api/session/change-password`, `/api/session/change-email` ; `/api/notifications*`, `/api/settings/language`, `/api/settings/portfolio`, `/api/settings/modulation` et `/api/chart-viewer/chat`, `/api/companion/chat`, `/api/chat` uniquement si stockage individuel et exécution des outils RBAC garantis. Ces routes sont **actuellement mixtes/globales**, donc le niveau USER est une **cible conditionnelle**, pas un droit immédiat.
- **Mosaics** : `GET /api/mosaics` catalogue partagé uniquement après filtre ; `/api/mosaics/runtime` données internes ADMIN ; `POST /api/mosaics/create|delete` sont actuellement liées aux fichiers partagés : **ADMIN uniquement jusqu'à migration des mosaïques privées**, puis OWNER_WRITE pour les objets personnels.
- **Wallet / finance sensible** : `/api/security/wallets*`, `/api/transfers/*`, `/api/swap-bridge/*`, `/api/onchain/*` ne deviennent **pas automatiquement des routes USER/ADMIN publiques**. Auth 2.1 n'y touche pas : ne pas générer `wallet_master.key`, ne pas importer, révéler ou migrer de secret. Les accès futurs doivent être spécifiés dans le chantier wallet séparé.
- **Legacy** : `/api/setup`, `/api/recovery/request`, `/api/recovery/confirm` sont à désactiver pour Auth 2.1 ; mécanisme de récupération volontaire éventuel plus tard via SSH CLI. `/api/bank/vaults` peut afficher un catalogue public seulement si métadonnées vérifiées, sans création ni secret.
- **Anomalies prioritaires** : `/api/shutdown` et `/api/security/firewall/toggle` sont hors préfixe `/api/admin/` ; le traitement doit être par **action et effet**, pas prefix-only. Un `GET` peut effectuer une mutation indirecte (ex. `GET /api/updates` appelle `cleanupOld()`), donc pas de permission sur la seule méthode.

### 4.3 Router, CP/1 et Engines

- `POST /communication/v1/ui/read` : **POST transport**, pas une preuve que l'action est pure. Router vérifie `target`, `action`, paramètres et classe de données ; vue globale non privée accessible à GUEST après filtrage + contrat, lectures de portfolio/trading/account **OWNER_READ** uniquement avec identité vérifiée et segmentation ; statut Firewall et logs techniques **ADMIN**.
- `POST /communication/v1/ui/write` : liste actuelle `indicator.*`, `marketdata.*`, `fundamental.*` agit sur registres/feeds/fichiers globaux ; **GLOBAL_ADMIN_WRITE** pour ces actions. Une édition d'indicateur **personnel** demande un nouvel endpoint et stockage par `clientId` avant permission USER.
- **Lectures à risque** : `fundamental.logs.recent`, `fundamental.diagnostic.feed`, `marketdata.settings.get`, `marketdata.provider.test`, `marketdata.financial.snapshot` (argument `force`), `indicator.compute_batch` et `indicator.analyze` (coût CPU), `portfolio.*` et `trading.account.*`. Les classer selon données et effets ; GUEST ne peut pas forcer une collecte ni voir un compte.
- `POST /communication/v1/request`, `/register`, `/event`, `/client/plan|ack` et autres routes CP : **INTERNAL_SERVICE** avec scopes machines explicites, vérification du protocole CP/1 + proof human separate si origine Web. Le secret CP/1 partagé ne crée aucun SUPERADMIN.
- Supervisor, Risk, Trading, Portfolio, Firewall : même règle côté **Engine receveur**, indépendamment du Gateway/Router. Les en-têtes `x-iatb-*`/rôle, `caller` et un `clientId` transmis par le navigateur sont non fiables.
- **Trading LIVE** : explicitement désactivé en DEBUG, quelle que soit la présence de ADMIN et la validité de CP/1.

## 5. Invariant `clientId` et autorisation propriétaire

**Définition :** `principal = CoreAuth.verifySession(cookie)` → `{clientId, role, securityVersion, sessionIdHash, locked, revoked, active}`. Le client n'est jamais autorité sur `clientId`, `role`, `owner`, `permissions_version`, `servicePrincipal` ou la signature.

1. Construire un **`AuthContext` immuable** après validation de session, et le lier au `request_id`. Tout objet utilisateur a un propriétaire stocké **côté serveur** (colonne `owner_client_id` ou mapping transactionnel fiable, pas un champ fourni par client).
2. Pour OWNER_READ, filtrer dans la requête/transaction SQL **avec `owner_client_id = principal.clientId`**, y compris dans listes/counts/exports/jointures/cache, et vérifier le propriétaire avant renvoyer des métadonnées de ressource (non révélation de l'existence d'objets tiers).
3. Pour OWNER_WRITE, même prédicat propriétaire et contrôle d'état actif, sous transaction ; vérification finale contre révocation/rôle modifié. Les caches privés, jobs IA, notifications et événements doivent incorporer **`clientId`, permissionsVersion et securityVersion** ou être invalidés.
4. Pour ressources globales, l'ADMIN explicite passe par une politique distincte et journalisée. **Même ADMIN ne lit pas par défaut les secrets et données personnelles en clair d'autres comptes** ; gestion des comptes via CLI native SSH, avec opérations minimales auditées.
5. Les identifiants `walletId`, `strategyId`, `positionId`, `tradeId` et `account` de la requête sont **des filtres non fiables**. Le `active_client_id` global hérité des Settings ne doit plus être source d'autorisation et ne peut représenter simultanément plusieurs utilisateurs.
6. Pour flux collecteurs réellement publics, utiliser un **cache partagé nettoyé** ; pour une vue propriétaire, clé de cache contenant le contexte propriétaire et interdiction de fuite entre tenants. Ne pas ajouter une lecture SQL à chaque tick.
7. Inconnue, échec Auth, erreur DB, ancienne version, preuve non vérifiable, rôle inconnu, session locked/revoked → **refus sans fallback**. `GUEST` ne devient pas `USER`, `VISITOR/SUPERADMIN` legacy ne sont pas promus automatiquement.

### Protocole de refus (cible)

- **401** : session absente/expirée/verrouillée ; réponse minimale, cookie non divulgué.
- **403** : rôle ou action refusés, tentative de mutation GUEST, signature non valide.
- **404** : objet d'autre propriétaire (masquage possible en lecture, réponse indistinguable d'un objet inexistant).
- **409** : version/protocole incompatible dans un état récupérable **sans effet métier**.
- **503** : Core Auth, SQLite, clé d'autorisation ou service de sécurité indisponible ; jamais de bypass.
- **429** : quota d'essais ou limitation requise ; pas de suivi de login brut dans logs.

Les codes exacts seront stabilisés à l'implémentation ; l'invariant est **zéro données privées et zéro effet métier** lorsqu'une autorisation échoue.

## 6. Performances et contrôles de qualité

- Auth coûteuse (Argon2id) **uniquement login/unlock**, session indexée et structurée sur Core ; signature de capacité courte pour l'action humaine, vérification locale à la frontière Router, contrôle ownership final où la transaction métier est exécutée.
- **Pas de round-trip Core Auth ni d'Argon2id par tick public**, pas de nouveau handshake TLS sur chaque requête persistante. Les flux GUEST partagés bénéficient du cache public si le contenu est explicitement safe.
- Pas de cache de permission qui survit à une révocation/lock ou à un changement de `permissions_version`. Comparer p50/p95/p99, RSS, CPU, throughput et erreurs à la baseline sans sécurité.
- Targets de conception existants : p95 ≤ +5 % et p99 ≤ +10 % sur comparables ; mesurer avant finalisation. Les actions USER et ADMIN peuvent coûter quelques contrôles supplémentaires, pas les ticks automatisés.
- Audits minimaux `{timestamp, requestId, role, resourceClass, outcome, reasonCode}` ; corrélation interne du `clientId` si nécessaire mais pas de secrets, cookie, password, signature, argument privé brut ni clé wallet.

## 7. Implémentation future par paliers

1. **Fixtures** : créer comptes/objets fictifs A et B, ADMIN, USER, GUEST, anonymes et principaux de service. Écrire la table de routes/action à **deny-by-default** et le plan de tests négatifs avant connexion à des DB réelles.
2. **Core Auth** : service d'autorisation central, session/role/clientId vérifiés, reprise DB/client ID et tests d'ownership sur copies ; aucun mode bypass en Auth 2.1.
3. **Gateway** : routing exact, en-têtes nettoyés, CSRF, assets login limités, séparation READ_SHARED / OWNER_* / ADMIN et pages adaptées au rôle.
4. **Router & Engines** : scopes CP/1 et autorisation humaine indépendante, attestation par action et contexte propriétaire ; supprimer les chemins proxy fallback et tout `caller` pris pour preuve.
5. **Stockage tenant** : migrer graduellement préférences/stratégies/notifications et historiques partageant `default` vers des DB/tables avec propriétaire ; tant que non migrés, mutation de données globales **ADMIN uniquement**. Ne pas casser les fonctions stables en place dans l'environnement privé.
6. **Validation** : exécuter sur banc isolé [tous les cas négatifs](../Security/AUTH_DEBUG_2.1_RBAC_NEGATIVE_TEST_PLAN.md), mesurer performance, vérifier rollback et séparation DEBUG/RELEASE avant tout pilote sur GEN-1.
7. **Wallet** : gel complet pendant Auth 2.1 : préservation des fichiers/données historiques seulement ; aucun changement de code gestion wallet, schéma, clé, retrait/import/signature.

## 8. Portes de clôture de P1.7

- [x] Inventaire des routes et des classes de données rapproché de P1.3 et des sources Core/Gateway/Router.
- [x] Matrice de permissions ADMIN / USER / GUEST / SERVICE / ANONYMOUS et ownership `clientId` **proposée**, avec transitions pour paramètres legacy globaux.
- [x] Plan de tests négatifs et seuils de performance documentés.
- [x] **Matrice RBAC approuvée par Overflow le 14/10/2026 :** GUEST lectures publiques sans mutation/coût, USER propriétaire, paramètres/collecteurs globaux ADMIN, comptes uniquement par CLI, Wallet gelé.
- [ ] Tests réels du contrôle d'accès/RBAC et du stockage partitionné (Phases 2–4) ; pas requis pour la clôture **de conception**, mais bloquants avant toute ouverture.
- [x] **P1.7 coché dans le workplan après validation utilisateur** ; les tests de contrôle d'accès et les permissions en production restent bloquants avant déploiement.

**Exigence d'intégrité ajoutée :** une modification frauduleuse de la matrice, y compris ajout de GUEST à une permission ADMIN ou reclassification d'une route critique, doit être rejetée par CI, revue de sécurité et contrôles serveur. Politique future immuable et liée à un build vérifié ; le JSON présent n'est pas une source de permissions runtime. La signature d'un artefact de politique/build ne sera vérifiée qu'au déploiement/démarrage, pas pour chaque tick MarketData.

**Décision : P1.7 validé comme contrat de conception.** Nouvelle exigence transversale : chaque nouvelle fonction ou route doit être classée RBAC et couverte par des tests négatifs, sinon refus par défaut. Voir [RBAC Change Policy](../Security/AUTH_DEBUG_2.1_RBAC_CHANGE_POLICY.md). Aucun runtime, wallet, port Contabo ou privilège Docker modifié.
