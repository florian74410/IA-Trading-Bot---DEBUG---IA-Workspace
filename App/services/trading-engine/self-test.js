"use strict";

const assert = require("assert");
const { TradingEngine, normalizeOrderIntent } = require("./trading-engine");
const { registerDefaultExecutors } = require("./registry");

(async () => {
  assert.throws(() => normalizeOrderIntent({
    exchange:"BINANCE", symbol:"BTC/USDT", side:"BUY", quantity:"0.001"
  }), /risk_approval_id/);

  const engine = registerDefaultExecutors(new TradingEngine({ liveExecutionEnabled:false }));
  const health = engine.health();
  assert.deepStrictEqual(health.exchanges.slice().sort(), ["BINANCE","GMX","KRAKEN","OKX"]);

  const caps = engine.capabilities("OKX");
  assert.strictEqual(caps.exchange, "OKX");

  const result = await engine.execute({
    request_id:"self-test-1",
    risk_approval_id:"risk-001",
    exchange:"BINANCE",
    market_type:"SPOT",
    symbol:"BTC/USDT",
    side:"BUY",
    order_type:"MARKET",
    quantity:"0.001"
  });
  assert.strictEqual(result.ok, false);
  assert.match(String(result.error||""), /Live execution is disabled/i);

  console.log("[PASS] Trading Engine core self-test");
})().catch(err => {
  console.error("[FAIL] Trading Engine core self-test");
  console.error(err);
  process.exit(1);
});
