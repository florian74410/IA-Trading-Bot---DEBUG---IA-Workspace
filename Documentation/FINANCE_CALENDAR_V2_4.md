# IA-TB v2.4 — Finance Calendar integration (DEV)

## Scope
- Branch: `feature/v2.4-finance-calendar`, status **DEV**, release version `2.4.0`.
- Existing Auth21/Core/Firewall design unchanged. Trading LIVE disabled in local SAFE launcher. No VPS deployment or merge.
- Structured Finance Calendar JSON `GET https://www.financecalendar.com/wp-json/fc/v1/calendar` (documented no-key tier); server-side only, not browser direct.
- No paid key, no proxy, no anti-bot bypass. Data attributed visibly to https://www.financecalendar.com.
- Current month and 60 days ahead (bounded <=92 days), including holidays; server-side 15-min cache and controlled request timeout.
- Normalized fields: date, release time UTC, country, impact, series/status, consensus, prior, actual, unit, source and official source URL.
- FED/FOMC source preserved independently. **CME contract expirations not supplied by Finance Calendar** and are explicitly marked NOT_CONFIGURED, never fabricated.
- The Fundamental UI's former CME macro panel is renamed Finance Calendar; events display consensus/previous/actual; scrollable event list (fixed max height 300px), no 8-event truncation.

## Validation
Run from App:
```bash
node tests/test_finance_calendar_v2_4.js
node tests/test_cme_diagnostics_v23.js
node tests/test_v23_admin_ui_regressions.js
```
Live API contract (safe, read only):
```bash
curl -fsS 'https://www.financecalendar.com/wp-json/fc/v1/calendar?from=2026-10-21&to=2026-11-21&limit=3'
```
**Not executed in the author's environment**: DNS resolution to the provider was unavailable. Run on Macro and confirm response shape/country coverage/attribution. If API returns >500 rows in requested window, adapter emits `FINANCE_CALENDAR_PAGINATION_REQUIRED` (future pagination required), not silent truncation.

## Known limits
- A selected historical/future month outside current-month-to-60-day cached range currently displays no data. Implement month-scoped date-range fetch if browsing arbitrary months becomes required.
- Finance Calendar does not provide CME futures/options contract expiry reference data or CME news stories.
- A source error appears as unavailable, not `NO_EVENTS`.
- Calendar events update on the provider's advertised cadence; no streaming market-grade time guarantees.
- Attribution link is visible in the panel.
- Verify source licensing if terms change.

API documentation: https://www.financecalendar.com/api/

## État PR #21 et recette à effectuer

La PR #21 est fusionnée sur `feature/v2.4-finance-calendar` et inclut Trading Logs V2, Auth21/Risk/Firewall conservés et corrections de tests. **566 tests en CI réussis**, sans échec ni test ignoré d'après le rapport de PR. **L'API Finance Calendar n'est pas pour autant validée en accès réel depuis Macro** et la recette de l'interface n'a pas encore eu lieu.

Le calendrier ne garantit pas les événements d'un mois choisi hors fenêtre courante ; ce comportement doit être clairement identifié lors de la recette. Ne pas présenter des expirations CME ni des actualités CME comme disponibles via Finance Calendar. Source de données et attribution restent visibles dans le panneau Fundamental.

Procédure locale (branche v2.4, Node 22, base Auth21/TLS privée préexistante) :

```bash
cd ~/IA-TB-v2.3-TEST
git fetch origin
git switch feature/v2.4-finance-calendar
git pull --ff-only origin feature/v2.4-finance-calendar
cd App
node tests/test_finance_calendar_v2_4.js
bash ./start_auth21_local_safe.command
```

Ouvrir `https://localhost:8000/fundamental`. Vérifier rôle ADMIN, remontées CP/1, liste défilante, attribution, dates/horaires, pays/impact/consensus/réel/précédent, statuts d'erreur et trading LIVE désactivé. **Ne pas envoyer sur GitHub les bases Auth21, clés, passphrases, tokens, WAL, logs privés ou archives de transfert.**
