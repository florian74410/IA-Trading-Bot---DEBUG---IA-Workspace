# IA-TB — Politique obligatoire RBAC lors de chaque nouvelle fonctionnalité

> **Décision d'Overflow (14/10/2026) :** à **chaque mise à jour**, une nouvelle fonctionnalité / route / action doit déclarer explicitement **qui peut l'exécuter et sur quelles données**, et cette déclaration doit être vérifiée avant acceptation du build.  
> **Source de conception :** [P1.7 — RBAC](../Architecture/AUTH_DEBUG_2.1_RBAC_CONTRACT.md), [212 entrées / 77 actions](../Architecture/AUTH_DEBUG_2.1_RBAC_MATRIX_PROPOSAL.json), [48 tests de sécurité](AUTH_DEBUG_2.1_RBAC_NEGATIVE_TEST_PLAN.md).  
> **Statut :** règle de gouvernance **APPROUVÉE** ; registre et tests **non connectés au runtime Auth 2.1** pour l'instant. La checklist PR s'applique aux contributions à venir ; le linter couvrira d'abord les actions UI du Router, puis la totalité des routes dynamiques avant mise en ligne.

## 1. « Une fonctionnalité nouvelle = une décision RBAC »

Pour chaque endpoint, bouton de mutation, action Engine CP/1, WebSocket futur, tâche programmée, file d'événements, import/export ou outil IA introduit/modifié, produire un enregistrement explicite :

| Champ requis | Pourquoi |
| --- | --- |
| Identifiant stable | `action_id` / `METHOD + PATH` / `CP_TARGET.ACTION` pour relier UI, Gateway, Core, Router et Engine |
| `roles` / `service_scope` | ADMIN/USER/GUEST, machine spécialisée ou refus ; **aucun défaut USER/ADMIN** |
| Classification des données | `PUBLIC_SHARED`, `OWNER`, `GLOBAL_ADMIN`, `INTERNAL_SERVICE`, `FROZEN_WALLET`, `DENY` |
| Politique de propriété | `owner_client_id` depuis Core Auth, ou non pertinent pour une donnée véritablement partagée |
| Effet réel | lecture pure, écriture DB, fichier/configuration, coût provider/IA, ordre, relance service, externalité réseau |
| Couche de décision | Gateway et Core sur API, Router/Engine sur CP1, CLI pour comptes, services dédiés pour système |
| Périmètre | DEBUG / RELEASE, environnement de test, service principal, verrouillage/révocation |
| Validation | test succès par rôle autorisé, **tests négatifs** pour GUEST/USER/ADMIN et IDOR inter-clients, CSRF, bypass direct, service spoof |
| Performance | delta p95/p99 si la route est fréquente, absence de hash/handshake dans la boucle tick |
| Exception | raison écrite et échéance de réévaluation, sans override silencieux |

**Principe :** toute fonction absente du registre ou dont les conséquences ne sont pas connues est `DENY`, puis fait l'objet d'une revue explicite. Un préfixe `/api/*` ou une méthode `GET` **ne constituent pas** une déclaration de permission. Une action `read` qui force une collecte est une action à effets.

## 2. Protocole de revue de Pull Request

1. La PR inclut l'inventaire des **nouveaux endpoints/actions** et leur matrice RBAC (même si la fonction n'a aucune nouvelle API, consigner `no new route/action` et revue des effets).
2. La PR complète les tests négatifs correspondant aux nouveaux chemins et états, y compris usurpation de `clientId`, contrôle des permissions par l'Engine et interactions GUEST.
3. Un **contrôle statique CI** vérifie la présence des actions connues et refuse les nouvelles actions UI Router sans classification. Cette couverture ne prouve pas à elle seule l'exhaustivité des routes Core/Gateway, car certains chemins sont dynamiques : inspection de diff, revue de sécurité et tests runtime restent indispensables.
4. **À construire et rendre bloquant avant toute publication Auth** : scanner exhaustif de la table de dispatch des routes API, schémas d'événements, tâches programmées et capacités Engines ; PR ne passe pas si action inconnue ou absence de test de refus. Configurer la protection GitHub de branche pour exiger ce statut CI après validation de ses tests.
5. Les modifications d'une permission existante requièrent un diff explicite, un commentaire sur les nouveaux droits et une hausse de `permissions_version` si la politique ou le sens de l'action change (P1.6).
6. **Aucune permission par défaut dans le navigateur**. Le serveur évalue et applique la politique et le vrai `clientId`. La matrice JSON actuelle est une référence documentaire ; tant que le moteur Auth n'est pas déployé, elle **ne bloque pas les requêtes HTTP du runtime DEBUG actuel**.

