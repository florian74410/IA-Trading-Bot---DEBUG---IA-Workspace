# IA-TB v2.2.5 — PR #18 : correctif unifié Fundamental + FED/CME + Trading IA

**Statut : code candidat implémenté ; validation navigateur GEN-1 DEBUG encore obligatoire avant promotion et fusion.**

## Architecture réutilisée

- Brancher le **composant Globe agrandi préexistant de la PR #18**, sans réinventer un deuxième overlay.
- Réutiliser le moteur Globe.gl déjà chargé dans Fundamental avec ses textures, atmosphère, contrôles de caméra et points.
- `fundamental_globe_bridge_v2_2_5.js` écoute les résultats réels de `fundamental.news.search`, distribués par `fundamental_controller_v3.js`, pour alimenter les deux modes.
- Le **compact** monte une instance WebGL légère dans `fundamentalGlobeWebGL`, garde le Canvas de secours, s'arrête lorsqu'il sort de l'écran et met en pause le GPU pendant la vue agrandie.
- Le **grand écran** utilise `fundamental_globe_expanded_v2_2_5.js` : catégories TOP/CRYPTO/DEFI/MACRO/REGULATION/SECURITY, périodes jour/semaine/mois, liste et fiche d'événement, zoom, recentrage, points plus visibles et synchronisation filtre ↔ points ↔ liste.
- Géolocalisation : coordonnées exactes priorisées ; sinon uniquement centroïdes régionaux lorsque des indications explicites dans la news existent. L'absence de localisation ne produit **jamais** de point aléatoire. Les news non localisées restent consultables dans la liste.

## Calendar Events FED/CME

- `calendar_events_v2_2_5.js` est l'adaptateur canonique. Les événements sans heure sûre restent date seule, sans marqueur horaire fictif.
- Prise en charge des heures UTC et explicitement ET/CT avec changement d'heure DST via `Intl`.
- `fundamental_v3.html` présente un **calendrier unifié** avec filtres source et valeurs prévues/réelles/précédentes disponibles ; les calendriers FED/CME détaillés d'origine restent présents.
- `chart_economic_events_v2_2_5.js` relit le calendrier via `/communication/v1/ui/read` et alimente `IATBActiveChartController.setEconomicMarkers()` ; aucune action Trading Engine.
- `chart_controller_native_v1.2.js` affiche sur l'axe des bougies des marqueurs économiques indépendants des marqueurs de trading. Un événement en dehors de la plage temporelle du graphique n'est pas présenté artificiellement sur une bougie existante.
- Préférences `Paramètres → Fundamental` : affichage activé par défaut, FED/CME, drapeaux, Prévu/Réel. Stockage navigateur local par compte si ID disponible, sans migration backend.

## Contrôles disponibles

- `tests/calendar_events_v2_2_5.test.cjs`
- `tests/fundamental_globe_expanded_v2_2_5.test.cjs`
- `tests/v225_unified_integration.test.cjs`
- GitHub Actions : `.github/workflows/v225-unified-qualification.yml` (syntaxe Node 22 et contrats).
- Vérifier indépendamment les workflows historiques de chart/indicator.

## Recette GEN-1 (non encore effectuée)

1. Bâtir l'image isolée v2.2.5, conserver rollback v2.2.4 + DB Auth21 et sauvegardes.
2. Vérifier 13 services, Router/Fundamental/Chart et Trading Engine désactivé, sans production.
3. Tester Firefox miniature/agrandie, scripts CDN, fallback, interaction WebGL, catégories et périodes, liens sources, stabilité GPU.
4. Tester l'agenda FED/CME et marques sur Trading IA avec données réelles horodatées, unité 1m à 1d, bascule Paramètres → Fundamental et persistance.
5. Vérifier rôles ADMIN/USER/GUEST, profil, footer global, défilement et absence de régressions.
6. Ne promouvoir qu'après recette et documentation vérifiées.

Ce patch **ne déploie pas** de classifieur IA des news et **ne modifie pas** les collecteurs ni l'API Supervisor.
