# IA-TB DEBUG 2.1 — P1.7 — Plan de tests RBAC négatifs

> **Statut :** catalogue de 48 tests **approuvé au niveau du contrat RBAC P1.7** par Overflow le 14/10/2026, non exécuté ; tests réels indispensables avant déploiement. Tester sur environnement jetable et bases factices, jamais contre GEN-1 ou une clé wallet réelle.  
> **Références :** [contrat RBAC P1.7](../Architecture/AUTH_DEBUG_2.1_RBAC_CONTRACT.md), [inventaire HTTP/CP/1 P1.3](AUTH_ENDPOINT_INVENTORY_v1.json), [compatibilité P1.6](../Architecture/AUTH_DEBUG_2.1_VERSION_COMPATIBILITY.md).  
> **Invariants :** tout refus = 0 modification, 0 émission d'ordre LIVE, 0 fuite d'objets d'autre client, 0 repli localBypass ; test de performance distinct.

## 1. Environnement de test proposé

- **DB fictive A/B** avec `CL000101` et `CL000102`, comptes ADMIN A, USER A, USER B, GUEST C ; rôles tous actifs sauf une fixture USER disabled, ADMIN-dernier unique ; objets fictifs propriétaires dans `profiles`, `settings`, `strategies`, `portfolio`, `notifications` et faux `walletId` sans secrets réels.
- **Clients HTTP distincts** avec cookies de session opaques stockés en fixtures, requêtes anonymes, cookies expirés et falsifiés, deux origines et CSRF valide/invalide.
- **Router/Engines simulés** : canaux CP/1 et vérificateurs Auth1 mockés ; un Engine non compatible, un autre qui valide les capacités, un compte changé de permissions/révoqué, une réponse artificielle de latence.
- **Jamais de clé crypto réelle** : test local avec clés temporaires, DB sous `/tmp` d'un environnement jetable, ports non publiés ; Trading LIVE explicitement désactivé.
- **Résultats par cas** : identité factice, méthode+route+action, classe de ressource, statut attendu (401/403/404/409/503/429), nombre de mutations `0`, résultat `0 fuite`, journaux expurgés, latence p95/p99.

## 2. Cas à automatiser

