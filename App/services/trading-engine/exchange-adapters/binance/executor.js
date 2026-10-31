
"use strict";
const crypto = require("crypto");
const { ensureLive, statusFromHttp, asError } = require("../../executor-utils");

function qs(obj) {
  const p = new URLSearchParams();
  Object.keys(obj).forEach(k => {
    if (obj[k] !== undefined && obj[k] !== null && obj[k] !== "") p.append(k, String(obj[k]));
  });
  return p.toString();
}

class BinanceExecutor {
  capabilities() { return require("./capabilities.json"); }

  async execute(order, ctx) {
    ensureLive(ctx);
    const secrets = await ctx.secretProvider.get("BINANCE");
    const apiKey = secrets.api_key || secrets.apiKey;
    const apiSecret = secrets.api_secret || secrets.apiSecret;
    if (!apiKey || !apiSecret) throw new Error("Binance API credentials missing");

    const futures = order.market_type === "FUTURES_USDM";
    const base = futures ? "https://fapi.binance.com" : "https://api.binance.com";
    const path = futures ? "/fapi/v1/order" : "/api/v3/order";

    if (futures && order.leverage) {
      const levParams = { symbol: order.symbol.replace("/", ""), leverage: order.leverage, timestamp: Date.now() };
      const levQuery = qs(levParams);
      const levSig = crypto.createHmac("sha256", apiSecret).update(levQuery).digest("hex");
      const lev = await ctx.transport({
        method:"POST",
        url:`${base}/fapi/v1/leverage?${levQuery}&signature=${levSig}`,
        headers:{"X-MBX-APIKEY":apiKey}
      });
      if (!statusFromHttp(lev.statusCode)) throw new Error(`Binance leverage failed: ${asError(lev.body, "unknown")}`);
    }

    const params = {
      symbol: order.symbol.replace("/", ""),
      side: order.side,
      type: order.order_type,
      quantity: order.quantity,
      quoteOrderQty: !futures ? order.quote_quantity : null,
      price: order.price,
      stopPrice: order.stop_price,
      timeInForce: order.time_in_force || (order.order_type === "LIMIT" ? "GTC" : null),
      newClientOrderId: order.client_order_id,
      reduceOnly: futures && order.reduce_only ? "true" : null,
      timestamp: Date.now(),
      recvWindow: 5000
    };
    const query = qs(params);
    const signature = crypto.createHmac("sha256", apiSecret).update(query).digest("hex");
    const res = await ctx.transport({
      method:"POST",
      url:`${base}${path}?${query}&signature=${signature}`,
      headers:{"X-MBX-APIKEY":apiKey}
    });

    const ok = statusFromHttp(res.statusCode) && !(res.body && res.body.code < 0);
    return {
      ok,
      status: ok ? "ACCEPTED" : "REJECTED",
      exchange_order_id: res.body && (res.body.orderId || res.body.clientOrderId) || null,
      raw_status: res.body && res.body.status || null,
      filled_quantity: res.body && (res.body.executedQty || res.body.cumQty) || null,
      average_price: res.body && (res.body.avgPrice || res.body.price) || null,
      error: ok ? null : asError(res.body, `HTTP ${res.statusCode}`),
      diagnostics: { http_status: res.statusCode, market_type: order.market_type }
    };
  }

  async cancel(order, ctx) {
    ensureLive(ctx);
    const secrets = await ctx.secretProvider.get("BINANCE");
    const apiKey = secrets.api_key || secrets.apiKey, apiSecret = secrets.api_secret || secrets.apiSecret;
    if (!apiKey || !apiSecret) throw new Error("Binance API credentials missing");
    const futures = order.market_type === "FUTURES_USDM";
    const base = futures ? "https://fapi.binance.com" : "https://api.binance.com";
    const path = futures ? "/fapi/v1/order" : "/api/v3/order";
    const params = {symbol: order.symbol.replace("/", ""), orderId: order.exchange_order_id, origClientOrderId: order.client_order_id, timestamp: Date.now(), recvWindow: 5000};
    const query = qs(params), signature = crypto.createHmac("sha256", apiSecret).update(query).digest("hex");
    const res = await ctx.transport({method:"DELETE",url:`${base}${path}?${query}&signature=${signature}`,headers:{"X-MBX-APIKEY":apiKey}});
    const ok = statusFromHttp(res.statusCode) && !(res.body && res.body.code < 0);
    return {ok,status:ok?"CANCEL_REQUESTED":"REJECTED",exchange_order_id:res.body&&(res.body.orderId||res.body.clientOrderId)||order.exchange_order_id||null,raw_status:res.body&&res.body.status||null,error:ok?null:asError(res.body,`HTTP ${res.statusCode}`),diagnostics:{http_status:res.statusCode,market_type:order.market_type}};
  }
}
module.exports = { BinanceExecutor };
