# Qualification de la livraison TEST 2.2.0

La preuve de publication est le `qualification.json` joint à la release, qui
référence le commit et le run GitHub exacts. Le workflow de release exige zéro
échec et zéro test ignoré avant de créer le tag et la préversion.

Complément local sur le code 2.2 : **490 tests Core (488 réussis, deux tests PTY
ignorés dans le conteneur), six suites Indicator et 20 tests UI réussis**. Aucun
échec. Trois tests Python d’inventaire passent. Le contrôle RBAC statique passe
(212 déclarations, 130 routes littérales, 63 actions read et 19 write).

La nouvelle matrice parcourt les 75 routes historiques avec de vraies sessions
et TLS : anonymes refusés, frontières ADMIN/USER/GUEST, mot de passe et confirmation
ADMIN, contexte propriétaire et révocation. Sa délégation métier est une sonde :
**elle ne qualifie pas les effets métier de toutes ces routes**.

Le parcours local à 12 processus non-trading passe avant/après redémarrage avec
transports fournisseurs fictifs : bougies/Firewall/Indicator, Custom privé,
Strategy, Portfolio importé, deux propriétaires IA, trois chats, test OpenAI
personnel, notifications privées et commandes ADMIN. La sandbox locale interdit
la création du socket Unix du bridge SSH ; le contrôle local ne le compte pas
comme succès. La recette Docker CI conserve l’assertion des 13 services et du
socket, sans suppression ni affaiblissement.

Les métadonnées camelCase et les messages d’erreur fournisseurs ont un test de
non-divulgation. Le refus précoce GUEST des écritures de clés API est couvert.
L’inventaire Python est vérifié sans modification d’octets ni création de fichiers,
avec refus des WAL non checkpointés et des clés liées symboliquement.

