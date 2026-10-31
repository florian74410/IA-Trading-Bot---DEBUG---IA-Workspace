# IA-TB DEBUG 2.1 — Security Endpoint Audit v1

**Référence :** P1.3 — Routes HTTP, WebSocket et communications internes.  
**État :** P1.3 (inventaire) validé après lecture du rapport GEN-1 ; vérifications détaillées de l'exposition réseau transférées à P1.4 et à la Phase 7.  
**Source :** `fix/v2.0.1-debug` au commit `4a5024473e1318491f4f66516292274f4a4c852c`.  
**Sécurité de l'opération :** lecture GitHub seule, aucun test de requête sensible, aucun port ouvert ni changement de compte, Docker ou VPS.

## 1 — Cartographie générale

```text
[Client Web] -> [Gateway :8000] -> [Core :8001]  (sessions, Admin, comptes, wallets)
                               -> [Router :8021] -> Engines CP/1 internes
                               -> [Firewall :8017] (passerelle ADMIN)
[SSH] -> socket Unix privé -> Gateway
```

Le Compose canonique (`compose.debug.stack.yml:1-8,28-35,41-76,195-200`) **ne déclare aucun port publié**, désactive l'auth (`IATB_AUTH_MODE: disabled`) et désactive LIVE (`IATB_TRADING_LIVE: 0`). Les services écoutent `127.0.0.1` dans la namespace du Router. L'état réel de GEN-1, ses overrides, éventuels relais Socat et règles Contabo sont **à contrôler ultérieurement**, et ne sont pas déduits du Compose.

**Inventaire statique : 212 entrées** (routes nommées, alias de pages, adaptateurs et chemins génériques ; pas 212 endpoints réseau uniques).

| Service | Entrées |
| --- | ---: |
| Core | 110 |
| Firewall | 9 |
| Fundamental | 2 |
| Indicator | 2 |
| Liquidity | 2 |
| MarketData | 3 |
| Portfolio | 2 |
| Risk | 2 |
| Router | 18 |
| Strategy | 2 |
| Supervisor | 2 |
| Trading Engine | 2 |
| UI Gateway | 56 |

La liste intégrale est en [JSON](AUTH_ENDPOINT_INVENTORY_v1.json) et ci-dessous. Les protections cibles sont **proposées**, non implémentées. Ce recensement par reconnaissance de conditions JavaScript **ne garantit pas l'exhaustivité dynamique** : routes construites, imports tiers et changements entre branches restent à tester.

## 2 — Risques prioritaires repérés

| ID | Risque **si le service est atteignable** | Preuve source | Correction cible |
| --- | --- | --- | --- |
| R1 — CRITIQUE | Une requête Core obtient actuellement `session(req)` en mode bypass, sans vérifier réellement son cookie. `/api/bootstrap` répond `authenticated:true`. | `App/Core/Server/server.js:119-131,401-405,459-463` | Exiger un compte et une session active ; défaut **401** sans auth. |
| R2 — CRITIQUE | `/api/*` est proxyfié par Gateway. `allowCore()` ne contrôle les permissions que lorsque `AUTH_MODE==='disabled'` ; en mode activé, il passe une chaîne de rôle `SESSION` et ne vérifie pas l'authentification. | `App/UI/Gateway/ui_service.js:30-34,52-53` | Gateway + Core appliquent tous deux AuthN/RBAC ; aucune confiance envers les en-têtes fournis par le navigateur. |
| R3 — ÉLEVÉ | `POST /api/shutdown` et `POST /api/security/firewall/toggle` n'appartiennent pas aux gardes `/api/admin/*` / updates. | `App/Core/Server/server.js:462-463,494,511` | Actions ADMIN_ONLY explicitement bloquées pour autres rôles. |
| R4 — ÉLEVÉ | Router `POST /communication/v1/ui/write` possède une allowlist d'actions de modification (feeds, collecteurs, indicateurs, cache), mais pas d'identité utilisateur vérifiée au niveau de cette route. | `App/Core/Router/router.js:132-169,201-202` | Auth interservices + autorisation serveur par action. |
| R5 — ÉLEVÉ | Gateway sert `/ui-data/market/candles`, `/ui-api/session`, health et assets sans contrôle de session sur chaque chemin ; `ui_permissions.js` traite tout GET comme READ et ignore GUEST. | `App/UI/Gateway/ui_service.js:36-40,47-53`, `App/UI/Permissions/ui_permissions.js:8-18` | Public minimal, contrôle d'accès explicite des routes de données, rôle GUEST réel. |
| R6 — ÉLEVÉ | Les routes d'import/révélation de clés wallet, de modification de secrets et de transfert passent par la session locale ; propriété utilisateur à durcir. | `App/Core/Server/server.js:516-525,539-540,551-568` | AuthN + ownership par clientId + permissions fonctionnelles ; ne pas manipuler de wallet réel sur DEBUG. |
| R7 — ÉLEVÉ | Le système Clients peut résoudre/créer une identité depuis une session implicite et utilise une liaison persistée `active_client_id`. | `App/Core/Clients/client_service.js:20-57` | Aucune création implicite lors d'une requête anonyme ; identité seulement issue d'une session authentifiée. |
| R8 — ÉLEVÉ (interne) | `/api/thread/config|stop|restart|toggle|reload` sur Firewall ne montre pas de garde d'identité HTTP propre ; la barrière réseau est aujourd'hui essentielle. | `App/Core/Firewall/firewall_service.js:57-62` | Contrôle de provenance + identité de service + permissions ADMIN. |
| R9 — MOYEN/ÉLEVÉ | Le lecteur `/ui-api/project-file` peut renvoyer du contenu textuel de fichiers du projet non explicitement autorisés, hors exclusions limitées. | `App/UI/Gateway/ui_service.js:22-24,37-38` | Allowlist strictement limitée ; jamais clés/secrets/fichiers sensibles. |
| R10 — MOYEN | Les anciennes routes `/api/setup` et `/api/recovery/*` sont présentes. La récupération peut réinitialiser le coffre. | `App/Core/Server/server.js:406-457` | Neutraliser les routes publiques historiques ; administration des comptes par CLI. |
| R11 — MOYEN | Router transmet tout chemin HTTP restant au Core, sans allowlist explicite. | `App/Core/Router/router.js:211-212` | Routage explicite ou proxy contrôlé avec refus par défaut. |

