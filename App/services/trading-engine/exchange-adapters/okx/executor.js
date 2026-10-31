
"use strict";
const crypto = require("crypto");
const { ensureLive, statusFromHttp, asError } = require("../../executor-utils");

function isoNow() { return new Date().toISOString(); }

class OkxExecutor {
  capabilities() { return require("./capabilities.json"); }

  async execute(order, ctx) {
    ensureLive(ctx);
    const s = await ctx.secretProvider.get("OKX");
    const key = s.api_key || s.apiKey;
    const secret = s.api_secret || s.secret;
    const passphrase = s.passphrase;
    if (!key || !secret || !passphrase) throw new Error("OKX API credentials missing");

    const path = "/api/v5/trade/order";
    const bodyObj = {
      instId: order.symbol.replace("/", "-"),
      tdMode: order.market_type === "SPOT" ? "cash" : (order.metadata.td_mode || "cross"),
      clOrdId: String(order.client_order_id).replace(/[^A-Za-z0-9]/g,"").slice(0,32),
      side: order.side.toLowerCase(),
      ordType: order.order_type.toLowerCase(),
      sz: order.quantity,
      px: order.price,
      reduceOnly: order.reduce_only || undefined,
      posSide: order.position_side ? order.position_side.toLowerCase() : undefined
    };
    Object.keys(bodyObj).forEach(k => bodyObj[k] === undefined || bodyObj[k] === null ? delete bodyObj[k] : 0);
    const body = JSON.stringify(bodyObj);
    const timestamp = isoNow();
    const sign = crypto.createHmac("sha256", secret)
      .update(timestamp + "POST" + path + body)
      .digest("base64");

    const headers = {
      "OK-ACCESS-KEY": key,
      "OK-ACCESS-SIGN": sign,
      "OK-ACCESS-TIMESTAMP": timestamp,
      "OK-ACCESS-PASSPHRASE": passphrase
    };
    if (s.demo_mode || s.demoMode) headers["x-simulated-trading"] = "1";

    const res = await ctx.transport({ method:"POST", url:`https://www.okx.com${path}`, headers, body });
    const first = res.body && Array.isArray(res.body.data) ? res.body.data[0] : null;
    const ok = statusFromHttp(res.statusCode) && res.body && String(res.body.code) === "0" && (!first || String(first.sCode) === "0");

    return {
      ok,
      status: ok ? "ACCEPTED" : "REJECTED",
      exchange_order_id: first && (first.ordId || first.clOrdId) || null,
      raw_status: first && first.sMsg || null,
      error: ok ? null : (first && first.sMsg) || asError(res.body, `HTTP ${res.statusCode}`),
      diagnostics: { http_status: res.statusCode, code: res.body && res.body.code }
    };
  }

  async cancel(order, ctx) {
    ensureLive(ctx);
    const s = await ctx.secretProvider.get("OKX");
    const key=s.api_key||s.apiKey, secret=s.api_secret||s.secret, passphrase=s.passphrase;
    if(!key||!secret||!passphrase) throw new Error("OKX API credentials missing");
    const path="/api/v5/trade/cancel-order", bodyObj={instId:order.symbol.replace("/","-"),ordId:order.exchange_order_id||undefined,clOrdId:order.client_order_id||undefined};
    Object.keys(bodyObj).forEach(k=>bodyObj[k]===undefined&&delete bodyObj[k]);
    const body=JSON.stringify(bodyObj), timestamp=isoNow(), sign=crypto.createHmac("sha256",secret).update(timestamp+"POST"+path+body).digest("base64");
    const headers={"OK-ACCESS-KEY":key,"OK-ACCESS-SIGN":sign,"OK-ACCESS-TIMESTAMP":timestamp,"OK-ACCESS-PASSPHRASE":passphrase}; if(s.demo_mode||s.demoMode)headers["x-simulated-trading"]="1";
    const res=await ctx.transport({method:"POST",url:`https://www.okx.com${path}`,headers,body}); const first=res.body&&Array.isArray(res.body.data)?res.body.data[0]:null;
    const ok=statusFromHttp(res.statusCode)&&res.body&&String(res.body.code)==="0"&&(!first||String(first.sCode)==="0");
    return {ok,status:ok?"CANCEL_REQUESTED":"REJECTED",exchange_order_id:first&&(first.ordId||first.clOrdId)||order.exchange_order_id||null,raw_status:first&&first.sMsg||null,error:ok?null:(first&&first.sMsg)||asError(res.body,`HTTP ${res.statusCode}`),diagnostics:{http_status:res.statusCode,code:res.body&&res.body.code}};
  }
}
module.exports = { OkxExecutor };
