# IA-TB DEBUG 2.1 — P1.4 — Trust Boundary Contract v1

> **Statut :** spécification technique P1.4 rédigée après validation des quatre principes par Overflow ; **P1.4 clôturé au niveau conception après validation des principes et relevé réseau ; implémentation et benchmarks non réalisés**.  
> **Source :** `fix/v2.0.1-debug` / `App` ; inventaire [P1.3](../Security/AUTH_ENDPOINT_AUDIT_v1.md) ; état GEN-1 du 13/10/2026 23:12 UTC.  
> **Objectif :** empêcher toute usurpation de rôle/compte et tout contournement par route interne **sans ralentissement significatif du chemin critique marché/trading**.  
> **Portée de ce commit :** documentation et contrat uniquement ; aucun binaire ni serveur DEBUG, conteneur, port, compte, wallet ou secret n'est modifié.

## 1. Décisions de sécurité validées

1. **Core Auth = autorité des identités humaines** : session, `clientId`, rôle, statut locked/revoked/expired, droits et ownership ; jamais issus du navigateur.
2. **Gateway = filtre d'entrée et application du contrat Web** : pages, méthodes, routes, CSRF, Origin, limites de corps, ressources autorisées et suppression des en-têtes internes.
3. **Router / Engines = deuxième contrôle obligatoire** : authentifier le *service appelant*, puis l'autorisation *de l'utilisateur à l'origine de l'action* avant de traiter les données privées, les mutations ou les fonctions métier ; le jeton CP/1 seul n'atteste pas du rôle humain.
4. **Fail closed** : sur identité, session, clé, base de comptes, contrat de version ou autorité indisponible, renvoyer un refus (401/403/503 selon cas) et ne jamais réactiver le mode bypass.

**Cinquième contrainte non négociable :** la sécurité reste une opération courte sur le chemin normal ; Argon2id, ouverture de connexions TLS et lectures coûteuses sont hors boucle marché/trading. La latence doit être mesurée, pas supposée. Voir [Performance Security Plan](../Security/AUTH_DEBUG_2.1_SECURITY_PERFORMANCE.md).

## 2. Constat technique à l'origine du contrat

| Source actuelle | Fait constaté | Décision de correction |
| --- | --- | --- |
| `App/Core/Server/server.js:121,401-405` | `session(req)` fournit une identité locale de bypass ; `/api/bootstrap` répond `authenticated:true` | Interdire le bypass dès que le nouveau mode Auth est actif ; le Core atteste les sessions réelles |
| `App/UI/Gateway/ui_service.js:27-34,52-53` | Proxy recopie les en-têtes navigateur sauf quelques hop-by-hop, puis ajoute `x-iatb-ui-role` / `permission`; `allowCore` n'authentifie pas en mode Auth activé | En-têtes internes réservés aux services ; un simple libellé `SESSION` n'est pas une identité |
| `App/Core/Router/router.js:87-169,199-212` | `/communication/v1/ui/read|write` utilise allowlists et insère `q.caller.role` sans contexte humain vérifié ; le Router a un proxy de repli | Autorisation dédiée pour chaque `target+action` ; pas de confiance envers `caller` fourni par le réseau ; supprimer le proxy ouvert |
| `App/Core/Communication/communication_protocol_v1.js:12-17` | Secret CP/1 commun et HMAC sur requêtes CP ; `timestamp` et `request_id` | Préserver les contrôles CP ; ajouter une preuve *indépendante* de l'identité/permission humaine |
| `App/Core/Communication/component_cp1_adapter.js:15-16` | Validation jeton + HMAC pour CP/1 commun | Poursuivre en vérifiant l'autorisation d'acteur pour toute action reliée à une requête humaine |
| `compose.debug.stack.yml:8-35,40-190` | Services partagent `network_mode: service:router`, accès aux mêmes volumes runtime, UID/GID communs ; écoute locale `127.0.0.1` | **Le loopback partagé n'isole pas les services les uns des autres.** Ne pas traiter `localhost` comme identité ; isoler les clés de signature et limiter les montages/identités de processus avant ouverture |
| Rapport GEN-1 | 13/13 services en marche, `authMode=disabled`, pas de 8080 parmi les écouteurs hôte à l'instant de l'audit | Tests Auth uniquement en tunnel/accès privé ; inventaire réseau élargi requis avant ouverture |

### Limite explicite de l'environnement actuel