Les niveaux ci-dessus reflètent **l'impact potentiel** en cas d'accès au port concerné. Ils ne prouvent **aucune compromission actuelle ni exposition Internet**.

## 3 — Communications CP/1 et WebSocket

- **À préserver :** l'adaptateur CP/1 commun valide jeton `X-IATB-CP-Token`, signature HMAC du corps et actions déclarées (`App/Core/Communication/component_cp1_adapter.js:15-16`).
- Router vérifie le jeton CP/1 pour request, register, event, registry, runtime (`App/Core/Router/router.js:172-180`), **mais pas de la même manière pour UI read/write**.
- L'allowlist UI read/write actuelle filtre actions et arguments mais **ne peut pas remplacer la vérification d'une identité GUEST/USER/ADMIN**.
- Aucun serveur WebSocket navigateur explicite dans les serveurs HTTP canoniques inspectés. `App/MarketData/Transport/simple_websocket.js` est **un client sortant** vers les providers. Existence d'autres handlers d'upgrade/dépendances : **à confirmer par inspection de build et tests privés**.
- Le pont SSH `App/Tools/ssh_ui_bridge.js:30-45` utilise un socket Unix en mode `0600` ; n'est pas une authentification navigateur.

## 4 — Politique d'accès cible

| Catégorie | Politique |
| --- | --- |
| PUBLIC_MINIMAL | Login, ressources nécessaires, signal d'état non sensible |
| AUTH_READ | Session déverrouillée et lecture autorisée ; ownership pour données privées |
| USER_WRITE | ADMIN/USER pour ses propres données ; refus GUEST |
| ADMIN_ONLY | Administration, arrêt/restart, modification Firewall/Engines, mise à jour |
| INTERNAL_CP | Canal interservices protégé, jamais exposé au navigateur |
| DENY | Route inconnue, ancien setup/récupération supprimé, bypass |

**Toute route inconnue doit être refusée par défaut.** Vérifier à la fois Gateway et Core/Router, indépendamment de l'interface.

## 5 — Réserves / tests complémentaires avant validation totale

- [ ] Contrôler les handlers de routes dynamiques et appels frontend `fetch`, éventuels `upgrade` WebSocket et extensions au-delà des points d'entrée inspectés.
- [ ] Confirmer sur GEN-1 **en lecture seule** la liste d'écoute et la configuration réseau (Compose overrides, Socat, Contabo).
- [ ] Vérifier l'authentification du proxy interne et le rejet des en-têtes `x-iatb-ui-*` et `x-iatb-cp-*` falsifiés.
- [ ] Préparer les tests négatifs non destructifs pour anonyme, session expirée, USER et GUEST.
- [ ] Comparer le commit réellement déployé avec la branche source, sans supposer qu'ils sont identiques.

