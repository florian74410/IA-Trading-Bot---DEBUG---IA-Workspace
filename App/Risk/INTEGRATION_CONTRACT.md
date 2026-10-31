# Contrat d'intégration prévu — Risk Engine v0.1

## Sens des communications

```text
Supervisor -> Router -> Risk Engine
Risk Engine -> Router -> Market Data Collector
Risk Engine -> Router -> Indicator Engine
Risk Engine -> Router -> Portfolio
Risk Engine -> Router -> réponse au demandeur
```

Aucune communication Engine -> Engine directe.

## Données de Market Data

Le prototype utilise le contrat CP/1 déjà observé dans v1.7.9 debug :

- target: `market_data`
- action: `market_data.get`
- data: `candles`, `ohlcv`, `volume`

## Données d'indicateurs

Le prototype utilise le contrat CP/1 déjà observé :

- target: `indicator`
- action: `indicator.analyze`

Le résultat d'indicateur reste un contexte analytique ; le Risk Engine ne duplique pas les calculs de l'Indicator Engine.

## Données Portfolio

Contrat temporaire :

- target: `portfolio`
- action: `portfolio.snapshot`

Il devra être remplacé si le futur Portfolio expose un autre nom de capability.

## Principe de dégradation

- Market Data : requis pour l'analyse statistique ; si indisponible, analyse en erreur.
- Indicator Engine : facultatif ; l'analyse peut être `DEGRADED`.
- Portfolio : facultatif pendant le prototype local ; l'analyse peut être `DEGRADED`.
- À terme, une analyse de portefeuille complète devra évidemment disposer du Portfolio réel.

## Sécurité / CP/1

Le service réutilise :
- secret CP/1 runtime : `.runtime/state/security/communication_protocol_key.dat`
- `CP.makeRequest`
- `CP.validateRequest`
- `CP.makeResponse`
- `X-IATB-CP-Token`
- `/communication/v1/request`
- `/communication/v1/register`

Il suit donc le même modèle que l'Indicator Engine actuel.
