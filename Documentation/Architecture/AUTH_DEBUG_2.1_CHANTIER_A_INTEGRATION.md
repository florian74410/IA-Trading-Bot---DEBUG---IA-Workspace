# Auth21 — Chantier A : intégration HTTP et RBAC (15 octobre 2026)

**Branche :** `feature/debug-2.1-auth-design`. **État : INTÉGRATION PARTIELLE,
NON CLOTURÉE.** Aucun déploiement GEN-1, connexion exchange, ordre LIVE, accès
Wallet ni migration utilisateur réel.

## Livré et vérifié

Les serveurs réels Gateway, Router, Indicators, MarketData, Fundamental,
Portfolio et Strategy sont raccordés à un chemin opt-in Auth21. L'identité du
navigateur termine son parcours sur Core, qui vérifie la session serveur,
le rôle RBAC et la propriété `clientId` avant d'émettre une preuve HMAC courte
et liée à la méthode, à l'action, à l'Engine cible et au digest exact du corps.
Router ne transmet ni bearer ni cookie ; Engine vérifie indépendamment la preuve,
le rôle, le propriétaire et le rejeu, et rejette le reste des routes legacy.
Les Engines Trading, Risk, Firewall, Liquidity et Supervisor restent verrouillés.

Les actions exercées sur le banc isolé sont :
- ADMIN : `POST indicator/settings`, `POST marketdata/settings`,
  `POST fundamental/feed` ;
- USER et ADMIN sur ses propres données : `POST portfolio/preference`,
  `POST strategy/preference` ;
- GUEST (également USER/ADMIN) : `GET marketdata/metadata`, lecture de
  métadonnées publiques synthétiques uniquement.

**Portée de la persistance :** MarketData écrit sa **véritable configuration
DEBUG isolée** via `market_data_settings.save` avec garde de snapshot ;
Portfolio sauvegarde un paramètre `auth21.preference.<clientId>.<key>`
dans la **vraie base SQLite Portfolio du banc** avec son garde. Indicator
utilise encore son adaptateur d'essai de paramètres ; la création de flux
Fundamental et les préférences Strategy utilisent des enregistrements
synthétiques strictement limités à `runtime/auth21-business`. Il serait faux
de les déclarer raccordés aux magasins métier normaux.

Tests nouveaux dans `App/Tools/Tests` :
- `auth21_business_actions.test.js` : six actions, méthodes, schémas,
  rôles, ownership et anti-rejeu ;
- `auth21_real_indicator_business_ingress.test.js` : route signée,
  paramètres malveillants, gel et refus ;
- `auth21_real_indicator_business_process.test.js` : processus **réels**
  Gateway, Router, Indicator ; émission Core contrôlée ;
- `auth21_multi_engine_business_e2e.test.js` : processus **réels**
  MarketData, Fundamental, Portfolio, Strategy, Gateway et Router,
  rôles ADMIN/USER/GUEST, propriétaire incorrect, GET et HTTP historiques ;
- `auth21_core_business_sqlite_sessions.test.js` : première identité
  ADMIN **fictive** créée avec vraie migration SQLite v3 et Argon2id,
  session réelle et révocation qui bloque l'émission de nouvelles preuves.

## Travaux indispensables avant clôture de A

1. Raccorder l'authentification au navigateur via cookies
   `Secure/HttpOnly/SameSite`, CSRF et origine HTTPS réellement contrôlée
   et activer le parcours UI de login/lock/unlock/logout sans fuite de token.
2. Raccorder les autres parcours métier autorisés aux magasins et
   services réellement exploités et terminer le contrôle d'ownership
   sur toutes les routes sensibles, pas seulement six routes expérimentales.
3. Vérifier la résistance du rejeu interprocessus et au redémarrage,
   la révocation pendant une requête déjà émise, et les frontières
   Gateway/Router/Engine en cas de panne.
4. Vérifier migrations, isolement multiutilisateur en charge, performances
   p95/p99 comparables et rollback sur installation complète de test.
5. Exécuter une campagne consolidée verte sur la **dernière révision**,
   puis seulement demander une revue de clôture. La réussite des
   fixtures seules ne constitue pas une autorisation de déployer.