### Validation P1.3

**Rapport statique produit et inventaire exporté ; validation utilisateur requise.** Les examens dynamiques restent à planifier au jalon de validation, sans perturber les moteurs. Laisser la case de la fiche de travail `[ ]` jusqu'au retour accepté.

---

## Annexe — Inventaire détaillé des routes relevées

### Core

| Méthode | Chemin | Source |
| --- | --- | --- |
| POST | `/api/internal/ai-gateway/cp/v1` | `Server/server.js:149` |
| POST | `/api/internal/x-gateway/cp/v1` | `Server/server.js:176` |
| GET | `/api/health` | `Server/server.js:404` |
| GET | `/api/bootstrap` | `Server/server.js:405` |
| POST | `/api/setup` | `Server/server.js:406` |
| POST | `/api/login` | `Server/server.js:422` |
| POST | `/api/recovery/request` | `Server/server.js:434` |
| POST | `/api/recovery/confirm` | `Server/server.js:445` |
| POST | `/api/logout` | `Server/server.js:458` |
| ANY_GUARD | `/api/ai-updates` | `Server/server.js:462` |
| ANY_GUARD | `/api/ai-updates/*` | `Server/server.js:462` |
| ANY_GUARD | `/api/updates` | `Server/server.js:462` |
| ANY_GUARD | `/api/updates/*` | `Server/server.js:462` |
| ANY_GUARD | `/api/admin/*` | `Server/server.js:463` |
| GET | `/api/bank/vaults` | `Server/server.js:464` |
| GET | `/api/admin/bank/vaults` | `Server/server.js:465` |
| POST | `/api/admin/bank/vaults` | `Server/server.js:466` |
| GET | `/api/admin/session` | `Server/server.js:467` |
| GET | `/api/admin/status` | `Server/server.js:468` |
| GET | `/api/admin/console/catalog` | `Server/server.js:469` |
| POST | `/api/admin/console/execute` | `Server/server.js:470` |
| GET | `/api/admin/logs` | `Server/server.js:471` |
| POST | `/api/admin/logs/clear` | `Server/server.js:472` |
| POST | `/api/admin/service/restart` | `Server/server.js:473` |
| POST | `/api/admin/process/toggle` | `Server/server.js:474` |
| POST | `/api/admin/firewall/thread/stop` | `Server/server.js:475` |
| POST | `/api/admin/firewall/thread/restart` | `Server/server.js:476` |
| POST | `/api/admin/firewall/toggle` | `Server/server.js:477` |
| POST | `/api/admin/indicators/reload` | `Server/server.js:478` |
| POST | `/api/admin/cache/clear` | `Server/server.js:479` |
| POST | `/api/admin/core/restart` | `Server/server.js:480` |
| POST | `/api/admin/system/restart` | `Server/server.js:481` |
| POST | `/api/admin/system/stop-total` | `Server/server.js:488` |
| POST | `/api/shutdown` | `Server/server.js:494` |
| GET | `/api/updates` | `Server/server.js:495` |
| POST | `/api/updates/upload` | `Server/server.js:496` |
| POST | `/api/updates/fetch` | `Server/server.js:497` |
| POST | `/api/updates/install` | `Server/server.js:498` |
| GET | `/api/ai-updates/settings` | `Server/server.js:499` |
| POST | `/api/ai-updates/settings` | `Server/server.js:500` |
| GET | `/api/ai-updates` | `Server/server.js:501` |
| GET | `/api/ai-updates/package` | `Server/server.js:502` |
| POST | `/api/ai-updates/execute` | `Server/server.js:504` |
| GET | `/api/mosaics` | `Server/server.js:506` |
| GET | `/api/mosaics/runtime` | `Server/server.js:507` |
| POST | `/api/mosaics/create` | `Server/server.js:508` |
| POST | `/api/mosaics/delete` | `Server/server.js:509` |
| POST | `/api/security/firewall/toggle` | `Server/server.js:511` |
| GET | `/api/client/me` | `Server/server.js:512` |
| POST | `/api/client/me` | `Server/server.js:513` |
| GET | `/api/admin/clients/status` | `Server/server.js:514` |
| GET | `/api/admin/clients` | `Server/server.js:515` |
| GET | `/api/security/wallets` | `Server/server.js:516` |
| GET | `/api/security/wallets/networks` | `Server/server.js:517` |
| GET | `/api/security/wallets/next-id` | `Server/server.js:518` |
| POST | `/api/security/wallets/create` | `Server/server.js:519` |
| POST | `/api/security/wallets/import` | `Server/server.js:520` |
| POST | `/api/security/wallets/remove-key` | `Server/server.js:521` |
| GET | `/api/security/wallets/export` | `Server/server.js:522` |
| POST | `/api/security/wallets/reveal` | `Server/server.js:524` |
| POST | `/api/security/wallets/remove` | `Server/server.js:525` |
| GET | `/api/status` | `Server/server.js:526` |
| GET | `/api/logs` | `Server/server.js:527` |
| GET | `/api/settings` | `Server/server.js:528` |
| POST | `/api/settings/language` | `Server/server.js:537` |
| POST | `/api/settings/general` | `Server/server.js:538` |
| POST | `/api/settings/apis` | `Server/server.js:539` |
| POST | `/api/settings/apis/clear` | `Server/server.js:540` |
| POST | `/api/settings/test-openai` | `Server/server.js:541` |
| POST | `/api/settings/test-zerox` | `Server/server.js:542` |
| POST | `/api/settings/test-x` | `Server/server.js:543` |
| POST | `/api/settings/supervisor/brains` | `Server/server.js:544` |
| POST | `/api/settings/ai` | `Server/server.js:545` |
| POST | `/api/settings/portfolio` | `Server/server.js:546` |
| POST | `/api/settings/power` | `Server/server.js:547` |
| POST | `/api/settings/modulation` | `Server/server.js:548` |
| POST | `/api/app-settings/select` | `Server/server.js:549` |
| GET | `/api/transfers/status` | `Server/server.js:551` |
| GET | `/api/transfers/assets` | `Server/server.js:552` |
| POST | `/api/transfers/preview` | `Server/server.js:553` |
| POST | `/api/transfers/execute` | `Server/server.js:554` |
| GET | `/api/transfers/history` | `Server/server.js:555` |
| GET | `/api/onchain/status` | `Server/server.js:557` |
| GET | `/api/onchain/identity` | `Server/server.js:558` |
| GET | `/api/onchain/wallet` | `Server/server.js:559` |
| GET | `/api/onchain/history` | `Server/server.js:560` |
| GET | `/api/onchain/tx` | `Server/server.js:561` |
| GET | `/api/swap-bridge/status` | `Server/server.js:562` |
| POST | `/api/swap-bridge/quote` | `Server/server.js:563` |
| POST | `/api/swap-bridge/prepare` | `Server/server.js:564` |
| POST | `/api/swap-bridge/execute` | `Server/server.js:565` |
| GET | `/api/swap-bridge/history` | `Server/server.js:566` |
| POST | `/api/swap-bridge/submitted` | `Server/server.js:567` |
| POST | `/api/swap-bridge/track` | `Server/server.js:568` |
| GET | `/api/notifications/settings` | `Server/server.js:570` |
| POST | `/api/notifications/settings` | `Server/server.js:571` |
| GET | `/api/notifications` | `Server/server.js:572` |
| POST | `/api/notifications/test` | `Server/server.js:573` |
| POST | `/api/notifications/read` | `Server/server.js:574` |
| GET | `/api/credits/usage` | `Server/server.js:576` |
| POST | `/api/credits/pricing` | `Server/server.js:577` |
| GET | `/api/token-usage` | `Server/server.js:578` |
| POST | `/api/profile` | `Server/server.js:579` |
| POST | `/api/session/change-password` | `Server/server.js:580` |
| POST | `/api/session/change-email` | `Server/server.js:581` |
| POST | `/api/session/test-email` | `Server/server.js:597` |
| GET | `/api/chart-viewer/status` | `Server/server.js:598` |
| POST | `/api/chart-viewer/chat` | `Server/server.js:599` |
| POST | `/api/companion/chat` | `Server/server.js:600` |
| POST | `/api/chat` | `Server/server.js:601` |

