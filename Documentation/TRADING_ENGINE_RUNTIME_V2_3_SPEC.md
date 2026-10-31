## 2.5.3 DEV — P4 persistant, P5 simulé

P4 est raccordé au pont ADMIN Auth21/Firewall et conserve le verrou après arrêt
ou crash. RuntimeState partage désormais le journal SQLite ADMIN. P5 SAFE/CLOSE
et la réconciliation sont testés sur brokers contrôlés ; leur raccordement aux
brokers réels et la reprise restent désactivés. START/RESTART restent en attente.
Aucun ordre réel ; cette livraison partielle ne vaut pas acceptation complète P4/P5.

Voir `Documentation/Consolidation/2.5.3-DEV.md`, la matrice
`Documentation/Trading/BROKER_CAPABILITIES_2.5.3.md` et la procédure
`Documentation/Trading/MAINTENANCE_2.5.3.md`. Les sections antérieures ci-dessous
restent historiques ; ce bilan précise l'état actuel.

## P3.1 — Route native du Core authentifié normal (2026-10-20)

- [x] Réutilisation de `UserManagement/runtime.js` : son `UserStore.sessions.verifySession` est le gestionnaire effectif lorsque `UM_CONFIG.enabled` (Core authentifié normal).
- [x] `UserManagement/http.js` expose, sous feature flag `IATB_AUTH21_TRADING_ADMIN_BRIDGE=1`, le seul endpoint `POST /auth21/admin/trading/command`. La session cookie Auth21, origine autorisée, contrôles CSRF existants et rôle `ADMIN` sont obligatoires. `USER` et `GUEST` sont refusés.
- [x] `auth21_trading_admin_bridge.js` possède maintenant `createAuthenticatedDispatcher` : émet la preuve sur le serveur Core via l'émetteur existant, puis transmet la commande à Firewall CP/1. Aucun champ de rôle, cookie ni jeton IPC venant du navigateur n'est accepté comme autorité.
- [x] En mode non configuré, route absente ; clé IPC pré-provisionnée nécessaire si activation ; aucun changement de session, de migration de DB, des autres routes ou des autres services.
- [ ] Valider localement le dispatch avec la vraie configuration Auth21 et la connexion au Firewall, ainsi que le comportement USER/GUEST, CSRF, rejouage et indisponibilité de service. Aucun ordre LIVE autorisé.
- [ ] Ce pont routé n'active ni `START` ni `EMERGENCY_STOP` tant que les handlers P4/P5 ne sont pas codés.

# IA-TB v2.3 — Trading Engine 2.0 / Runtime & Health

## P3.1 et P3.2 — Implémentation du 20 octobre 2026

- [x] Point d'entrée `POST /auth21/admin/trading/command` monté dans le Core Auth21 isolé avec activation explicite `IATB_AUTH21_TRADING_ADMIN_BRIDGE=1`.
- [x] Contrôle de session via `sessions.verifySession`, permission `admin.write`, CSRF pour le mode cookie, origine contrôlée, aucune confiance aux rôles envoyés dans la requête.
- [x] Création côté Core d'une preuve Auth21 signée et liée aux paramètres exacts puis relais CP/1 vers le Firewall local (8017). Aucune clé secrète transmise au navigateur.
- [x] Nouveau `auth21_trading_key_provider.js` : clé IPC **pré-provisionnée** de 32 octets, chemin absolu `IATB_AUTH21_TRADING_IPC_KEY_FILE`, propriétaire local et permissions 0600 ; refus si absente ou invalide. Pas de génération automatique.
- [x] Vérificateur Engine et Firewall reconfigurés pour cette clé dédiée ; registres anti-rejeu propres aux deux processus préservés.
- [x] Tests unitaires isolés exécutés sur Node v22.16.0 : émetteur avec session simulée, refus USER, confirmation manquante ou timestamp périmé ; fournisseur de clé, permissions, longueur. **PASS pour ces tests limités**.
- [x] Test de contrat complet ajouté `tests/test_trading_admin_bridge_key_v2.js` ; **non exécuté** sur un checkout intégral.
- [ ] La route n'est montée que par `openCoreAuthTrial` dans le mode Auth21 Core isolé actuel ; **non raccordée au mode authentifié normal GEN-1**.
- [ ] Tester le flux vrai Core/Router/Firewall/Engine avec sessions, clés provisionnées, CSRF et signature CP/1, worker actif, payload et déploiement Mac local.
- [ ] P3.3 : vérifier refus ADMIN lors de Firewall bypass, capacité expirée, coupure de service, preuve JTI rejouée, collisions et restart.
- [ ] `START`, `DRAINING_STOP`, `EMERGENCY_STOP` ne produisent toujours aucune transition : P4/P5 et recette requises.

