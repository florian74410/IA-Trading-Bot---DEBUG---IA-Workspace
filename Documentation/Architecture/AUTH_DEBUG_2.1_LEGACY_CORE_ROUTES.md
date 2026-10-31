# Auth21 — Registre de migration des routes HTTP historiques Core

**Statut : chantier A non clos.** Révision initiale de l'audit : 15/10/2026.

Le code de Core `App/Core/Server/server.js` contient **103 déclarations
HTTP littérales** détectées sous la forme `req.method && p`. Ces
déclarations ne sont **pas toutes des parcours métier pertinents** et leur
présence dans le code legacy ne doit jamais les rendre accessibles
automatiquement sous Auth21.

L'outil `App/Tools/CI/auth21_legacy_core_route_audit.js` les reclasse
sans exécuter de route ni se connecter à des exchanges. Son test garantit que
toute route littérale recensée est attribuée à une catégorie exclusive et
qu'en **mode Auth21 isolé**, toutes reçoivent HTTP 404, y compris si
le navigateur forge ADMIN et un autre `clientId`. L'ajout d'une route sans
classification explicite bloque le contrôle de couverture.

## Catégories et politique avant adaptation

| Catégorie | Politique de migration |
| --- | --- |
| bootstrap-obsolete | Réutiliser exclusivement login/logout Auth21 ; ne pas réouvrir setup/recovery legacy |
| administration | Session ADMIN active + permissions exactes + audit ; jamais d'exécution shell arbitraire |
| wallet-key-transfer-denied | Hors chantier A ; revue dédiée clés, transferts, secrets, effets irréversibles |
| legacy-account | Remplacer l'identité issue du navigateur par celle de la session Core et le store par client |
| external-side-effects | Refus par défaut tant que permissions, facturation et fournisseurs ne sont pas intégrés |
| user-private-settings | Réécriture vers les véritables stores scopés par `clientId`, validation et garde snapshot |
| diagnostics | Exposer seulement des réponses réduites, non sensibles et explicitement autorisées |

Les véritables parcours métier peuvent être ouverts sous **de nouveaux
contrats explicites** (Gateway → Core → Router → Engine), mais le simple
fait de porter le même chemin legacy ne dispense pas de vérifier la
méthode, le rôle, l'action, le propriétaire, la session, la signature IPC,
l'expiration et les effets sur disque.

### Garanties qui restent à démontrer

- Couvrir les routes dynamiques, regexp, alias, CP/1, WebSocket et autres
  formes non détectées par le scanner de littéraux.
- Migrer les opérations légitimes vers les magasins réels avec
  séparation effective entre utilisateurs et contrôle indépendant Engine.
- Fermer tous les contournements autorisés dans le runtime normal et
  construire la vraie interface de connexion et déverrouillage.
- Vérifier le tout sur banc multi-processus complet et sous charge
  avant toute clôture des phases 3/4.

**Important :** recenser 103 routes et prouver leur refus n'est PAS
équivalent à adapter 103 routes. Il est interdit d'annoncer la fin de
chantier A uniquement sur ce résultat.

Aucune action sur GEN-1 ou les fonds des utilisateurs.