### Firewall

| Méthode | Chemin | Source |
| --- | --- | --- |
| GET | `/health` | `Firewall/firewall_service.js:55` |
| POST | `/api/data/inspect` | `Firewall/firewall_service.js:56` |
| GET | `/api/thread/config` | `Firewall/firewall_service.js:57` |
| POST | `/api/thread/config` | `Firewall/firewall_service.js:58` |
| POST | `/api/thread/stop` | `Firewall/firewall_service.js:59` |
| POST | `/api/thread/restart` | `Firewall/firewall_service.js:60` |
| POST | `/api/thread/toggle` | `Firewall/firewall_service.js:61` |
| POST | `/api/thread/reload` | `Firewall/firewall_service.js:62` |
| POST | `/cp/v1` | `Firewall/firewall_service.js:63` |

### Fundamental

| Méthode | Chemin | Source |
| --- | --- | --- |
| POST | `/cp/v1` | `Engine/fundamental_service.js:134` |
| GET | `/health` | `Engine/fundamental_service.js:134` |

### Indicator

| Méthode | Chemin | Source |
| --- | --- | --- |
| GET | `/health` | `Engine/indicator_service.js:85` |
| POST | `/cp/v1` | `Engine/indicator_service.js:86` |

### Liquidity

| Méthode | Chemin | Source |
| --- | --- | --- |
| POST | `/cp/v1` | `Engine/liquidity_service.js:82` |
| GET | `/health` | `Engine/liquidity_service.js:82` |

