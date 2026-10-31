IA-TB Market Data - Custom provider plug-ins

To add a CEX/DEX without editing Router or Core:
1. Place the provider JavaScript module under MarketData/Provider/.
2. Implement getCandles(symbol,timeframe,callback), getTicker(symbol,callback), or pairLiquidity(symbol,callback).
3. Add MarketData/Provider/Custom/<ID>.provider.json:
{
  "id": "MYEXCHANGE",
  "label": "My Exchange",
  "type": "CEX",
  "module": "./myexchange_provider",
  "capabilities": ["candles","ticker"],
  "settingsKey": "MYEXCHANGE",
  "transport": "REST",
  "defaultEnabled": true
}
4. Restart Market Data. The provider will be exposed through Market Data and the generic Router exchange routes.

Allowed types: CEX, DEX, DEX_AGGREGATOR, DATA.