Périmètre livré et limites : [RELEASE_2.2.0.md](https://github.com/florian74410/IA-Trading-Bot/blob/189e9c09f1549dd8f2f73bb62c62fc19d6f31d15/Documentation/RELEASE_2.2.0.md).
Recette GEN-1 : [GEN1_TEST_2.2.0.md](https://github.com/florian74410/IA-Trading-Bot/blob/189e9c09f1549dd8f2f73bb62c62fc19d6f31d15/Documentation/GEN1_TEST_2.2.0.md).
Aucune donnée réelle, aucun déploiement GEN-1 et aucun ordre réel.

---

# Historique des preuves avant la préparation 2.2

Les mentions de brouillon, comptes de tests et attentes CI ci-dessous décrivent
les anciens commits. Elles ne remplacent pas la preuve liée au commit publié.

# User Management V1 — preuves de qualification

Base stable : `43863e817b45c0821de3928d585cfc58f55ce9c5`.
Environnement : Node 22, SQLite et Argon2 natifs, Firefox/Playwright.
Comptes, clés et données fictifs uniquement. Aucun accès GEN-1, déploiement,
Trading Engine démarré, appel fournisseur facturé ni ordre réel.

## Preuves GitHub vérifiées sur a9d61354

Les logs des jobs ont été lus, au-delà du seul statut vert.

| Suite | Réussis | Échecs | Ignorés |
|---|---:|---:|---:|
| Core, Auth21, CLI, stockage, intégration | 478 | 0 | 0 |
| Six suites Indicator | 6 | 0 | 0 |
| UI, Chart Workspace, Renderer V2 | 20 | 0 | 0 |

[Run User Management](https://github.com/florian74410/IA-Trading-Bot/actions/runs/38909148982).
Les workflows Core legacy gate, Chart Workspace et Indicator Visual Renderer
sont également verts sur ce commit. Les tests de terminal réel non-root ont
réussi sur le runner Linux GitHub.

[Recette Docker à 13 services](https://github.com/florian74410/IA-Trading-Bot/actions/runs/38909149157) :
construction de l'image, lancement des 13 conteneurs, sondes des services,
TLS avec certificat épinglé, socket UI, connexion Alice/Bob, isolation des
réglages/Mosaïques et lectures Strategy/Portfolio, arrêt et redémarrage sans
suppression des données, contrôle de persistance, déconnexion. Les deux sondes
avant/après redémarrage rapportent `services:13`, `ownerIsolation:true`,
`tradingStarted:false`, `network:internal-only`, `data:fictional`.
Cette recette ne couvre pas encore tous les parcours métier de chaque écran.
Le premier échec de sonde Router a été corrigé ; il n'est pas compté comme succès.

## Complément de finalisation

Commande complète :

```sh
IATB_FIREFOX_CONTAINER=1 bash App/Tools/CI/test_user_management_v1.sh
node Tools/CI/verify_rbac_registry.js
node App/Tools/CI/user_management_route_inventory.js
```

Le passage local complémentaire exécute 482 tests Core (480 réussis, deux
skips locaux de terminal non-root), six suites Indicator et 20 tests UI.
Le test additionnel de refus du fallback RPC opérateur passe séparément.
La CI doit requalifier le commit publié correspondant ; le dernier statut
est lié dans la PR. Les deux skips locaux ne sont pas transformés en succès.

Un premier passage a détecté l'absence du nouveau writer CLI dans l'inventaire
statique. Le fichier est désormais explicitement classé hors snapshot expérimental,
sans prétendre qu'il est coordonné par ce dernier. Les assertions d'inventaire
restent actives. Le contrôle RBAC statique passe : 212 déclarations,
130 routes littérales contrôlées, 63 actions UI read et 19 write.

Ajouts couverts par des tests natifs :

- Réauthentification des secrets, effacement personnel, refus de faux propriétaire.
- Fenêtre Firefox de réauthentification : saisie du mot de passe, requête reprise,
  succès de l'effacement et fermeture de la fenêtre, sans erreur JavaScript.
- RPC privé Alice absent pour Bob, rejet localhost/IP/HTTP/origine non approuvée,
  aucune sauvegarde partielle des secrets en cas d'entrée invalide.
- Supervisor personnel MOCK et refus explicite d'un REMOTE_LLM non qualifié.
- Import Portfolio des événements/balances/snapshots/trades/réglages vers un seul
  propriétaire, sauvegarde native incluant WAL, source inchangée, conflit et
  interruption annulant la copie.
- Import Settings chiffré par propriétaire et revendication d'attribution unique.
- Attribution wallet : même clé originale et mêmes enveloppes de secrets,
  déchiffrement par Alice et aucune lecture de wallet par Bob.
- Firewall machine : token et HMAC du corps obligatoires ; un secret machine
  seul ne permet pas d'arrêter une protection. Une capacité ADMIN liée au corps,
  au chemin et à une session vivante est désormais requise. La recette Docker
  étendue vérifie le refus machine et l'arrêt/redémarrage de la seule protection
  Data avec un ADMIN fictif. Elle doit réussir sur le nouveau commit.

## Migrations, crash et restauration

Schémas v3 et v4 conservés, migration additive v5 pour `permissions_version=3`.
Les anciennes sessions sont révoquées, les identifiants/empreintes PBKDF2,
chiffrements d'identité et clés originales sont conservés. Tests natifs SIGKILL
entre v3/v4 et au milieu de v4 : reprise vers v5, intégrité, sauvegarde de la
version initiale, restauration dans un nouveau fichier, déchiffrement avec la
même clé et conservation d'un marqueur historique. Une mauvaise clé est refusée
avant sauvegarde ou modification du schéma.

Les imports exigent des writers arrêtés et ne remplacent pas une sauvegarde
cohérente de la stack. Un rollback garde les données récentes séparées pour
réconciliation ; aucune suppression de volume ni restauration sur base ouverte.

## Limites de preuve et blocages

Les 75 routes initialement refusées sont classées individuellement dans
`legacy-route-decisions.json` : leur classification n'est pas une acceptation.
La validation de chaque écran métier, de tous les échanges privés inter-Engines,
des formats historiques de stratégies/Custom/dashboards et de la chaîne complète
d'exécution reste inachevée. Les tests IA utilisent des réponses fictives : ils
ne prouvent pas une disponibilité ou une facturation réelles du fournisseur.

Décisions explicites encore nécessaires pour accepter une limitation :
exécution Trading/transferts/swaps, ancien test Apple Mail sous Linux, REMOTE_LLM.
Les capacités non migrées restent refusées. Aucun refus n'est présenté comme
fonctionnalité livrée. La PR reste en brouillon et n'est pas prête à intégrer.

## Correction des sondes et import des définitions

Le run Docker du commit f149eca4 a révélé une route `/ui-health` absente du
Gateway authentifié. La sonde TLS opérateur est restaurée, avec test HTTP réel.
Le workflow Chart a aussi observé une assertion immédiate avant l'apparition du
modèle Studio. Le test attend désormais le même élément visible avant son
assertion ; 31 tests UI passent en rerun local, sans modification du Renderer.

L'import CLI des définitions Indicator Custom, Strategy V1/V2 et Mosaïque réutilise
les validateurs canoniques. Le test positif traverse `run()` avec authentification
ADMIN et confirmations, vérifie l'usage par Alice et l'absence pour Bob ainsi que
le refus d'une seconde attribution. Il ne remplace pas les tests existants de
TTY réel non-root. Les fichiers source restent octet pour octet identiques.

La sonde Docker est étendue aux neuf pages métier avec identité Alice injectée
sans présence de Bob ; ceci prouve le rendu authentifié des pages, pas chaque
interaction métier de leurs contrôleurs JavaScript. GUEST est refusé sur Bank,
Keys et Portfolio ; son Profil reste accessible.

## Recette fonctionnelle étendue des fournisseurs fictifs

La recette Docker possède désormais un preload QA strictement limité aux racines
fictives marquées. Il simule uniquement le transport Binance exchangeInfo/klines
et une réponse OpenAI structurée connue. Les adapters, le budget HTTP, le
normalizer, le Firewall et les calculs Indicator/Strategy restent réels.
Aucun endpoint de production n'active ce preload ; le compose ordinaire et les
entrypoints normaux ne changent pas. Le réseau de qualification reste interne.

Le test natif démarre les vrais processus MarketData et Firewall en mode
authentifié, reçoit les chandelles via le transport fictif, puis vérifie leur
validation par la protection Data avant le cache. Le preload refuse une racine
réelle, une autre destination et un credential IA non fictif.

La sonde Docker ajoute les parcours suivants (résultat CI du nouveau commit à
contrôler avant de les compter comme réussis) :

- Catalogue de paires et chandelles via Gateway/Core/Router/MarketData/Firewall.
- RSI, MACD et Custom privé calculés avec ces chandelles par Indicator Engine.
- Refus du Custom d'Alice pour Bob ; évaluation Strategy personnelle limitée à
  une intention, sans appel de Trading Engine.
- Lecture des historiques Portfolio attribués par la CLI avant le démarrage,
  toujours absents chez Bob et conservés après redémarrage.
- Gateway/Core/Supervisor/Core/OpenAI fictif : deux credentials personnels,
  deux réponses distinctes, et aucun événement de coût d'Alice chez Bob.

Le quota général de bridge borne aussi les opérations de compilation et lectures
qui n'avaient pas de lane spécifique. Les refresh forcés restent refusés.
L'API générique de préférences ne peut plus écrire les scopes métier réservés
(indicateurs et actions navigateur notamment) : elle ne remplace pas leurs
validateurs et capacités dédiés. Tests HTTP de refus et de quota exécutés.

## Rétablissement des commandes techniques ADMIN

Les commandes globales MarketData et Fundamental sont inventoriées explicitement
par `operator_policy.js`. Les lectures techniques exigent ADMIN ; les écritures
exigent en plus le mot de passe courant et une confirmation. Core émet une
capacité liée à l'action, aux arguments et au hash de session. Le destinataire
vérifie la signature puis revalide la session active auprès de Core avant d'appeler
le handler existant avec les arguments autorisés par le registre CP/1.
Les appels natifs de ces commandes avec la seule clé machine sont refusés en mode
authentifié. Ce canal ne permet aucune administration HTTP des comptes.

Les lectures métier publiques conservent leurs arguments exacts : Core n'ajoute
plus `force:false` aux commandes qui ne l'acceptent pas (catalogue des paires,
health, etc.). Les refresh forcés restent réservés aux commandes ADMIN dédiées.
Les métadonnées Fundamental exposées à USER retirent credentials, headers,
userinfo et paramètres sensibles des URLs. La validation des sources rejette
également les adresses IPv6 locales littérales et les URLs avec userinfo ; ceci
ne constitue pas une preuve de protection contre toute résolution DNS ou
redirection malveillante.

La sonde Docker étendue ajoute les contrôles ADMIN ci-dessus et les trois chats
historiques avec transport IA fictif : elle exige une réponse Supervisor plutôt
qu'un fallback local. Ces nouvelles assertions restent à qualifier en CI avant
de déclarer cette extension réussie. Aucun ordre réel n'est exécuté.