## 3. Exemple

```text
action_id: indicator.personal.create
resource: indicator.personal
roles: ADMIN, USER
guest: DENY
data_class: OWNER_WRITE
owner_source: CoreAuth.session.clientId
effect: write scoped DB
enforcement: Gateway -> Core Auth -> Router -> Indicator Engine
tests: USER_A_CREATE_OWN_SUCCESS,
       USER_A_WRITE_B_DENY,
       GUEST_WRITE_DENY,
       SPOOF_ROLE_DENY,
       DIRECT_ROUTER_DENY
performance: no password hash per request; benchmark latency p95
```

À l'opposé, `marketdata.registry.refresh` (registre global) demeure `ADMIN` ; un GUEST peut consulter une bougie publique à partir d'un cache assaini sans pouvoir déclencher un refresh consommateur de quotas.

## 4. Transition sans perturber IA-TB

- **Dès maintenant :** exigences documentées, checklist de PR ajoutée à GitHub, test de couverture statique initial pour les **77 actions UI Router** et **128 déclarations HTTP explicites** Core/Gateway/Router ; **vérifié sur GitHub Actions**, non exhaustif pour routes dynamiques. Aucun changement de permissions réelles sur GEN-1 ou de trading.
- **Avant premier merge d'Auth 2.1 :** linter source robuste pour toutes les familles de routes, vérification de chaque classification + tests automatisés et statut GitHub obligatoire pour merges vers DEBUG/RELEASE.
- **Avant activation du nouveau mode Auth** : moteur RBAC, sessions et `clientId` appliqués à toutes les frontières, tests d'intrusion IDOR et des 48 cas négatifs, et tests des ajouts. Les nouveaux endpoints doivent rester **inaccessibles** avant implémentation de leur garde.
- **Wallet :** les permissions futures pour adresses, signatures, prêts, earn et transferts exigent un projet spécifique ; **aucune modification Wallet dans Auth DEBUG 2.1**.
- **RELEASE :** pas de promotion automatique des rôles ni d'héritage des permissions DEBUG.

## 5. Vérifications

- [x] Règle de gouvernance demandée et approuvée par Overflow.
- [x] Inventaire de référence 212 entrées / 77 actions et refus par défaut documentés.
- [x] **CI initial vérifié sur GitHub Actions** : job `Verify static RBAC route & action coverage` en succès sur commit `185d19c` (run [`38494625230`](https://github.com/florian74410/IA-Trading-Bot/actions/runs/38494625230)). Couverture : 128 routes HTTP explicites, 77 actions Router et synchronisation avec 212 entrées déclarées ; auto-tests d'ajouts non autorisés réussis.
- [ ] Configurer ce statut comme **contrôle requis** via les protections de branche GitHub ; tant que ce réglage n'est pas réalisé, un succès de workflow n'empêche pas à lui seul un merge manuel.
- [ ] Scanner complet des routes dynamiques et tests automatisés de toutes les classes de permissions.
- [ ] Tests sur le runtime Auth 2.1 réel et performance ; sans cela la matrice est **conception uniquement**.

**Intégrité du registre :** [contrat de protection RBAC](AUTH_DEBUG_2.1_RBAC_POLICY_INTEGRITY.md) ; fichiers sensibles attribués à CODEOWNERS, CI renforcé contre les élévations GUEST et les reclassifications de routes ADMIN. Le JSON ne doit pas être chargé depuis un volume `:rw` comme source d'autorité. Une empreinte dans le même fichier ne suffit pas : prévoir provenance de build signée et politique immuable avant mise en ligne. Le workflow automatique existe ; **la règle GitHub rendant ses contrôles obligatoires reste à configurer et vérifier**.

**Règle non négociable : ne jamais déployer une action Auth 2.1 nouvellement accessible si sa permission n'est pas connue, validée et testée.**
