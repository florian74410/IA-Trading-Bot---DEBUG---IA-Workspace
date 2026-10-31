# Capacités broker — audit du code 2.5.3 DEV

Audit des quatre `App/services/trading-engine/exchange-adapters/*/executor.js`, du
moteur et du transport. Les JSON de capacités ne sont pas considérés comme preuve.
Aucun appel privé distant, compte réel, annulation réelle ou transaction blockchain.
Les statuts décrivent **cet adapter IA-TB**, pas toutes les possibilités de l'exchange.

| Exchange / marché | Ordres | Positions | Statut individuel | Annulation | Confirmation annulation | Clôture | reduce-only | Partiels / timeout / idempotence distante |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Binance SPOT | UNSUPPORTED | UNSUPPORTED | UNSUPPORTED | PARTIAL | UNSUPPORTED | UNSUPPORTED | UNSUPPORTED | NOT_VERIFIED |
| Binance FUTURES_USDM | UNSUPPORTED | UNSUPPORTED | UNSUPPORTED | PARTIAL | UNSUPPORTED | PARTIAL | NOT_VERIFIED | NOT_VERIFIED |
| Kraken SPOT | UNSUPPORTED | UNSUPPORTED | UNSUPPORTED | PARTIAL | UNSUPPORTED | UNSUPPORTED | UNSUPPORTED | NOT_VERIFIED |
| Kraken marge via AddOrder | UNSUPPORTED | UNSUPPORTED | UNSUPPORTED | PARTIAL | UNSUPPORTED | PARTIAL | NOT_VERIFIED | NOT_VERIFIED |
| Kraken Futures | UNSUPPORTED | UNSUPPORTED | UNSUPPORTED | UNSUPPORTED | UNSUPPORTED | UNSUPPORTED | NOT_VERIFIED | NOT_VERIFIED |
| OKX SPOT | UNSUPPORTED | UNSUPPORTED | UNSUPPORTED | PARTIAL | UNSUPPORTED | UNSUPPORTED | UNSUPPORTED | NOT_VERIFIED |
| OKX dérivés / SWAP | UNSUPPORTED | UNSUPPORTED | UNSUPPORTED | PARTIAL | UNSUPPORTED | PARTIAL | NOT_VERIFIED | NOT_VERIFIED |
| GMX perpétuels | READ_ONLY | READ_ONLY | UNSUPPORTED | PARTIAL | UNSUPPORTED | UNSUPPORTED | NOT_VERIFIED | NOT_VERIFIED |
| Broker contrôlé des tests, ordres et positions isolées | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED |

`SUPPORTED` sur la dernière ligne signifie uniquement une preuve sur fixtures.
Aucune des lignes réelles ne permet d'activer P5 ou de qualifier une reprise.

## Preuves dans les adapters

- Binance : `execute` et `cancel`, routage SPOT/USDM, paramètre `reduceOnly`
  seulement USDM. Absence de `orders`, `positions`, `orderStatus`. La gestion
  hedge/one-way, du `positionSide`, des pas de quantité et du compte exact ne
  permet pas de garantir une clôture. La modification de levier est elle-même
  une mutation qui doit rester sous le verrou final.
- Kraken : `AddOrder` et `CancelOrder`, sans lectures privées ni statut individuel.
  `reduce_only` est transmis, sans preuve sur les comptes/marchés autorisés.
  Troncature de `cl_ord_id` et nonce temporel : idempotence non qualifiée.
- OKX : `trade/order` et `cancel-order`, sans inventaire ni rapprochement distant.
  `tdMode`, `posSide` et `reduceOnly` ne suffisent pas à prouver les garanties de
  clôture. Les identifiants de contrats dérivés doivent être validés.
- GMX : trois lectures HTTP publiques existent. Le format, la fraîcheur et les
  identités sont insuffisants pour une preuve P5 ; un corps non tableau devient
  actuellement `[]`. La préparation/signature/soumission n'établit ni inclusion
  blockchain, ni succès du keeper, ni état final de la position. Aucun suivi de
  receipt, reorg, ordre en attente ou confirmation de clôture n'est intégré.
- Les quatre annulations renvoient désormais `CANCEL_REQUESTED`, jamais une
  confirmation `CANCELLED` tirée du seul accusé de réception HTTP.

## Conditions restantes avant tout raccordement financier

1. Registry serveur des comptes par identité Auth21, sans choix de credentials
   implicite par le nom d'exchange ; attribution durable des ordres et positions.
2. Lectures complètes paginées, fraîcheur, statut individuel et identifiants stables.
3. Adaptation de quantité décimale, modes de position et garanties de réduction.
4. Liaison des annulations/clôtures aux autorisations réelles RiskGate et Firewall.
5. Réconciliation Portfolio réelle et traitement des fills tardifs/après timeout.
6. Confirmation on-chain/keeper GMX et preuve de non-augmentation de l'exposition.
7. Qualification multiprocessus de ce raccordement avant toute activation LIVE.

Il n'existe aucun flag permettant d'activer ces opérations dans la 2.5.3 livrée :
`executor-utils.js` impose `LIVE_QUALIFIED=false`, y compris lorsqu'un appelant
fournit `liveExecutionEnabled:true`.
