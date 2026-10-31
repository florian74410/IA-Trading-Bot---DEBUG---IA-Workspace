# IA-TB 2.1 — ChartViewer / Indicator Studio / Drawing Tools

## Base et limites de livraison

Développement dans `App/`, sur `feature/chart-workspace-v2.1`, à partir du HEAD de la PR #7 :
`8907c6b2b89add55afacd0ccd441184f4981551e`.

Le HEAD distant de `debug-v2.01` vérifié pendant le travail est
`c49e7b024cf6b85f305a3205da2c61e8926b7895`.
Les deux branches restent intactes. Aucune fusion, aucun déploiement GEN-1.
La PR de livraison cible la branche source de #7 pour isoler le diff d'interface.
Elle ne remplace pas la QA ni la réconciliation future de #7 avec DEBUG.

Le sélecteur marché/paire de `393415b1` et le style du dock de `126b8780` sont
repris dans les fichiers d'intégration UI. Leurs assets modifiés utilisent un
nouveau suffixe de cache `2110` ; les assets du Renderer V2 restent ceux de #7.
Les changements concurrents du lecteur JSON et du contrôleur de `77113a93` et
`df39cc88` ne sont pas écrasés sur leur branche, ni transplantés dans ce travail :
ils touchent le rendu existant. Leur réconciliation avec V2 devra être revue avant
une intégration dans DEBUG. Ne pas remplacer `debug-v2.01` par cette branche.

Les fichiers suivants sont identiques à la base #7 :
- `App/Indicators/**`, dont les 21 définitions BuiltIn et les algorithmes.
- `App/Frontend/JS/indicator_visual_renderer_v2.js`.
- `App/Frontend/JS/indicator_json_reader_v2.0.js`.
- `App/Frontend/JS/chart_controller_native_v1.2.js`.
- Backend, Router, Firewall, authentification et Trading Engine.

## Fonctionnement

- Barre compacte, marché/paire recherchables, timeframe existant, mode agrandi,
  réglages, capture PNG des vrais canvases, ouverture Studio et affichage des dessins.
- Les selects `exchangeSelect` et `symbol` restent uniques et leurs événements
  `change` alimentent les loaders existants. La colonne Markets reste raccordée.
- Le sélecteur de type ne propose que les capacités du contrôleur. Cette base ne
  possède que les chandeliers : le select est explicitement désactivé avec infobulle.
- Un seul Studio remplace le panneau Trading historique : recherche, catégories,
  activation (limite existante 8), badges V2, visibilité, réglages visuels, modèles
  nommés et import via `IATBIndicatorUI.importFile`, donc validation backend existante.
- Les réglages décorent une copie des métadonnées des résultats déjà calculés,
  sans changer les valeurs ni les définitions. Les capacités non supportées
  (placement libre, style/épaisseur des sous-graphes) ne sont pas proposées.
- Dessins : sélection/navigation, droite, horizontale, verticale, retracement et
  extension Fibonacci à 3 ancrages, Long/Short, rectangle, mesure, texte,
  suppression, annuler/rétablir. Glisser ou cliquer les points, Échap pour annuler.
- Les poignées modifient les ancrages ; glisser le corps déplace l'objet. Un
  inspecteur permet couleur, épaisseur, opacité, visibilité, verrouillage et portée.
- TP/SL incohérents refusés ; risque/rendement et montants théoriques en devise
  de cotation, disponibles seulement avec quantité. Aucun ordre ni frais simulé.
- Les ancrages sont temps/prix (secondes/prix), jamais pixels. Un canvas séparé
  suit la géométrie existante, le zoom, le pan et le redimensionnement.

## Persistance

Stockage local au navigateur et à l'origine, sans synchronisation serveur :
- sélection : clé existante `iatb.indicators.selected.v2` ;
- apparence/modèles : `iatb.indicator.studio.v21` ;
- dessins : `iatb.chart.drawings.v21`, format versionné, groupés marché/paire,
  portée timeframe par défaut ou tous timeframes sur demande.

Les erreurs de stockage sont visibles. Un format inconnu/corrompu n'est pas
remplacé silencieusement. Maximum 200 dessins par marché/paire et 60 annulations.
Les anciens dessins éphémères du prototype inline n'avaient pas de stockage à migrer.

## Fichiers de livraison

Créés :
- `App/Frontend/CSS/chart_workspace_v2.1.css`
- `App/Frontend/JS/chart_toolbar_v2.1.js`
- `App/Frontend/JS/indicator_studio_v2.1.js`
- `App/Frontend/JS/chart_drawing_tools_v2.1.js`
- `App/Frontend/JS/chart_drawings_storage_v2.1.js`
- `App/UI/Tests/test_chart_workspace_v21.js`
- `App/UI/Tests/test_chart_drawing_contract_v21.js`
- `.github/workflows/chart-workspace-v21.yml`
- ce document.