### MarketData

| Méthode | Chemin | Source |
| --- | --- | --- |
| GET | `/health` | `MarketData/market_data_service.js:130` |
| GET | `/candles` | `MarketData/market_data_service.js:131` |
| POST | `/cp/v1` | `MarketData/market_data_service.js:131` |

### Portfolio

| Méthode | Chemin | Source |
| --- | --- | --- |
| POST | `/cp/v1` | `Engine/portfolio_service.js:22` |
| GET | `/health` | `Engine/portfolio_service.js:22` |

### Risk

| Méthode | Chemin | Source |
| --- | --- | --- |
| GET | `/health` | `Engine/risk_service.js:185` |
| POST | `/cp/v1` | `Engine/risk_service.js:190` |

### Router

| Méthode | Chemin | Source |
| --- | --- | --- |
| ANY | `/router-health-internal` | `Router/router.js:195` |
| ANY | `/router-health` | `Router/router.js:196` |
| GET | `/communication-health` | `Router/router.js:197` |
| POST | `/communication-test` | `Router/router.js:198` |
| POST | `/communication/v1/register` | `Router/router.js:199` |
| POST | `/communication/v1/request` | `Router/router.js:200` |
| POST | `/communication/v1/ui/read` | `Router/router.js:201` |
| POST | `/communication/v1/ui/write` | `Router/router.js:202` |
| POST | `/communication/v1/event` | `Router/router.js:203` |
| GET | `/communication/v1/events` | `Router/router.js:204` |
| GET | `/communication/v1/capabilities` | `Router/router.js:205` |
| GET | `/communication/v1/registry` | `Router/router.js:206` |
| GET | `/communication/v1/registry/*` | `Router/router.js:207` |
| POST | `/communication/v1/client/plan` | `Router/router.js:208` |
| POST | `/communication/v1/client/ack` | `Router/router.js:209` |
| GET | `/communication/v1/runtime` | `Router/router.js:210` |
| GET | `/market-data/candles` | `Router/router.js:211` |
| ANY | `/*` | `Router/router.js:212` |

### Strategy

| Méthode | Chemin | Source |
| --- | --- | --- |
| POST | `/cp/v1` | `Engine/strategy_service.js:33` |
| GET | `/health` | `Engine/strategy_service.js:33` |

### Supervisor

| Méthode | Chemin | Source |
| --- | --- | --- |
| POST | `/cp/v1` | `Supervisor/supervisor_service.js:37` |
| GET | `/health` | `Supervisor/supervisor_service.js:37` |

### Trading Engine

| Méthode | Chemin | Source |
| --- | --- | --- |
| POST | `/cp/v1` | `trading-engine/trading_service.js:30` |
| GET | `/health` | `trading-engine/trading_service.js:30` |

### UI Gateway

