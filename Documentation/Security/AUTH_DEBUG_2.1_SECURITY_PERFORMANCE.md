# IA-TB DEBUG 2.1 — Plan de performance de la sécurité

> **Référence :** Phase 1, P1.4 — [Trust Boundary Contract](../Architecture/AUTH_DEBUG_2.1_TRUST_BOUNDARIES.md).  
> **Statut :** objectifs et méthode d'acceptation **proposés** ; mesures réelles à effectuer sur une version implémentée.  
> **Exigence d'Overflow :** la sécurité de l'IA-TB ne doit pas dégrader sensiblement la réactivité de Trading IA, MarketData, Router ou des Engines.

## 1. Architecture optimisée choisie

| Opération | Mécanisme privilégié | Hors chemin critique |
| --- | --- | --- |
| Connexion / déverrouillage | Argon2id (résistance aux attaques hors ligne), rate limit et SQLite | Ne jamais recalculer Argon2id pour une bougie, une lecture de marché ou un appel CP/1 |
| Requête Core privée | Session opaque et lookup indexé ; ownership vérifié à l'exécution | Aucun mot de passe/clé déchiffrée par requête normale |
| Action UI → Router | Core autorise et signe une capacité à audience/action/arguments bornés ; Router valide cryptographiquement | Pas de re-login, pas de SQL récurrent dans chaque Engine |
| Router → Engine | CP/1 déjà présent, secret machine, HMAC-SHA256 et anti-rejeu | Pas de nouveau certificat et handshake pour chaque appel |
| Données publiques partagées | Autorisation de l'entrée, séparation stricte public/privé et réutilisation des données marché | Ne pas demander Auth pour chaque tick si canal autorisé |
| TLS public futur | TLS 1.3 au proxy, keep-alive, reprise de session/configuration compatible | Pas de handshake complet pour chaque requête persistante |
| CLI ADMIN | Opérations ponctuelles authentifiées OS/SQLite, audit | Aucun effet sur le débit des feeds/engines |
| Event/worker machine | Principal de service à privilèges minimaux ; action allowlist | Pas d'usurpation de rôle ADMIN par service |

**Séparation impérative :** optimiser n'autorise jamais la mise en cache d'une permission périmée donnant accès à un autre compte, ni l'affaiblissement d'Argon2id, du CSRF, de la signature ou d'un contrôle ownership. Une mutation sensible reste contrôlée au plus près de son exécution.

## 2. SLO provisoires — à valider par benchmarks

Le but est une **régression non significative** entre baseline DEBUG 2.0 (environnement équivalent) et DEBUG 2.1 Auth activée, à même charge et données comparables. Ces seuils sont des **cibles de conception, pas des mesures**.