L'ensemble des services partage actuellement le même espace réseau et plusieurs montages persistants. Un processus ayant accès au secret CP/1 commun peut s'authentifier **comme participant CP/1**, même s'il ne devrait pas pouvoir autoriser des opérations utilisateur. Un secret HMAC additionnel **n'apporte pas de séparation entre services** si ce secret est distribué à tous. L'architecture cible exige donc : clés Auth distinctes de CP/1, montages/permissions limités au signataire et au vérificateur prévus, services à droits minimaux ; puis vérification des permissions OS et des namespaces. **Bloquant pour une mise en ligne, pas une modification de Docker dans cette étape.**

## 3. Matrice de frontières de confiance

| Frontière | Informations dignes de confiance | Vérification obligatoire | Interdit |
| --- | --- | --- | --- |
| Navigateur → Gateway | **Aucun** rôle, identité ou en-tête de provenance reçu du client | Chemin/méthode allowlist, validation input, session/CSRF/Origin pour routes protégées | Choisir `clientId`, `role`, `caller`, ou injecter un jeton CP/1 |
| Gateway → Core | Session opaque du navigateur (uniquement sur le canal autorisé) | Core vérifie hash du cookie, compte actif, lock, révocation, durée, `clientId`, rôle et ownership | `authenticated:true` fixé, `localBypass`, confiance dans `x-iatb-ui-role` |
| Gateway → Router (action UI) | **Preuve signée courte émise après autorisation Core**, pour une action précise | Autorité interne authentifiée, audience Router, signature, expiration, `target`, `action`, empreinte des arguments, policy version, anti-rejeu si mutation | Accepter `q.caller.role` du corps sans vérification ; appeler librement `/ui/write` |
| Router → Engine | Identité de service CP/1 + contexte humain vérifié si requête Web | Signature et action CP1 + privilège métier/ownership côté autorité d'exécution | Assimiler jeton CP/1 à ADMIN, ou laisser un Engine modifier un autre `clientId` |
| Engine → Router (système) | Identité machine contrôlée et capacités explicitement accordées | Jeton service propre, allowlist, identité du service et scopes machine | Usurper une session humaine ADMIN ; transformer une action système en ordre LIVE |
| CLI SSH → gestion comptes | Identité OS autorisée et base SQLite Auth | Contrôle du compte Linux/service et du rôle administratif de CLI ; audit | Contrôle Web des utilisateurs, sudo/Shell/Docker depuis le navigateur |
| Service → DB persistante | `clientId` résolu **dans le contexte authentifié**, pas dans un paramètre client | Transactions, ownership SQL, verrouillage DB et clés | `active_client_id` global comme autorité d'un utilisateur connecté |

**Rôles :** ADMIN = contrôle applicatif ; USER = ses ressources autorisées ; GUEST = lecture explicitement autorisée + préférences d'affichage en mémoire du navigateur, **pas de mutation serveur**. Le statut ADMIN n'accorde ni permissions système Linux ni accès aux secrets d'autres utilisateurs par défaut.

## 4. Flux de requête normatifs

### 4.1 Login / sessions / navigation

```text
Browser POST login --credentials--> Gateway --> Core Auth
  Core: vérifie compte actif + Argon2id (uniquement login/unlock)
        crée une session opaque liée à clientId et durée
        retourne Set-Cookie HttpOnly, SameSite, Secure en HTTPS
Browser GET page/API --> Gateway --> Core
  Core: validation session, lock, expiration, révocation, rôle, ownership
  Gateway: sert page ou relaie réponse uniquement si autorisé
```

Les rafraîchissements MarketData, timers de polling et pings **ne prolongent pas** `last_user_activity_at`. Seules des actions utilisateur réelles autorisées prolongent l'activité. Après cinq minutes sans activité réelle : lock côté Core, lecture privée et écritures refusées ; déverrouillage par mot de passe.

### 4.2 Lecture marché partagée (chemin rapide)

1. Le navigateur doit disposer d'une session **si la route n'est pas explicitement publique**. Le Gateway/Core vérifie l'accès à l'ouverture de la vue ou à l'entrée HTTP protégée.
2. Pour les **flux de prix réellement publics/partagés et sans données client**, ne jamais répéter une vérification de mot de passe, de base de comptes ou de certificat pour **chaque tick / bougie**. Les caches de marché restent partagés pour les données publiques, jamais pour les positions privées.
3. Pour un canal durable (HTTP streaming/WebSocket **futur seulement**), autoriser à l'ouverture puis utiliser un mécanisme de révocation/expiration contrôlé et revalidation lors des opérations sensibles, sans affecter chaque événement marché. Stopper la fourniture de données privées dès verrouillage/expiration.
4. **Ne pas mettre en cache** le résultat de possession d'un objet ou d'autorisation de mutation au point de permettre l'accès après révocation.