| Méthode | Chemin | Source |
| --- | --- | --- |
| GET/HEAD | `/` | `Gateway/ui_service.js:15` |
| GET/HEAD | `/admin` | `Gateway/ui_service.js:15` |
| GET/HEAD | `/admin/` | `Gateway/ui_service.js:15` |
| GET/HEAD | `/admin/vaults` | `Gateway/ui_service.js:15` |
| GET/HEAD | `/admin/vaults/` | `Gateway/ui_service.js:15` |
| GET/HEAD | `/bank` | `Gateway/ui_service.js:15` |
| GET/HEAD | `/bank/` | `Gateway/ui_service.js:15` |
| GET/HEAD | `/bank/keys` | `Gateway/ui_service.js:15` |
| GET/HEAD | `/bank/keys/` | `Gateway/ui_service.js:15` |
| GET/HEAD | `/chart-viewer` | `Gateway/ui_service.js:15` |
| GET/HEAD | `/chart-viewer/` | `Gateway/ui_service.js:15` |
| GET/HEAD | `/charts` | `Gateway/ui_service.js:15` |
| GET/HEAD | `/fundamental` | `Gateway/ui_service.js:15` |
| GET/HEAD | `/fundamental/` | `Gateway/ui_service.js:15` |
| GET/HEAD | `/ia-trading` | `Gateway/ui_service.js:15` |
| GET/HEAD | `/ia-trading/` | `Gateway/ui_service.js:15` |
| GET/HEAD | `/keys` | `Gateway/ui_service.js:15` |
| GET/HEAD | `/keys/` | `Gateway/ui_service.js:15` |
| GET/HEAD | `/portfolio` | `Gateway/ui_service.js:15` |
| GET/HEAD | `/portfolio/` | `Gateway/ui_service.js:15` |
| GET/HEAD | `/settings` | `Gateway/ui_service.js:15` |
| GET/HEAD | `/settings/` | `Gateway/ui_service.js:15` |
| GET/HEAD | `/statistiques` | `Gateway/ui_service.js:15` |
| GET/HEAD | `/statistiques/` | `Gateway/ui_service.js:15` |
| GET/HEAD | `/strategies` | `Gateway/ui_service.js:15` |
| GET/HEAD | `/strategies/` | `Gateway/ui_service.js:15` |
| GET/HEAD | `/strategy` | `Gateway/ui_service.js:15` |
| GET/HEAD | `/strategy/` | `Gateway/ui_service.js:15` |
| GET/HEAD | `/trading` | `Gateway/ui_service.js:15` |
| GET/HEAD | `/trading/` | `Gateway/ui_service.js:15` |
| GET | `/ui-health` | `Gateway/ui_service.js:36` |
| GET | `/ui-api/project-tree` | `Gateway/ui_service.js:37` |
| GET | `/ui-api/project-file` | `Gateway/ui_service.js:38` |
| GET | `/ui-api/session` | `Gateway/ui_service.js:39` |
| GET | `/communication-health` | `Gateway/ui_service.js:40` |
| GET | `/router-health` | `Gateway/ui_service.js:41` |
| POST | `/communication-test` | `Gateway/ui_service.js:42` |
| POST | `/communication/v1/ui/read` | `Gateway/ui_service.js:43` |
| POST | `/communication/v1/ui/write` | `Gateway/ui_service.js:44` |
| POST | `/communication/v1/client/ack` | `Gateway/ui_service.js:45` |
| ANY | `/communication/*` | `Gateway/ui_service.js:46` |
| ANY | `/communication/*` | `Gateway/ui_service.js:46` |
| GET/HEAD | `/admin` | `Gateway/ui_service.js:47` |
| GET/HEAD | `/admin/` | `Gateway/ui_service.js:47` |
| GET/HEAD | `/admin/vaults` | `Gateway/ui_service.js:47` |
| GET/HEAD | `/admin/vaults/` | `Gateway/ui_service.js:47` |
| GET/HEAD | `/assets/*` | `Gateway/ui_service.js:48` |
| GET/HEAD | `/assets/*` | `Gateway/ui_service.js:48` |
| ANY | `/firewall-admin/*` | `Gateway/ui_service.js:49` |
| ANY | `/firewall-admin/*` | `Gateway/ui_service.js:49` |
| GET | `/ui-data/market/candles` | `Gateway/ui_service.js:51` |
| GET | `/ui-data/market/candles` | `Gateway/ui_service.js:51` |
| ANY | `/api/internal/*` | `Gateway/ui_service.js:52` |
| ANY | `/api/internal/*` | `Gateway/ui_service.js:52` |
| ANY | `/api/*` | `Gateway/ui_service.js:53` |
| ANY | `/api/*` | `Gateway/ui_service.js:53` |

---

## 6 — Audit complémentaire statique P1.3 (version 1.1, reconcilié)

**Objectif :** réduire les incertitudes du catalogue initial sans toucher à GEN-1. Sources relues : services HTTP canoniques, fichiers frontend et tests existants de la branche `fix/v2.0.1-debug`.

### A. Routes dynamiques et appels navigateur