Modifiés :
- `App/Frontend/Pages/app_v1.0.html` : chargement des modules, sélecteurs conservés,
  retrait du prototype inline concurrent de dessin.
- `App/Frontend/CSS/trading_ia_v2.css` : dock masqué uniquement sans sous-graphe.
- `App/Frontend/JS/indicator_ui_v2.0.js` : montage Studio, décoration et API UI.
- `App/UI/Tests/test_trading_indicators_v204.js` : couleurs/placement V2 et parcours
  du nouveau menu Paramètres, en conservant les assertions de rendu réel.

## Reproduction locale (Node 22)

Playwright est uniquement une dépendance de QA, pas une dépendance de production.
Dans un environnement de test isolé :

```bash
npm ci --prefix App --omit=dev --no-audit --no-fund
npm install --prefix /tmp/iatb-workspace-qa --no-audit --no-fund playwright@1.62.1
/tmp/iatb-workspace-qa/node_modules/.bin/playwright install --with-deps firefox
export NODE_PATH=/tmp/iatb-workspace-qa/node_modules
node --test App/UI/Tests/test_chart_drawing_contract_v21.js App/UI/Tests/test_chart_workspace_v21.js App/UI/Tests/test_trading_indicators_v204.js App/UI/Tests/test_indicator_visual_v2.js
node App/Indicators/Tests/test_indicator_engine.js
node App/Indicators/Tests/test_indicator_settings_v1.js
node App/Indicators/Tests/test_indicator_complete_v2.js
node App/Indicators/Tests/test_indicator_ir_v2.js
node App/Indicators/Tests/test_indicator_language_v2.js
node App/Indicators/Tests/test_indicator_analysis_v1.js
```

Dans le conteneur de développement courant seulement, `IATB_FIREFOX_CONTAINER=1`
adapte le sandbox Firefox. Ne pas appliquer ce réglage au navigateur utilisateur.
Les routes HTTP sont interceptées par les tests : bougies et réponses sont des
fixtures locales, calculées par le vrai Engine ; aucune source réelle contactée,
aucune donnée injectée dans GEN-1. Les tests vérifient aussi les pixels réels,
les cas d'erreur/warmup, les réponses tardives et l'absence d'action Trading.

## Résultats locaux

Node 22.23.3, Firefox Playwright 1.62.1 :
- 12 scénarios fonctionnels workspace, plus un scénario optionnel de captures locales.
- 11 scénarios de régression Trading/indicateurs.
- 3 scénarios de contrat dessins/stockage et la suite Visual V2.
- Les 6 scripts Engine listés ci-dessus réussissent.
- Captures locales inspectées pour le graphique avec position Long et le Studio.

Le test de navigation utilise une page de destination fixture minimale et le
vrai lien du menu ; il vérifie la persistance au retour et l'absence de doublons,
mais ne valide pas le contenu de Paramètres. La vérification sur GEN-1 reste ouverte.

## Validation manuelle après autorisation distincte

Ne pas déployer automatiquement. Avant toute intégration, vérifier la QA #7 et
réconcilier explicitement les fichiers UI communs avec le dernier DEBUG.
Le changement est frontend uniquement et ne nécessite aucune migration des données.

Sur le build approuvé, dans Firefox :
1. Recharger Trading IA, vérifier une seule barre et un seul Studio, pas d'erreur console.
2. Choisir marché dans Markets puis dans la barre ; paire, graphique et barre doivent
   rester cohérents. Tester recherche, Entrée, Échap, changement de timeframe.
3. Activer Ichimoku, Bollinger, Supertrend, MACD et RSI ; contrôler nuage, bandes,
   histogramme, zones et sous-graphes au zoom/pan. Modifier couleur/opacité et visibilité.
4. Enregistrer, renommer, recharger, modifier puis supprimer un modèle ; importer un
   JSON valide et un invalide avec le parcours existant.
5. Tracer et déplacer chaque outil ; modifier les niveaux Fibonacci et TP/SL, essayer
   des niveaux invalides, vérifier ratio Long/Short, verrouillage et annuler/rétablir.
6. Recharger, changer paire/marché/timeframe et revenir ; vérifier portée et restauration.
7. Naviguer Paramètres → Trading, agrandir/réduire, capturer PNG, tester 390/768/1024/1440 px.
8. Vérifier l'absence de commande broker et de recalcul lors d'un simple dessin ou
   changement d'apparence. Les montants des positions sont purement théoriques.

Ces tests locaux ne constituent pas une validation fonctionnelle sur GEN-1.
