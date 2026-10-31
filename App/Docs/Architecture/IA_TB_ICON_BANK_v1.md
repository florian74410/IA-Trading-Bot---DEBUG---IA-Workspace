# IA-TB Icon Bank v1

Local SVG icon registry for IA-TB v2.0 DEBUG.

## Design rules
- Local only: no CDN/font dependency.
- 20x20 viewBox, outline style, currentColor.
- Compatible with the legacy Firefox/High Sierra target.
- UI usage: `<span data-ia-icon="wallet"></span>`.
- Runtime API: `IATBIcons.make(name)`, `IATBIcons.has(name)`, `IATBIcons.names`, `IATBIcons.apply(root)`.

## Inventory derived from the current application

### Navigation / identity
`home account users settings admin bank`

### Bank / wallet / custody
`wallet ledger key vault shared loan swap bridge receive send lock unlock shield signature history`

### Trading / strategy / risk
`trading chart candles strategy indicator risk position order buy sell pnl target`

### Engines / data / infrastructure
`marketdata liquidity fundamental news globe source database cache engine supervisor ai router firewall protocol api server network cloud latency cpu memory`

### Portfolio / analytics
`portfolio asset balance performance analytics pie calculator`

### Admin / debug / runtime
`terminal debug logs test status warning error info update power restart play stop`

### Generic UI actions
`search filter plus minus edit trash copy eye eyeoff download upload refresh close check chevron menu bell calendar clock link external`

### Markets / providers
`exchange onchain defi`

## Application coverage

The inventory was derived from the active v2.0 DEBUG tree and covers:
- global navigation and settings;
- Bank, Wallets, Vaults and future loans/swap/bridges;
- Trading IA and Chart Viewer;
- Strategy and Indicator engines;
- Fundamental V3, news, sources and globe;
- Market Data and Liquidity;
- Portfolio;
- Risk, Firewall, Router and CP/1;
- Supervisor/AI;
- Admin/debug/service lifecycle;
- server/network/cache/database/API infrastructure.

Exchange and crypto brand marks should remain separate assets when exact official branding is required. The generic `exchange`, `asset`, `onchain` and `defi` icons cover neutral UI until brand assets are deliberately added.

## Maintenance
New application features should reuse an existing semantic icon where possible. Add a new icon only when the concept is genuinely distinct. Keep names stable because UI pages may reference them by key.