- **UI Gateway :** `/api/*` relaie les requêtes vers Core, `/assets/*` sert les ressources, `/firewall-admin/*` relaie vers Firewall et `/ui-data/market/candles` contacte Router. Les pages sont résolues par `PAGE_MAP`. Références : `App/UI/Gateway/ui_service.js:15,47-53`.
- **Router :** toute requête non traitée explicitement est proxyfiée vers Core (`App/Core/Router/router.js:211-212`). Attention aux en-têtes navigateur relayés (`App/UI/Gateway/ui_service.js:27-30` et `App/Core/Router/router.js:183-185`). Il faudra **retirer** les en-têtes internes injectés par un navigateur et établir la confiance interservices.
- **Appels frontend :** parcours de `App/Frontend/Pages/app_v1.0.html`, `settings.html`, `admin_v1.0.html` et des principaux contrôleurs JS (Admin, wallets, transferts, swap, Trading IA, Fundamental, indicateurs, notifications, navigation, portfolio, mises à jour). Les flux incluent notamment `/communication/v1/ui/read`, `/communication/v1/ui/write`, `/api/settings/*`, `/api/admin/*`, `/api/security/wallets/*`, `/api/transfers/*`, `/api/ai-updates/*`.
- **Route à confirmer :** l'interface indicateurs contient également des chemins `/api/registry/reload`, `/api/definition/create`, `/api/compute-market-batch`, etc. Ils sont appelés dynamiquement et nécessitent une correspondance de routage, sans conclure qu'ils sont accessibles/fonctionnels.
- **Permissions :** `App/UI/Permissions/ui_permissions.js:8-18` classe tout GET/HEAD en `READ`, ne possède pas de rôle GUEST et normalise les rôles inconnus en USER. En mode authentifié, cela ne doit jamais donner un droit d'écriture à GUEST, ni rendre des données privées lisibles par simple GET.

### B. WebSocket et processus d'entrée

- Vérification de `App/UI/Gateway/ui_service.js`, `App/Core/Server/server.js`, `App/Core/Router/router.js` et des serveurs canoniques Firewall, MarketData, Fundamental, Indicator, Liquidity, Strategy, Risk, Portfolio, Supervisor et Trading : **aucun serveur WebSocket navigateur ni handler `upgrade` explicite détecté dans cet ensemble**.
- `App/MarketData/Transport/simple_websocket.js:23-40` est un **client WebSocket sortant** (providers) ; ne pas le compter comme port HTTP entrant.
- `App/Tools/ssh_ui_bridge.js:30-45` crée un socket Unix privé de relais vers la Gateway, non une socket WebSocket publique.
- **Limite :** inspection des points d'entrée canoniques uniquement ; ne garantit pas qu'un override/deuxième process du déploiement réel n'expose pas d'endpoint supplémentaire.

### C. Vérification des garde-fous interservices

- Les endpoints CP/1 basés sur l'adaptateur commun vérifient jeton partagé et HMAC (`App/Core/Communication/component_cp1_adapter.js:15-16`) ; ces contrôles doivent être maintenus.
- Les endpoints du Router `/communication/v1/request` et apparentés exigent un jeton CP (`App/Core/Router/router.js:172-180`), mais `/communication/v1/ui/read` et `/communication/v1/ui/write` sont sur un autre chemin sans vérification de session utilisateur propre (`...:87-169`).
- `App/UI/Gateway/ui_service.js:33` demande `/api/bootstrap` au Core en mode authentifié ; le Core répond actuellement `authenticated:true` de façon inconditionnelle (`App/Core/Server/server.js:405`).
- **Conséquence de conception :** ne pas simplement changer `IATB_AUTH_MODE=enabled` : il faut implémenter la chaîne de validation session + RBAC sur Gateway/Core/Router avant toute exposition.

### D. Contrôle réel GEN-1 : commande CLI déjà disponible

**Sur Macro, utiliser uniquement la commande existante :**

```bash
iatb vps audit
```

Ce diagnostic existant (`IA-TB-CLI/tools/gen1_full_audit.py`) vérifie, en lecture seule, l'état des conteneurs DEBUG, les **numéros** de ports TCP en écoute, l'éventuel listener 8080, l'état du Trading Engine et plusieurs health checks. Il masque les secrets, les lignes de bases et les logs bruts. Il demande le mot de passe `sudo` du VPS dans un terminal interactif, sans le stocker, et récupère un rapport sur Macro.

**Résultat attendu pour l'étape :**
- état Docker connu et liste cohérente des conteneurs DEBUG ;
- présence ou absence explicite du port temporaire 8080 ;
- pas de Trading Engine LIVE ;
- fichier local `GEN1_AUDIT` généré et transmis pour lecture ;
- anomalies signalées, sans aucun changement de Docker, des clés ou des ports.

**Limites du CLI actuel :** cette commande n'inclut pas les adresses d'écoute de `ss`, les `HostConfig.PortBindings` complets, les arguments Socat, les overrides Compose réels ni les règles du pare-feu hébergé Contabo. Par conséquent, **un audit complémentaire ciblé peut rester nécessaire** après le premier retour. Si c'est le cas, ajouter une sous-commande bornée `iatb vps auth-surface` (lecture seule), plutôt que demander des commandes SSH dangereuses ou exposant des secrets.