### 4.3 Écriture UI vers un Engine (contrat cible)

```text
Browser -- POST /communication/v1/ui/write --> Gateway
  (suppression en-têtes privilégiés, CSRF, limites de corps)
Gateway -- authorize(session, target, action, digest(arguments)) --> Core Auth
  (vérifie compte, lock, rôle, clientId, politique et ownership)
Core -- capacité signée de courte durée, audience Router --> Gateway
Gateway -- action + capacité bornée --> Router
  (vérifie signature, audience, action, empreinte, policy version, expiration)
Router -- CP/1 service auth + autorisation humaine propagée --> Engine
  (vérification action, ownership et invariants métier)
Engine -- réponse --> Router --> Gateway --> Browser
```

**Format conceptuel d'une preuve :** `issuer=core-auth`, `aud=router`, `sub=session-hash`, `clientId`, `role`, `action`, `target`, `argsDigest`, `iat`, `exp`, `jti`, `permissionsVersion`, `securityVersion`, `env=DEBUG`, et MAC/signature sur une représentation canonique stable. Ce **n'est pas** un format d'API définitif ; les champs et algorithmes seront figés au point versions/protocole.

**Optimisation choisie :** une vérification Core à l'entrée d'une **action UI** puis validation cryptographique locale rapide par Router ; pas de re-login, Argon2id, SQL systématique ou handshake TLS dans chaque hop. Le Core reste autorité pour l'ownership et les mutations à impact. Les écritures sensibles exigent un `jti` à usage unique et une protection contre rejeu avec état borné. TTL de l'ordre de quelques secondes à calibrer ; une révocation doit produire un refus immédiatement pour une **nouvelle** opération sensible, au besoin par validation Core finale. Une capacité non expirée ne constitue pas une autorisation LIVE autonome.

**Important :** authentifier le service d'origine **et** l'acteur humain sont deux questions séparées. Les appels Engine autonomes (ex. collecte ou calcul sous identité machine) suivent des politiques de service propres et ne reçoivent pas de rôle ADMIN implicite.

### 4.4 Core API / compte privé / Wallets

Toute route Core protège à nouveau la session : ne jamais s'appuyer uniquement sur Gateway. Dans Core, `clientId` du chemin, du body ou des paramètres n'est qu'un **sélecteur non fiable** ; il faut le comparer à l'identité de session, ou vérifier une autorisation spécifique ADMIN documentée. Les opérations wallet/clefs existantes ne sont **pas refondues** ici, mais sont bloquées tant que leurs accès ne sont pas conformes à la politique et au jalon wallets ultérieur.

### 4.5 Admin, Firewall, mises à jour, système

Routes `/api/admin/*`, `/api/updates/*`, `/api/ai-updates/*`, `/api/shutdown`, `/api/security/firewall/toggle` et commandes Firewall internes : **ADMIN_ONLY** explicite ; les opérations sensibles demandent confirmation et contrôle serveur, jamais uniquement une restriction d'interface. Les outils `iatb-users` restent uniquement SSH/CLI, **aucune commande shell Linux, Docker ou administration de comptes via une API Web**.

## 5. Format de transport et défense contre usurpation

### Requête navigateur

- Construire les en-têtes upstream depuis une **liste autorisée** ; ne jamais recopier aveuglément `req.headers`.
- Écarter/écraser les en-têtes `x-iatb-*` fournis par le navigateur, `x-forwarded-*` non issus d'un reverse proxy explicitement approuvé, `forwarded`, `x-real-ip`, `connection`, `transfer-encoding`, `proxy-authorization` et tout en-tête interne lié à une permission.
- Transmettre `Cookie` **uniquement à Core Auth / API sur le canal approprié** ; jamais à Router/Engines ni au cache marché. Retirer les credentials de service entrants.
- Vérifier `Origin`/CSRF sur les écritures (y compris actions POST de lecture si leur réponse comporte des secrets), limiter corps et durée, refuser JSON/protocole inconnus.
- Pour les headers d'identité interservices, le signataire de confiance les **génère lui-même** après vérification, avec signature et audience. Refuser les doublons et les ambiguïtés de casse ou d'encodage.

### Réseau / isolation

