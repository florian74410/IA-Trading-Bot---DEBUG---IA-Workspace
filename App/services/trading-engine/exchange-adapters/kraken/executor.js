
"use strict";
const crypto = require("crypto");
const { ensureLive, statusFromHttp, asError } = require("../../executor-utils");

function krakenType(t) {
  return {
    "MARKET":"market","LIMIT":"limit","ICEBERG":"iceberg",
    "STOP_LOSS":"stop-loss","TAKE_PROFIT":"take-profit",
    "STOP_LOSS_LIMIT":"stop-loss-limit","TAKE_PROFIT_LIMIT":"take-profit-limit",
    "TRAILING_STOP":"trailing-stop","TRAILING_STOP_LIMIT":"trailing-stop-limit"
  }[t] || t.toLowerCase().replace(/_/g,"-");
}

class KrakenExecutor {
  capabilities() { return require("./capabilities.json"); }

  async execute(order, ctx) {
    ensureLive(ctx);
    const s = await ctx.secretProvider.get("KRAKEN");
    const key = s.api_key || s.apiKey;
    const secret = s.api_secret || s.apiSecret;
    if (!key || !secret) throw new Error("Kraken API credentials missing");

    const path = "/0/private/AddOrder";
    const nonce = String(Date.now() * 1000);
    const bodyObj = {
      nonce,
      ordertype: krakenType(order.order_type),
      type: order.side.toLowerCase(),
      volume: order.quantity,
      pair: order.symbol.replace("/", ""),
      price: order.price,
      leverage: order.leverage ? String(order.leverage) : undefined,
      reduce_only: order.reduce_only || undefined,
      cl_ord_id: String(order.client_order_id).slice(0,18)
    };
    Object.keys(bodyObj).forEach(k => bodyObj[k] === undefined || bodyObj[k] === null ? delete bodyObj[k] : 0);

    const encoded = new URLSearchParams(bodyObj).toString();
    const hash = crypto.createHash("sha256").update(nonce + encoded).digest();
    const hmac = crypto.createHmac("sha512", Buffer.from(secret, "base64"));
    hmac.update(Buffer.concat([Buffer.from(path), hash]));
    const sign = hmac.digest("base64");

    const res = await ctx.transport({
      method:"POST",
      url:`https://api.kraken.com${path}`,
      headers:{
        "API-Key":key,
        "API-Sign":sign,
        "Content-Type":"application/x-www-form-urlencoded"
      },
      body: encoded
    });

    const errors = res.body && res.body.error;
    const ok = statusFromHttp(res.statusCode) && Array.isArray(errors) && errors.length === 0;
    const txid = res.body && res.body.result && res.body.result.txid;
    return {
      ok,
      status: ok ? "ACCEPTED" : "REJECTED",
      exchange_order_id: Array.isArray(txid) ? txid[0] : txid || null,
      raw_status: res.body && res.body.result && res.body.result.descr && res.body.result.descr.order || null,
      error: ok ? null : (Array.isArray(errors) ? errors.join("; ") : asError(res.body, `HTTP ${res.statusCode}`)),
      diagnostics: { http_status: res.statusCode }
    };
  }

  async cancel(order, ctx) {
    ensureLive(ctx);
    const s=await ctx.secretProvider.get("KRAKEN"), key=s.api_key||s.apiKey, secret=s.api_secret||s.apiSecret;
    if(!key||!secret)throw new Error("Kraken API credentials missing");
    const path="/0/private/CancelOrder", nonce=String(Date.now()*1000), bodyObj={nonce,txid:order.exchange_order_id||order.client_order_id}, encoded=new URLSearchParams(bodyObj).toString();
    const hash=crypto.createHash("sha256").update(nonce+encoded).digest(), hmac=crypto.createHmac("sha512",Buffer.from(secret,"base64")); hmac.update(Buffer.concat([Buffer.from(path),hash]));
    const res=await ctx.transport({method:"POST",url:`https://api.kraken.com${path}`,headers:{"API-Key":key,"API-Sign":hmac.digest("base64"),"Content-Type":"application/x-www-form-urlencoded"},body:encoded});
    const errors=res.body&&res.body.error, ok=statusFromHttp(res.statusCode)&&Array.isArray(errors)&&errors.length===0;
    return {ok,status:ok?"CANCEL_REQUESTED":"REJECTED",exchange_order_id:order.exchange_order_id||null,raw_status:res.body&&res.body.result||null,error:ok?null:(Array.isArray(errors)?errors.join("; "):asError(res.body,`HTTP ${res.statusCode}`)),diagnostics:{http_status:res.statusCode}};
  }
}
module.exports = { KrakenExecutor };