### État de validation

- [x] Complément GitHub : routes dynamiques, flux frontend et identification des canaux CP/1 concernés.
- [x] Vérification statique : pas de WebSocket serveur explicite dans les points d'entrée canoniques inspectés.
- [x] Rapport `iatb vps audit` du 13/10/2026 à 23:12 UTC reçu et analysé après récupération via CLI 1.3.1.
- [ ] Transféré à P1.4 / Phase 7 : adresses d'écoute, namespaces, ports publiés, relais Socat, filtres Contabo et différences de version réelle.
- [x] P1.3 coché comme inventaire des voies d'accès, après réception du rapport GEN-1 ; ce n'est pas une certification d'absence d'exposition Internet.

**P1.3 inventaire validé après état réel GEN-1 ; les tests négatifs de sécurité et la validation d'exposition restent bloquants avant mise en ligne.**

---

## 7 — Réconciliation avec le rapport réel GEN-1 (13 octobre 2026, 23:12 UTC)

**Source :** audit CLI 1.3.1 transmis par l'utilisateur après récupération. Les données brutes ne sont pas commitées dans GitHub. Aucune modification du VPS.

| Contrôle | Observation réelle | Déduction pour Auth DEBUG 2.1 |
| --- | --- | --- |
| Docker | 13/13 conteneurs attendus `running`, 0 redémarrage | Topologie DEBUG cohérente à l'instant de l'audit |
| Trading LIVE | Aucun conteneur Trading trouvé ; Engine non exécuté | Préserver ce comportement en DEBUG 2.1 |
| Auth | `/ui-health` répond 200 avec `authMode=disabled` | Ne pas exposer l'UI à Internet avant Auth et transport sécurisé |
| Ports hôte | 22, 25, 53, 5355 ; port HTTP 8080 absent | Ne prouve pas que les services internes, relais ou firewall externe sont inaccessibles |
| Santé HTTP | UI, Firewall, MarketData, Fundamental = 200 ; Core, Router = 404 sur `/health` | Probablement des chemins de contrôle incorrects : Core utilise `/api/health`, Router `/router-health` |
| SQLite | `clients.sqlite` quick_check OK ; `clients=1`, `client_accounts=0`, `client_wallets=0`, `client_audit=1` | Préserver l'identité existante ; création du premier ADMIN via CLI après sauvegarde, sans suppression aveugle |
| Stockage | 8 SQLite avec quick_check OK, WAL/SHM présents | Sauvegarde SQLite transactionnellement cohérente + secrets persistants nécessaires |
| Ressources | ~10 Gio RAM et ~82 Go disque disponibles, charge faible | Marge suffisante pour audit/développement ; pas de benchmark Auth |
| Logs | 0 ligne Docker sur fenêtre auditée malgré logs applicatifs locaux | Ne pas conclure que zéro erreur est survenue ; compléter observabilité séparément |

**Observations secondaires :** 58 feeds Fundamental, 912 raw items, 647 événements ; 72 498 appels télémétriques MarketData, dont 1 572 erreurs HTTP 429 CoinGecko. Cela relève de l'amélioration des providers, pas de P1.3.

### Décision de clôture P1.3

- [x] Inventaire statique des routes et canaux, routes dynamiques principales, transports WebSocket/CP1 et risques prioritaires.
- [x] Confrontation à l'état réel des conteneurs, du Gateway et des ports hôte, via rapport utilisateur.
- [ ] **À traiter pendant P1.4 puis la Phase 7** : IP d'écoute par namespace, `docker port`/PortBindings, Socat/proxy/overrides, règles firewall/Contabo et authentification des en-têtes de confiance.

**Conclusion :** P1.3 clos **comme inventaire**. Cette clôture n'atteste PAS de l'absence d'exposition Internet et n'autorise aucune publication du Gateway.

### Point suivant proposé : P1.4 — Frontières de confiance

Définir un contrat **navigateur -> Gateway -> Core -> Router/Engines** avec authentification des services, session humaine vérifiée, `clientId` exclusivement issu du compte authentifié, permissions granulaires et refus par défaut. Filtrer les en-têtes entrants `x-iatb-*` et les en-têtes d'identité transmis par le navigateur. Le secret CP1 prouve l'origine du service, pas le rôle humain ; la frontière Router doit imposer un contrôle explicite pour chaque écriture.

La validation de P1.4 nécessitera une matrice de flux autorisés/interdits, une preuve du contrôle des frontières internes et la liste des vérifications réseau avant exposition.