- **DEBUG 2.1 privé :** conserver l'écoute locale, accès uniquement par tunnel SSH/VPN autorisé ; ne pas publier 8000/8001/8021/8017 et Engine ports.
- **Actuellement :** le namespace réseau partagé permet aux services de se joindre via 127.0.0.1 ; cela exige un contrôle applicatif interservices.
- **Cible avant ouverture :** séparer au minimum les clés de confiance par rôle/service et leurs montages en lecture seule/UID appropriés ; examiner si des Unix Domain Sockets à contrôle d'accès filesystem/peer credentials ou la segmentation réseau Docker améliorent la barrière sans surcoût important. Ne pas modifier Docker dans P1.4.
- **Jamais de clé de session/autorisation dans les logs, headers retournés au navigateur, dumps, traces ou métriques**.
- **RELEASE** : base, clés de signature, namespace d'autorisation et sessions distincts de DEBUG ; rejeter une capacité `env` étrangère.

### TLS / certificats : stratégie performance

Les certificats TLS concernent l'établissement d'une connexion sécurisée, **pas une vérification de certificat à chaque requête d'une connexion réutilisée**. Pour l'accès public futur, privilégier TLS 1.3 et des connexions persistantes correctement configurées au reverse proxy (Phase 7). Pour les canaux internes dans le même hôte : jeton service + preuve HMAC/signature à faible coût et isolation OS vérifiée peuvent éviter de déployer une PKI/mTLS sur chaque connexion. Si l'architecture réseau ou le risque l'exige plus tard, comparer TLS interne avec connexions persistantes ; **jamais affaiblir la vérification TLS pour gagner quelques millisecondes**.

## 6. Erreurs, révocations et règles fail closed

| Situation | Résultat attendu |
| --- | --- |
| Aucune session / session expirée / verrouillée | 401 / `AUTH_REQUIRED` ou `SESSION_LOCKED` ; aucune donnée privée |
| Role/permission insuffisante, objet d'un autre client | 403 ou 404 non révélateur selon ressource ; audit sans PII |
| Core Auth indisponible, SQLite/key indisponible | 503 ; **pas de fallback ADMIN, cache de droits ou bypass** |
| Preuve de service absente, signature fausse, action/arguments différents | 403 ; rejet avant exécution ; audit borné |
| Capacité expirée/rejouée/environnement ou version incompatible | 403 ; aucun retry automatique de mutation |
| Session désactivée/rôle révoqué | nouvelles actions refusées immédiatement ; opération en cours doit respecter epoch/révocation critique |
| Router/Engine incapable d'établir l'ownership | refuser la mutation, pas de valeur `clientId=default` |
| Trading Engine DEBUG | aucune exécution LIVE, même ADMIN |

La révocation et le verrouillage côté serveur sont prioritaires sur le confort d'un cache ; une disponibilité dégradée peut restreindre les opérations, jamais élargir les permissions.

## 7. Validation demandée pour clore P1.4

- [x] Quatre principes architecture Gateway / Core / Router-Engine / fail closed validés oralement.
- [x] Contrainte « sécurité avec impact minime sur la latence » enregistrée ; plan de mesures défini.
- [x] Contrat de flux, sources de vérité et contrôles anti-usurpation documentés.
- [x] Quatre principes et priorité performance validés par Overflow ; cette rédaction détaille leur conception. Les modalités exactes des preuves cryptographiques et du protocole restent à approuver au jalon de versionnage.
- [x] Relevé **en lecture seule** du 14/10/2026 reçu : zéro port Docker publié, 13 conteneurs dans le namespace Router, douze écouteurs IA-TB sur loopback interne ; [rapport réseau](../Security/AUTH_DEBUG_2.1_NETWORK_BOUNDARY_AUDIT.md).
- [x] Contrat de versionnage P1.6 **approuvé par Overflow le 14/10/2026** : voir [compatibilité Auth](AUTH_DEBUG_2.1_VERSION_COMPATIBILITY.md). Formats cryptographiques détaillés et tests d'implémentation restant à valider aux phases techniques.
- [ ] Matrice RBAC P1.7 [proposée](AUTH_DEBUG_2.1_RBAC_CONTRACT.md) avec [plan de tests négatifs](../Security/AUTH_DEBUG_2.1_RBAC_NEGATIVE_TEST_PLAN.md) : accord utilisateur en attente.
- [ ] Avant mise en ligne (Phase 7) : tests réels d'authN/AuthZ/RBAC/ownership, d'isolation des clés et des performances sur version implémentée.

**Statut final : P1.4 validé pour la conception et la topologie actuelle.** Aucun mécanisme Auth 2.1 nouveau n'a encore été implémenté ni benchmarké. Les contrôles d'identité, d'isolation des clés, les refus 401/403 et l'évaluation du pare-feu Contabo restent obligatoires aux jalons d'implémentation et d'ouverture publique.