**Cette réalisation est un début concret du pont Auth21 et du fournisseur de clés, pas une garantie de compatibilité immédiate avec la configuration Mac ou VPS. Aucun déploiement n'a été réalisé.**

## P3 — Émission Core et contrôle Firewall (code intégré, recette non effectuée)

- [x] `Core/Clients/auth21_trading_admin_issuer.js` : émet une preuve HMAC courte durée **uniquement depuis une session vérifiée par `sessions.verifySession`** avec permission `admin.write`, portée `trading.admin.command` et empreinte du payload. Les rôles déclarés par le client ne sont pas acceptés.
- [x] `Core/Clients/auth21_trading_replay_v2.js` : stockage SQLite indépendant des JTI de preuve pour **Firewall** et **Trading Engine** afin que la vérification par le premier ne consomme pas la preuve au second.
- [x] Firewall Coordinator : vérifie la signature et la preuve Auth21 avant inspection du worker ; le worker rejette les appels non certifiés même en mode observation ; refus absolu de maintenance en mode Firewall bypass.
- [x] Engine : conserve sa propre vérification Auth21, signature de forwarding et journal des commandes.
- [x] Tests de principe ajoutés : `test_trading_admin_core_firewall_v2.js` (non exécuté).
- [ ] **Raccordement du point d'entrée Core/Gateway à une session navigateur ADMIN réelle** : l'émetteur est une fonction serveur, pas encore une route utilisateur disponible. Prévoir contrôle CSRF, confirmation UI, permissions d'action et émission depuis un Core authentifié.
- [ ] **Rendre disponible la preuve dans le mode Auth21 réellement déployé** : le vérificateur actuel emploie `loadTrialSecret`, limité au mode d'essai local. Ce mode d'isolation Auth21 refuse par ailleurs l'ingress CP/1 ordinaire. L'ensemble du chemin n'est donc **pas encore validé bout-en-bout**.
- [ ] Vérifier les tests et l'intégration réelle (worker threads, Router, Firewall, Engine), la topologie des clés IPC et les chemins persistants multiutilisateurs.
- [ ] Ajouter des garde-fous sur la durée de session et les capacités d'opération avant d'activer START/STOP ; P4/P5 restent désactivées.

**Ne pas déclarer P3 terminée ni autoriser de maintenance en production avant ces raccordements et tests.** Le VPS v2.2.5-R1 n'a pas été modifié.

## Complément P3 — raccordement dans le service et preuve Auth21

