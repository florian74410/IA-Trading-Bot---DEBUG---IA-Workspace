# Protocole de versionnage et de mise à jour IA-TB

Version du protocole : 1.1

Ce document définit la procédure obligatoire pour toute nouvelle version de IA-TB.

## Principe GitHub officiel

Le dépôt GitHub est la **source de vérité du code source courant de IA-TB**.

- La branche `main` doit contenir le code source complet de la dernière version validée.
- Une nouvelle version repart toujours de la dernière source validée présente sur GitHub.
- Une fois la mise à jour terminée et validée, le nouveau code source remplace/actualise l'ancienne source sur `main` par commit Git.
- Les archives de patch installables sont conservées séparément dans `Updates/Patches/`.
- Les anciens états du code ne nécessitent pas de dossiers `source-vX` : l'historique Git/les commits conservent les versions précédentes.
- Aucun secret, coffre, mot de passe, clé privée, token, logs, base locale ou donnée utilisateur ne doit être commité.

Le cycle normal est donc :

`GitHub source N -> développement N+1 -> tests -> patch N vers N+1 -> commit source N+1 -> Updates/Patches -> Wiki`

## Ordre officiel

1. **Versionnage**
   - Définir immédiatement `from_version -> to_version`.
   - `from_version` doit correspondre exactement à la dernière version source validée sur GitHub et à la version installée ciblée.
   - Toute modification fonctionnelle, structurelle ou corrective entraîne une nouvelle version selon la convention du projet.

2. **Développement**
   - Récupérer le code source de la dernière version validée depuis GitHub.
   - Créer la nouvelle version à partir de cette source, jamais à partir d'une vieille archive locale si GitHub possède une source plus récente.
   - Implémenter uniquement les changements prévus pour la version.
   - Pour chaque nouveau CEX/DEX, intégrer en parallèle : marchés/paires, OHLC/OHLCV, volumes, provenance des données, Chart Viewer et Market Data.
   - Tous les paramètres requis par un connecteur (clé, secret, passphrase, token, identifiant, endpoint ou équivalent) doivent être configurables dans `Settings > API`. Aucun secret ne doit être codé en dur.

3. **Tests**
   - Tests fonctionnels.
   - Tests d'intégration.
   - Tests de non-régression.
   - Vérification des connecteurs et des Market Data concernés.
   - Vérification que les données utilisateur et secrets ne sont pas altérés par la mise à jour.

4. **Construction et validation du patch**
   - Générer le manifest avec `from_version` et `to_version` corrects.
   - Calculer et vérifier les hashes des fichiers du patch.
   - Tester le patch avec l'UpdateManager réel sur une copie propre de la version source.
   - Vérifier installation, version finale et mécanisme de rollback lorsqu'il s'applique.
   - Une erreur de type `Version source incompatible` bloque la mise à jour.

5. **CHANGELOG**
   - Documenter uniquement les changements réellement validés.
   - Séparer au minimum : Ajouts, Modifications, Correctifs, Sécurité/Configuration, Compatibilité.

6. **Synchronisation GitHub**
   - Mettre `main` à jour avec le **code source complet de la nouvelle version validée**.
   - Le commit doit représenter exactement le code ayant passé les tests.
   - Ajouter le patch installable dans `Updates/Patches/` avec un nom indiquant clairement la version source et la version cible.
   - Conserver le rapport QA/manifest du patch à proximité lorsque pertinent.
   - Ne jamais versionner de secrets ou de données runtime/utilisateur.

7. **Analyse d'impact Wiki**
   - Identifier les pages Wiki impactées par la version.
   - Pour chaque version, inscrire explicitement soit la liste des pages à modifier, soit `Wiki impact: NONE`.

8. **Mise à jour du Wiki**
   - Mettre à jour uniquement la documentation correspondant à une fonctionnalité effectivement présente dans le code source validé sur GitHub.
   - Ne jamais documenter comme disponible une fonction encore seulement prévue.
   - Les changements de connecteurs doivent au minimum être reflétés dans les pages Connecteurs, Market Data et Settings/API lorsqu'elles sont impactées.

## Condition de version validée

Une mise à jour n'est considérée comme terminée que si :

`VERSION OK + CODE OK + TESTS OK + PATCH OK + CHANGELOG OK + SOURCE GITHUB OK + PATCH GITHUB OK + WIKI IMPACT OK + WIKI OK = VERSION OK`

## Règle spécifique CEX / DEX

Tout connecteur doit être autonome sur ses données de marché. L'application conserve la provenance exacte des données afin qu'un marché provenant d'un exchange ne soit pas silencieusement remplacé par celui d'un autre exchange.

Chaque nouveau CEX/DEX doit donc fournir, lorsque l'API de la plateforme le permet :

- liste des marchés/paires ;
- prix et données de marché ;
- OHLC/OHLCV ;
- volumes propres à la plateforme ;
- état du provider / health check ;
- intégration Chart Viewer ;
- intégration Market Data ;
- paramètres privés dans `Settings > API` ;
- test de connexion lorsque pertinent.

Si une donnée n'est pas fournie directement par la plateforme, l'adaptateur doit documenter clairement la méthode de reconstruction ou la limitation.