| Indicateur | Objectif provisoire | Bloquant si dépassé ? |
| --- | --- | --- |
| p95 latence de lecture marché/CP1 de bout en bout | ≤ +5 % versus baseline, à charge identique | Oui : optimisation/architecture à revoir |
| p99 latence de lecture marché/CP1 | ≤ +10 % versus baseline | Oui, après répétitions contrôlées |
| Surcoût local d'autorisation d'une requête simple | Cible p95 ≤ +2 ms à évaluer selon charge et CPU ; publier l'écart absolu et relatif | Si non tenu : profilage avant acceptation |
| Throughput lecture/candles | ≥ 95 % du débit de référence | Oui, hors saturation fournisseurs |
| Tick → calcul Engine autonome sans origine Web | Aucun aller-retour Core Auth ajouté au traitement de chaque tick | Oui (test d'architecture) |
| CPU/RAM de Core/Auth + Gateway + Router | Mesurer écart au repos et sous charge sans saturation ni fuite | À qualifier avec profilage |
| Session lock / révocation / IDOR / permission | 0 accès non autorisé, refus fail closed | **Bloquant quelle que soit la performance** |

Lorsque la baseline est très courte (ex. sous la milliseconde), les pourcentages seuls deviennent peu pertinents : rapporter également le surcoût absolu et la variance. Mesurer séparément coûts réseau, DB indexée, HMAC/signature et sérialisation JSON. Ajuster les SLO **avant** implémentation à partir de mesures si une cible n'est pas réaliste ; ne jamais les relever seulement pour masquer une régression.

## 3. Campagne de mesure et comparaison

1. Sur banc de test **isolé**, sans ordres LIVE ni wallets réels, instrumenter Gateway, Core, Router et Engine avec `process.hrtime.bigint()` / `performance.now()` en histogrammes ; jamais enregistrer les cookies, credentials ni capacités.
2. Préparer un scénario **baseline sans Auth** et une version **Auth activée**, avec services, CPU, Node 22, fournisseurs simulés, taille de payload, histogrammes et cadence identiques. Capturer p50/p95/p99, throughput, CPU, RSS, GC et taux d'erreurs. Garder la part réseau externe constante (mocks).
3. Tester séparément 1, 10 puis 100 requêtes concurrentes et des durées représentatives, en distinguant démarrage froid et connexions HTTP réutilisées. Ne pas lancer un bench CPU agressif sur le VPS partagé pendant l'activité.
4. Parcours : `GET /api/bootstrap` sécurisé ; vue Trading/candles ; CP1 `ui/read` ; CP1 `ui/write` vers Engine stub ; page ADMIN ; ouverture/sortie de session ; Session LOCK ; scénarios à compte autre/guest.
5. Ajouter un test streaming/MarketData où le nombre de ticks augmente mais **les opérations d'auth ne doivent pas croître linéairement avec chaque tick**.
6. Simuler Core indisponible, key manquante, rotation, session révoquée, action modifiée après signature, clientId falsifié, version incompatible ; mesurer les refus sans exécution métier.
7. Sur l'environnement de déploiement, exécuter **uniquement des sondes légères et autorisées** ; ne pas tester les ordres LIVE. Toute mesure de performance réelle sur GEN-1 requiert accord préalable.

### Métadonnées du rapport de benchmark

Conserver commit SHA, version Node, taille de corps, scénario/charge, durée, OS/vCPU/RAM, catégorie d'autorisation, baseline/secure, p50/p95/p99, requêtes/seconde, CPU/RAM et nombre de refus. **Pas de PII, tokens, clés, cookies ou données de wallet.**

## 4. Critères d'architecture/implémentation

- Gestion TLS via reverse proxy conforme (Phase 7), connexion persistante ; **pas de `rejectUnauthorized: false`** ni d'omission de validation de certificat.
- Ne pas charger/hasher le mot de passe à chaque requête ; HMAC et validation de claims bornés en temps constant (comparaison signature).
- Durée faible des preuves signées ; nonces anti-rejeu **pour mutations**, état borné/mémoire plafonnée ; pas de cache de permission pouvant déborder un lock/révocation.
- Pas de réseau interservices supplémentaire dans la boucle MarketData interne qui reçoit un flux de marché public déjà autorisé ; placement des validations à l'entrée de la requête et aux mutations.
- Gestion `http.Agent` keepAlive/pooling mesurée ; avant tout partage de connexion, garantir séparation des headers et confidentialité des réponses par `clientId`.
- Si les SLO ne passent pas, profiler/optimiser/affecter les ressources **sans retirer les barrières Auth/ownership**.

## 5. État

- [x] Contraintes de performance et principes de coûts définis au niveau P1.4.
- [x] Scénarios et métriques de benchmark spécifiés.
- [ ] Baseline mesurée sur banc isolé et rapport conservé.
- [ ] Version Auth 2.1 benchmarkée avec les 3 rôles et contre-exemples.
- [ ] Contrôle de charge, lock/révocation, cohérence DB et tests anti-rejeu validés.
- [ ] SLO approuvés sur mesures, avec absence de régression notable ou décision documentée.

**Le protocole final, les seuils réels et la conception des preuves de service restent soumis aux tests.**