- [x] `trading_service.js` instancie réellement `AdminCommandLedger` dans `trading_admin_actions.db` au même répertoire persistant que `trading_runtime_state.json`, puis construit le contrôleur ADMIN.
- [x] `trading_auth21_admin_v2.js` utilise le **codec de preuve signé Auth21 existant** et le `auth21_rbac_guard` : audience `trading`, opération `admin.write`, méthode `POST`, action `trading.admin.command` et empreinte canonique CP/1 des paramètres.
- [x] Le contrat `trading.admin.command` prévoit le champ `proof`, sans faire confiance à un champ `role` du navigateur ni à la seule authentification machine.
- [x] Le dispatch Trading Engine appelle le contrôleur, après vérification du token machine, de la signature du Firewall et de la preuve Auth21. Le journal est réellement attaché, et non plus un module isolé.
- [x] Test de preuve, refus des non-ADMIN et anti-rejeu : `tests/test_trading_admin_auth21_binding_v2.js` (**écrit, non exécuté**).
- [ ] Le codec actuel ne se charge qu'en environnement **Auth21 trial local** disposant de la clé IPC propriétaire ; en environnement non configuré, le vérificateur reste absent et la commande refuse.
- [ ] Relier le Core Auth21 et son `verifySession` à l'**émission de preuves** depuis une session ADMIN réelle, avec CSRF, confirmation explicite et politique d'action. Aucun émetteur public n'est activé par cette étape.
- [ ] Remplacer le refus systématique du Firewall par une vérification d'une **capacité authentifiée, courte durée et spécifique**, avec anti-rejeu durable avant routage ; aujourd'hui le Firewall **rejette encore toutes les commandes ADMIN**.
- [ ] Préparer le déploiement du même canal de preuve hors du mode trial avec secrets correctement provisionnés et permissions minimales ; ni contournement via headers ni activation implicite.
- [ ] Qualifier intégration complète Auth21/Core → Router → Firewall → Trading Engine et erreurs disque/concurrence ; **aucune commande START/STOP n'est fonctionnelle**.

**Sécurité :** la preuve cryptographique signée est bien vérifiée par le module raccordé au service, mais l'autorisation bout-en-bout depuis la session utilisateur n'est pas encore achevée. Ne pas annoncer une liaison Auth21 utilisateur complète.

## P3 — Contrat CP/1, Firewall et anti-rejeu persistant (étape intermédiaire)

- [x] Contrat `trading.admin.command` décrit dans `App/Core/Communication/ProtocolRegistry/trading.json` avec `command`, `command_id`, `timestamp`, `confirmed`.
- [x] Firewall refuse l'action avec le code `ADMIN_AUTH21_BOUND_CAPABILITY_REQUIRED`, y compris en mode `OBSERVATION` ; impossible de contourner en désactivant la whitelist.
- [x] Trading Engine reconnaît l'action mais la refuse lui-même via `validateArgs`, avant tout changement d'état.
- [x] Module `trading_admin_ledger_v2.js` : SQLite WAL et `synchronous=FULL`, `command_id` UNIQUE, décision horodatée, empreinte de l'identité ADMIN (sans jeton brut), détection de replay après redémarrage.
- [x] `TradingAdminController` utilise le ledger uniquement après une vérification ADMIN indépendante ; en absence de ledger ou de vérificateur, refus par défaut. Les opérations sont toujours `COMMAND_IMPLEMENTATION_PENDING`.
- [x] Test ajouté : `node App/services/trading-engine/tests/test_trading_admin_p3_security.js`. Exécution à programmer pour la recette ; dépend de `better-sqlite3`.
- [ ] Raccorder la vérification de permission Auth21 depuis Core au Trading Engine, sans déduire les droits du simple jeton machine CP/1.
- [ ] Unifier le point d'entrée réel du ledger et la capacité Auth21 ; pour l'instant le controller n'est **pas** instancié par le service. Pas de commande administrative opérationnelle.
- [ ] Ajouter sérialisation stricte des interventions, rétention du journal, confirmation persistante et revue de sécurité ; P4/P5 développeront les séquences.
- [ ] Tests locaux d'intégration Router/Firewall/Engine, restart et charge concurrente avant tout déploiement.

## Suivi P3 — Commandes ADMIN (2026-10-20)

**P3 partiellement implémentée ; ne pas annoncer la commande de maintenance opérationnelle.**