**Décision :** les parcours explicitement ouverts sont en mesure d'être
testés de façon cohérente ; **le chantier A et les phases 3/4 ne sont pas clos**.
Il est interdit de déclarer que le chantier B peut démarrer sur une base
Auth21 intégralement certifiée tant que les critères ci-dessus ne sont pas
satisfaits.


## Revalidation supplémentaire — 15 octobre 2026, deuxième campagne

Suite de sécurité complétée avec un vrai schéma SQLite v3, un mot de
passe Argon2id de fixture, l'émission d'une capacité métier authentifiée,
puis l'interdiction de réutilisation après changement de `security_version`.
Une vérification explicite affirme également que SQLite empêche la
rétrogradation du **dernier ADMIN** (`LAST_ACTIVE_ADMIN_REQUIRED`) ; ce
refus est un succès de sécurité et non un défaut à contourner.

Preuves à la révision `b5328a5f715e0023513b47ff4fea52e908aa2164` :
- Auth P2.2: https://github.com/florian74410/IA-Trading-Bot/actions/runs/38737079974 — SUCCESS
- Auth P2.1: https://github.com/florian74410/IA-Trading-Bot/actions/runs/38737080612 — SUCCESS
- RBAC: https://github.com/florian74410/IA-Trading-Bot/actions/runs/38737080028 — SUCCESS

**Statut d'acceptation identique : non clôturé.** L'API navigateur HTTPS
avec cookie/CSRF n'est pas encore branchée en conditions réelles et trois
des cinq POST métier utilisent encore une persistance de fixture plutôt
qu'une intégration fonctionnelle complète. Il serait incorrect d'annoncer
que le chantier A est prêt pour B.


## Rapprochement code réel / validations — 15 octobre 2026 (après-midi)

Le code de branche dispose **maintenant** d'une interface Auth21 dédiée
`Frontend/Pages/auth21.html` et `auth21_ui.js`, d'un Gateway et Core en HTTPS
sur banc isolé, de cookies `__Host-iatb21` et d'un CSRF avec validation serveur.
Les tests `auth21_browser_core_tls_integration.test.js`,
`auth21_gateway_tls_browser_e2e.test.js` et
`auth21_full_browser_real_core_engine_e2e.test.js` sont inclus dans le
workflow d'intégration. Le dernier parcours traverse les vrais processus
Gateway, Core, Router et Indicator, sans exposer le bearer au JavaScript ;
il vérifie l'écriture dans le véritable Settings Store isolé.

La persistance métier MarketData, Portfolio, Fundamental et Strategy est
également désormais raccordée à des stores DEBUG isolés (vérifications par
permissions/propriété et configuration de racine stricte). Le modèle
d'autorisation ne concerne pour le moment que **six actions explicitement
déclarées**, les opérations Trading LIVE et Wallet restant interdites.

Un problème de rejeu après redémarrage d'Engine est traité par le
`replayStore` persistant de `auth21_ipc_proof.js` et
`auth21_durable_business_replay.js` ; toute duplication concurrente de
mécanisme a été supprimée pour préserver une seule source de vérité.
Le validateur Fundamental refuse désormais les URL HTTPS pointant directement
vers des IP, `localhost` et les hôtes internes usuels. L'interface ne
déclare plus une déconnexion réussie si Core n'a pas confirmé la révocation
de session.

**Preuves du dernier commit de sécurité validé :**
- [P2.2](https://github.com/florian74410/IA-Trading-Bot/actions/runs/38753043157) — SUCCESS ;
- [P2.1](https://github.com/florian74410/IA-Trading-Bot/actions/runs/38753043193) — SUCCESS ;
- [RBAC](https://github.com/florian74410/IA-Trading-Bot/actions/runs/38753043185) — SUCCESS.

**Critère non satisfait :** le serveur Core contient plus de 100 chemins API
legacy potentiels ; leur adaptation au contexte Auth21, ainsi que les routes
Router/Engines restantes, n'a pas été validée de bout en bout. Les garder
bloqués évite de traiter les anciens cookies ou en-têtes comme des preuves.
La présence d'une UI Auth21 dédiée ne signifie pas que toutes les pages
fonctionnelles historiques de Trading IA sont migrées.

**Décision : A n'est pas clos et B ne démarre pas.** Pas de GEN-1, pas de
migration d'identité réelle, pas d'ordre LIVE.