| ID | Cas / attaque | Réponse attendue et invariant |
| --- | --- | --- |
| **N01** | Requête privée sans cookie | 401 ; aucune donnée / mutation |
| **N02** | Cookie inventé, modifié ou associé à autre environnement | 401 ; aucune identité par défaut |
| **N03** | Session expirée, verrouillée après 5 min, logout ou compte désactivé | 401 ou 403 ; aucune donnée privée ; les timers de marché ne prolongent pas le verrou |
| **N04** | Core Auth indisponible / DB readonly indisponible / clé de signature absente | 503, aucune réactivation du bypass |
| **N05** | `/api/bootstrap`, `/ui-api/session` sans session | Réponse publique minimale ; ne contient ni `ADMIN` fictif, ni `clientId` privé |
| **N06** | GET `/admin`, `/admin/vaults`, `/ui-api/project-tree|project-file` par USER/GUEST | 403 ; aucune page/fichier confidentiel |
| **N07** | GET `/api/logs`, `/api/status`, `/api/settings`, usage global par USER/GUEST | 403 ou réponse de statut **distincte, minimale, publiée** ; pas de log/clé/config |
| **N08** | POST `/api/shutdown`, `/api/security/firewall/toggle` par USER/GUEST | 403 ; aucune action (y compris route hors `/api/admin/*`) |
| **N09** | POST/GET `/api/updates*`, `/api/ai-updates*`, `/api/admin/*` par USER/GUEST | 403 ; aucun état modifié ni contenu d'archives exposé |
| **N10** | USER manipule paramètres `apis`, `power`, `supervisor/brains`, `marketdata.settings.set` | 403 ; settings/secret partagé inchangé |
| **N11** | USER ou GUEST modifie feeds Fundamental via `/communication/v1/ui/write` | 403 ; rien ajouté/supprimé |
| **N12** | USER ou GUEST modifie registre Indicator global ou MarketData cache/registry | 403 ; aucune mutation partagée |
| **N13** | GUEST tente `/api/client/me` en mode écriture, `/api/profile`, `/api/notifications/read` | 403 ; zéro écriture serveur |
| **N14** | GUEST change marché/timeframe/indicateurs visuels dans le navigateur | Changement local autorisé **sans** requête de mutation serveur |
| **N15** | GUEST lance chat IA/test provider/collect/refresh/snapshot forcé | 403 ; aucune requête API externe facturable ni collecte |
| **N16** | GUEST consulte candles/news/catalogue partagé et assaini | 200, sans données personnelles, quotas respectés, pas de mutation |
| **N17** | USER A appelle `/api/client/me` avec body `clientId=B` ou header `x-iatb-ui-role:ADMIN` | Reste A ou 403 ; aucune élévation ni accès B |
| **N18** | USER A demande `portfolio.trades` / `portfolio.positions` de B via `walletId`, `account` ou `clientId` | 403/404 ; retour B interdit, pas de différence informative |
| **N19** | USER A tente accéder à stratégie/notification/usage IA de B par identifiant direct | 403/404, aucun objet B, aucun cache cross-tenant |
| **N20** | USER A demande une liste/agrégat avec filtre B, puis `count` ou export | Aucun contenu, total ou existence de B révélés |
| **N21** | USER A change son profil puis USER B relit | Seul A change ; transaction propriétaire sur les deux branches |
| **N22** | CLIENT `active_client_id` global modifié/falsifié | Ne modifie pas l'identité en session ni l'accès d'autres utilisateurs |
| **N23** | ADMIN tente lire le secret brut/cookie/clé wallet d'un autre USER | 403 ; ADMIN reste rôle applicatif, pas propriétaire universel des secrets |
| **N24** | Compte legacy `VISITOR` ou `SUPERADMIN` ou rôle inconnu | Aucune promotion ADMIN/USER implicite ; migration manuelle/audit ou refus |
| **N25** | GUEST crée/supprime mosaïque ou modification de réglage partagé | 403 ; préférences d'affichage local uniquement |
| **N26** | `POST /communication/v1/ui/read` avec `marketdata.financial.snapshot(force=true)` ou `marketdata.provider.test` par GUEST | 403 ; un endpoint nommé read n'autorise aucun effet externe |
| **N27** | `POST /communication/v1/ui/read` sur `fundamental.logs.recent` ou `marketdata.settings.get` par USER/GUEST | 403, données opérationnelles réservées à ADMIN |
| **N28** | `POST /communication/v1/ui/read` sur `trading.account.*` ou `portfolio.*` par GUEST | 403 ; aucune position/trade/balance privée |
| **N29** | `POST /communication/v1/ui/write` avec `caller.role=ADMIN` ou `clientId` falsifié | 403 ; Router vérifie preuve Core, sans confiance au body |
| **N30** | CP/1 token partagé présent mais aucune capacité humaine sur opération USER | 403 ; identité machine ne vaut pas identité humaine |
| **N31** | Capability Auth1 valide mais expirée/rejouée/action différente/body altéré | 403 ; zéro effet, nonce consommé une fois pour mutation |
| **N32** | `auth_protocol_version`, `permissions_version` ou `securityVersion` incompatibles | 403/409 ; refus avant Engine, aucun fallback legacy |
| **N33** | Router/Engine incapable de valider une capacité Auth1 (ancien Engine) | 503 ou 403 ; mutation non exécutée malgré CP/1 accepté |
| **N34** | Header `x-iatb-cp-token`, `x-forwarded-*`, `x-iatb-ui-role`, double header de sécurité navigateur | 403/ignorer selon politique ; aucun privilège interservices obtenu |
| **N35** | CSRF absent/invalide, Origin interdit, JSON volumineux/ambigu, méthode HTTP incorrecte | 403/413/405 ; aucune modification ni forwarding dangereux |
| **N36** | Appel du Router direct (sans passer par Gateway) pour read/write privé | Refus identique ; aucun accès bypass |
| **N37** | Appel direct Engine avec token machine et `caller` utilisateur spoofé | Refus de l'opération sensible à la frontière Engine |
| **N38** | Tentative `/api/internal/*` depuis navigateur ou path inconnu repris par proxy catch-all | 403/404 ; aucune route interne atteinte |
| **N39** | USER/GUEST demande wallet import/export/reveal, swap/transfer/sign en contexte Auth2.1 sans contrat wallet séparé | Aucun nouvel accès ni exécution ; préserver les données legacy, clé wallet absente non créée |
| **N40** | ADMIN tente activer ordre LIVE dans DEBUG avec permissions valides | Refus invariant `IATB_TRADING_LIVE=0`, pas d'ordre |
| **N41** | Deux sessions concurrentes : rôle USER A rétrogradé ou révoqué pendant action | Toute nouvelle mutation refusée, décision finale prise avec epoch à jour |
| **N42** | Dernier ADMIN désactivé/supprimé/rétrogradé via CLI ou Web | Web interdit ; CLI refuse si dernier ADMIN, avec audit et zéro changement |
| **N43** | DEBUG reçoit une preuve AUTH ou données de session RELEASE | Refus sans conversion automatique de rôle, client ou secret |
| **N44** | Mosaïque globale CREATE/DELETE par USER avant partition par client | 403 ; fonctionnalité existante administrable par ADMIN privé uniquement |
| **N45** | Anonyme tente /api/logout, /api/setup, /api/recovery/* et anciennes routes de bypass | Logout idempotent sans fuite ; setup/recovery fermées en mode Auth 2.1 |
| **N46** | GUEST et USER utilisent flux public MarketData sous forte charge | Pas d'Argon2id/TLS handshake par tick, pas de données privées, p95/p99 comparés à baseline |
| **N47** | Un objet de B s'infiltre dans une réponse cache partagée adressée à A | Rejet/alerte, pas de réutilisation de caches privés hors clé clientId |
| **N48** | Checkpoint, DB verrouillée ou migration temporaire pendant lecture privée | 503/fail closed, pas de nouvel ADMIN ni de default `clientId` |

## 3. Correspondance aux futurs tests par couche

| Niveau | Tests obligatoires | Mesure |
| --- | --- | --- |
| Gateway | N01–N16, N25, N34–N35, N38, N45 | 401/403/404 ; 0 fuite ; pages correctement bornées |
| Core Auth + SQLite | N01–N05, N17–N24, N32, N41–N43, N48 | Isolation `clientId`, révocation, conformité schéma |
| Router / CP/1 | N26–N33, N36 | Ne pas faire confiance au simple `caller` / CP token |
| Engines | N11–N12, N28–N33, N37, N40 | Autorisation métier finale, interdiction LIVE |
| Multi-tenant / cache | N18–N22, N47 | Aucun mélange A/B y compris historique, counts et exports |
| Ressources / performance | N15, N16, N26, N46 | Coût des endpoints `read`, p95/p99, non-régression significative |

Les contrôles de tests peuvent être signés ou HMAC en environnement fictif ; **aucun secret de GEN-1 ou clé wallet ne doit être utilisé**. Les URL/chemins publics ne sont pas une approbation d'exposition HTTP du Gateway.

## 4. Critères d'acceptation du futur développement (hors P1.7 conception)

- [ ] 48 scénarios automatisés avec fixtures A/B et les cinq catégories de principal, sur banc isolé.
- [ ] 0 mutation et 0 fuite pour **tous** les cas négatifs ; même refus Router direct/Engine direct.
- [ ] 0 création de clé Wallet ou master key, même si manquante sur copie de l'état actuel ; aucun live trade.
- [ ] Évolution des settings/notifications/stratégies vers owner-specific prouvée avant ouverture USER.
- [ ] Versions `auth_schema_version` / `auth_protocol_version` / `permissions_version` respectées sur toutes les frontières.
- [ ] Rapport de benchmark `baseline` / `auth-on` (p50/p95/p99, débit, CPU/RAM) et décision sur objectifs provisoires.
- [ ] Validation utilisateur d'une montée progressive, réversible, sans publication Internet avant HTTPS.

**P1.7 est clôturé comme contrat de conception après l'accord d'Overflow ; tous les 48 tests restent à réaliser à l'implémentation avant déploiement.** Toute nouvelle action nécessitera aussi une déclaration et ses tests, selon [RBAC Change Policy](AUTH_DEBUG_2.1_RBAC_CHANGE_POLICY.md).