- [x] Contrôleur indépendant `trading_admin_controller_v2.js`, sans route publique/CP1, avec liste blanche `STATUS`, `START`, `RESTART`, `DRAINING_STOP`, `EMERGENCY_STOP`.
- [x] Refus par défaut en absence d'un vérificateur de principal Auth21 ; un jeton de service CP/1, un header ou un champ `role` fournis par l'appelant ne valent pas identité ADMIN.
- [x] Contrôles de commande : identifiant, horodatage récent, confirmation explicite ; transitions non implémentées donc **aucune exécution ni liquidation**.
- [x] Test unitaire `tests/test_trading_admin_controller_v2.js` créé ; exécution différée selon consigne.
- [ ] Raccorder à une vérification **réelle** Auth21 côté Core, avec permission d'opération et principal vérifié avant émission d'une capacité bornée à l'action, au compte et à une courte durée.
- [ ] Définir le contrat CP/1 Routeur/Firewall et les autorisations dans ProtocolRegistry, puis brancher le contrôleur en refus par défaut.
- [ ] Ajouter journal durable des actions ADMIN, protection anti-rejeu persistante, idempotence sous concurrence, audit sans données sensibles.
- [ ] Activer les comportements `START/RESTART` uniquement après réconciliation confirmée (P4-P5 et test d'intégration).
- [ ] P4 et P5 restent seuls responsables de l'exécution des séquences d'arrêt.

**Pourquoi ce choix :** l'ingress Auth21 existant autorise certains messages machine par jeton CP/1 mais ne fournit pas au Trading Engine la preuve d'un rôle ADMIN vérifié. Connecter maintenant un arrêt ou un redémarrage à cette authentification machine créerait une faille de privilèges. 

## Suivi P2 — Health Monitor CP/1 (2026-10-20)

**P2 code intégré, tests écrits, exécution différée selon décision du projet.**

- [x] `trading_health_monitor_v2.js` avec métriques instantanées (requêtes en cours, compteurs, latence de traitement, uptime, dernière exécution, dernière erreur anonymisée).
- [x] État runtime P1, activation service et LIVE, état de persistance JSONL ; SQLite `NOT_INTEGRATED` jusqu'à fusion de la branche Logs.
- [x] Disponibilité des brokers et nombres d'ordres exposés comme **inconnus / non vérifiés** plutôt que simulés ; CP/1 indiqué configuré mais disponibilité distante non vérifiée.
- [x] Intégration au `GET /health` et à l'action `trading.health` CP/1 existants (aucune nouvelle permission créée).
- [x] Tests unitaires ajoutés sous `tests/test_trading_health_monitor_v2.js`.
- [ ] Tester localement le contrat et vérifier compatibilité des consommateurs existants de `trading.health`.
- [ ] P3 : définir et autoriser l'endpoint ADMIN de diagnostic avancé avec Auth21 au backend ; ne jamais dévoiler de secrets API, noms de comptes utilisateurs ou informations sensibles dans le Health ordinaire.
- [ ] En phase d'intégration, brancher comptage des ordres et tests actifs non destructifs de connectivité via les services habilités ; éviter les contrôles réseau synchrones à chaque requête Health.
- [ ] L'état SQL, les logs formatés, les commandes ADMIN et les commandes d'arrêt sont hors périmètre P2.

## Suivi de réalisation — P1 (2026-10-20)

**P1 — code présent sur la branche, tests automatisés écrits mais non exécutés. Ne pas déployer.**

- [x] Module `trading_runtime_state_v2.js`, persistance JSON atomique (temp + rename) dans le User Data séparé.
- [x] États persistés `STOPPED`, `STARTING`, `RUNNING`, `DRAINING`, `DRAINING_BLOCKED`, `RECONCILING`, `EMERGENCY_HALTED`, `DEGRADED`, `ERROR`.
- [x] Défaut sécurisé : première installation en `STOPPED` avec reprise ADMIN requise ; redémarrage inattendu d'un état actif vers `ERROR` sans reprise implicite.
- [x] Intégration de la barrière runtime dans `trading_service.js` pour les actions mutantes et ajout d'un snapshot dans le health existant. Lecture CP/1 conservée.
- [x] Interception des signaux de fermeture pour enregistrer le verrou d'arrêt local ; cette interception **n'annule pas et ne clôture aucune position**.
- [x] Script de test du store et des redémarrages : `node App/services/trading-engine/tests/test_trading_runtime_state_v2.js`.
- [ ] Exécuter les tests en local et analyser l'intégration au gestionnaire de processus, avec crash/permissions/arrêt et redémarrage du conteneur.
- [ ] Valider la durabilité forte (fsync fichier/répertoire), les écritures simultanées et les droits d'accès avant déploiement.
- [ ] P2 Health avancé et P3 commandes ADMIN nécessaires avant tout passage en `RUNNING`. Ne pas activer le LIVE.

**Attention :** P1 ne constitue ni une liquidation `DRAINING_STOP`, ni un `EMERGENCY_STOP` opérationnel. Les états existent en tant que modèle, pas comme séquences de maintenance exposées. Les signaux système n'imitent pas `DRAINING_STOP`. La version R1 déployée est inchangée.


**Statut : spécification validée, implémentation et tests locaux à venir.** Branche `feature/v2.3-runtime-trading-engine-2.0`, créée directement depuis v2.2.5-R1 (`39e78e76`). Aucun déploiement VPS, trading LIVE désactivé.

## Ordre de réalisation (impératif)

1. Runtime autonome et états persistants de cycle de vie ; distinguer arrêt ADMIN volontaire et crash, éviter le redémarrage automatique après arrêt intentionnel.
2. Health Monitor CP/1 (santé basique et diagnostic ADMIN) indépendamment du frontend.
3. Contrôles ADMIN sécurisés, idempotents et journalisés ; état partagé Router/Firewall et autorisations Auth21 réévaluées au backend.
4. `EMERGENCY_STOP` : interdiction immédiate de toute nouvelle soumission locale ; persistance d'un verrou `EMERGENCY_HALTED` survivant aux redémarrages. Ne clôture ni n'annule automatiquement les ordres déjà chez les brokers.
5. `DRAINING_STOP` : arrêt coordonné, exige la prise en charge effective des capacités d'annulation, de fermeture et de réconciliation par broker ; sinon refus avant démarrage de la procédure. Inventaire préalable du périmètre IA-TB (compte, broker, positions et ordres) et confirmation ADMIN explicite des conséquences financières.
6. Tests locaux des races, timeouts, interruptions, crash/restart, doubles commandes, brokers injoignables et états de position incertains ; seulement ensuite UI et recette.

## États

- `STOPPED` : arrêt normal confirmé, aucune position/ordre résiduel dans le périmètre vérifié.
- `STARTING` : initialisation.
- `RUNNING` : accepte des intentions autorisées.
- `DRAINING` : arrêt coordonné en cours, nouvelles intentions interdites.
- `DRAINING_BLOCKED` : liquidation ou réconciliation non confirmée ; intervention ADMIN obligatoire ; ne jamais déclarer succès.
- `EMERGENCY_HALTED` : soumissions locales bloquées, reprise exclusivement ADMIN.
- `DEGRADED` : fonctionnement partiel avec capacités réduites.
- `ERROR` : défaillance bloquante.

## Commandes ADMIN

- `START` / `RESTART` : uniquement lorsque les préconditions de sécurité sont satisfaites ; redémarrage après urgence sous autorisation spécifique.
- `DRAINING_STOP` : arrêt coordonné obligatoire avec fermeture des positions **du périmètre IA-TB**, sous contrôle des brokers ; état `DRAINING` durant toute la séquence.
- `EMERGENCY_STOP` : bloquer immédiatement les nouvelles soumissions ; ne pas annuler d'ordres ni liquider de positions existantes ; état `EMERGENCY_HALTED`.
- `STATUS` : observabilité sans pouvoir de commande.

### DRAINING_STOP — séquence obligatoire

1. Faire vérifier une commande ADMIN récente et afficher avant confirmation l'inventaire des comptes, positions et ordres IA-TB concernés.
2. Verrouiller les nouvelles stratégies/ouvertures ; informer Router, Risk et Firewall.
3. Stabiliser les requêtes d'ordres déjà parties et rechercher leurs résultats, sans réémettre à l'aveugle.
4. Annuler les ordres ouverts concernés et confirmer leur état (y compris fills partiels).
5. Clôturer **une par une** les positions IA-TB restantes, avec reduce-only quand disponible ; chaque clôture passe par les contrôles Risk/Firewall autorisant explicitement les opérations de réduction de risque pendant `DRAINING`.
6. Lire de nouveau les états des brokers et réconcilier la fermeture réelle des positions et l'absence d'ordres résiduels.
7. Persister les résultats et arrêter proprement seulement quand tous les contrôles du périmètre ont réussi. Sinon `DRAINING_BLOCKED` et alerte ADMIN.

**Important** : la clôture peut occasionner frais, slippage, pertes réalisées et ne peut être garantie si l'exchange échoue. Les positions manuelles hors périmètre IA-TB ne doivent jamais être liquidées. Aucun `STOPPED` trompeur si un broker est inaccessible ou le résultat incertain.

### EMERGENCY_STOP — séquence obligatoire

1. Autorisation ADMIN + avertissement clair.
2. Verrouiller sans délai le chemin de soumission local au Trading Engine et au Firewall ; interrompre les travaux locaux interruptibles.
3. Conserver les traces disponibles et les identifiants en vol ; marquer les résultats inconnus pour réconciliation future.
4. État persistant `EMERGENCY_HALTED` ; aucune reprise automatique, même après reboot.
5. L'interface signale expressément que des ordres/positions déjà présents chez les brokers peuvent rester actifs et exposés au marché.

## Confirmations UI

`DRAINING_STOP` : « Arrêt coordonné : IA-TB bloquera les nouveaux ordres, tentera d'annuler les ordres ouverts et de clôturer, une à une, les positions du périmètre indiqué. La procédure peut provoquer frais, slippage ou pertes réalisées et restera bloquée si une clôture n'est pas confirmée. Confirmer ? »

`EMERGENCY_STOP` : « Arrêt d'urgence : IA-TB bloque immédiatement les nouvelles exécutions. Les ordres déjà transmis et les positions ouvertes ne seront ni annulés ni clôturés automatiquement ; ils peuvent rester exposés au marché. Reprise ADMIN obligatoire. Confirmer ? »

Les confirmations frontend ne remplacent jamais les contrôles Auth21 et la validation des droits au backend.

## Health Monitor et distribution UI

Source unique : Health du Trading Engine. Champs à concevoir : état, uptime, état CP/1, latence, requêtes en cours, ordres ouverts, réconciliations en attente, dernière exécution, dernière erreur, état des brokers/comptes API, état du journal local, motif de maintenance et auteur ADMIN. Aucun secret dans les réponses.

- **Trading IA / Mosaïque** : module facultatif, lecture seule, vue synthétique.
- **Paramètres / Trading Engine (section existante à compléter)** : configuration/diagnostic adapté aux permissions ; n'exposer les paramètres sensibles qu'à ADMIN.
- **Panel Administration / Trading Engine** : Health approfondi, opérations, journaux formatés, maintenance ADMIN et historique de ses commandes.

Mettre en place les contrats Health avant les vues UI, pour éviter trois logiques divergentes. Bien distinguer des états « service actif », « engine habilité » et « trading LIVE activé ».

## Limites et dépendances

- Le Compose R1 actuel n'active pas le service Trading Engine ; le build R1 et le VPS ne sont pas à modifier pendant les chantiers isolés.
- Les opérations `DRAINING_STOP` dépendent de l'existence de fonctions **réelles** de lecture, clôture, annulation et réconciliation pour chaque broker ; ne pas simuler la complétude.
- La double écriture JSONL/SQLite du chantier `feature/v2.3-trading-engine-2.0` doit être intégrée plus tard par fusion contrôlée, et non copiée dans cette branche.
- Tests de conformité et validation locale obligatoires avant fusion de la v2.3.
