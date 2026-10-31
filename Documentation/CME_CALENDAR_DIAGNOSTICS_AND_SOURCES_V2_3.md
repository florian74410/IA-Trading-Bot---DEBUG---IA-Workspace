# CME Calendar — diagnostic P3 / sources alternatives (2026-10-21)

## Diagnostic ajouté
`Fundamental/Providers/calendar_provider.js` renvoie des codes distincts pour les deux flux `cme` et `cmeExpirations` :
- `HTTP_BLOCKED` : réponse HTTP 401/403/407/429 ou page de challenge détectée ; ne prouve pas à lui seul une protection anti-bot.
- `JS_RENDER_REQUIRED` : indices de rendu client sans lignes statiques, diagnostic heuristique.
- `PARSE_INCOMPATIBLE` : HTML récupéré mais format sans événement reconnu.
- `NO_EVENTS` : page indiquant explicitement zéro événement pour sa date courante ; **pas** une garantie de zéro événement sur tout le mois sélectionné.
- `STALE_DATA` : alerte de fraîcheur `cacheStatus` si le cache en mémoire dépasse 5 minutes ; expiration normale à 10 min.
- `UNAVAILABLE` : timeout, TLS, DNS ou indisponibilité non identifiée.
La collecte transmet `fetchedAt`, `transport`, `pageDate` et `events`. Aucune fausse donnée insérée.
Test source : `node tests/test_cme_diagnostics_v23.js` depuis `App/` (exécution locale à confirmer).

## Fournisseurs examinés
1. **CME Reference Data API** : référence exacte de dates de première/dernière négociation, avis, livraison, règlement et contrat. Accès contractuel, à demander à gam@cmegroup.com. https://www.cmegroup.com/trading/market-tech-and-data-services/cme-reference-data-api.html
2. **Trading Economics Economic Calendar API** : calendrier macro structuré, actual/précédent/consensus, filtre pays et dates ; nécessite clé/licence adaptée à l'usage IA-TB. https://docs.tradingeconomics.com/economic_calendar/snapshot/
3. **Financial Modeling Prep Economic Calendar** : JSON économique avec `from`/`to` (limite 90 jours selon documentation), horaires UTC ; vérifier tarification et licence. https://site.financialmodelingprep.com/fr/developer/docs/stable/economics-calendar
4. **BLS** : publication officielle des annonces économiques US au format calendrier ICS. https://www.bls.gov/schedule/news_release/bls.ics
5. **BEA** : calendrier public pour GDP, PCE et autres publications, y compris 2027. https://www.bea.gov/news/schedule/
6. **FED** : calendrier FOMC déjà intégré via FedWatch.
Les calendriers macro alternatifs ne répliquent **pas** les échéances de contrats CME. Les services d'actualités sont à traiter séparément.

## Contrainte de conformité
Le CME indique expressément des restrictions de collecte automatisée et d'utilisation de ses données pour AI/ML dans les conditions applicables. Un proxy d'évitement ou scraping contournant les blocages n'est pas une voie retenue.
https://www.cmegroup.com/content/dam/cmegroup/notices/clearing/2023/12/Chadv23-364.pdf
https://www.cmegroup.com/market-data/files/market-data-license-agreement-updates-june-2026.pdf

## Reste à réaliser
- Exécuter tests Node v22 + recette locale sur copie Git mise à jour.
- Vérifier statuts des deux collecteurs dans le payload `fundamental.calendar.upcoming`.
- Connecter un fournisseur JSON autorisé, sans remplacement fictif des événements et avec priorité aux publications directes BLS/BEA.
- Ajouter le filtrage de période côté service : la navigation historique dans le calendrier UI ne provoque pas actuellement de nouvelle collecte par mois.
- Afficher `status` et `cacheStatus` dans le panneau, plutôt que montrer '0 événement' quand l'extraction a échoué.
- Isoler le calendrier d'expirations CME des données macro.
