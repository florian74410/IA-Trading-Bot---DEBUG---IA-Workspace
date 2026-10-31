# Risk Engine — base locale v0.1

Cette base est préparée pour **IA-Trading-Bot v1.7.9 debug**, mais n'est pas encore intégrée au dépôt GitHub.

## Règles d'architecture

- Le Risk Engine est un Engine analytique comme les autres.
- Il ne valide, ne modifie et ne bloque aucun ordre.
- Le Supervisor reste le décideur.
- Toutes les communications inter-modules passent en **CP/1 via le Router**.
- Aucun accès direct aux CEX/DEX, Market Data, Indicator Engine, Portfolio ou Trading Engine.
- Le moteur est prévu pour Node.js 16 et n'utilise aucune dépendance npm.

## Sources analysables

Le service sait demander via le Router :

- `market_data` avec l'action existante `market_data.get`
- `indicator` avec l'action existante `indicator.analyze`
- `portfolio` avec un contrat provisoire `portfolio.snapshot`

**Important :** le module Portfolio n'apparaît pas encore dans l'arborescence v1.7.9 debug consultée. L'action `portfolio.snapshot` est donc volontairement confinée dans `requestPortfolio()` et devra être alignée sur le vrai contrat CP/1 du Portfolio avant intégration.

## Capacités CP/1 proposées pour le Risk Engine

- `risk.list_capabilities`
- `risk.position.analyze`
- `risk.portfolio.analyze`
- `risk.strategy.analyze`
- `risk.snapshot`

## Calculs déjà présents dans cette base

- risque d'une position
- perte théorique au stop
- capital à risque
- notionnel / marge / levier
- exposition brute du portefeuille
- concentration par actif
- PnL latent agrégé
- drawdown historique
- volatilité logarithmique
- volatilité annualisée
- VaR historique 95 % et 99 %
- Expected Shortfall historique 95 % et 99 %
- score synthétique 0–100
- avertissements analytiques

Le score est uniquement une **mesure synthétique**. Ce n'est jamais une autorisation d'exécuter un trade.

## Emplacement prévu lors de l'intégration

```text
builds/v1.7.9/
└── Risk/
    ├── Engine/
    │   ├── risk_engine.js
    │   └── risk_service.js
    ├── Tests/
    │   └── risk_engine.test.js
    └── README.md
```

Le port local proposé est `8019`, configurable avec `IATB_RISK_ENGINE_PORT`.

## Test local des calculs

Depuis le dossier `Risk` :

```bash
node Tests/risk_engine.test.js
```

Ce test ne valide que le cœur mathématique. Il ne constitue pas encore un test d'intégration CP/1 avec le Router.
