
"use strict";
const { ensureLive, statusFromHttp, asError } = require("../../executor-utils");

function chainHost(chain) {
  const c = chain || "arbitrum";
  return `https://${c}.gmxapi.io/v1`;
}

class GmxExecutor {
  capabilities() { return require("./capabilities.json"); }

  async execute(order, ctx) {
    ensureLive(ctx);
    const chain = order.chain || "arbitrum";
    const base = chainHost(chain);

    if (!ctx.walletSigner || typeof ctx.walletSigner.signGmxPreparedOrder !== "function") {
      return {
        ok:false,
        status:"SIGNATURE_REQUIRED",
        error:"GMX requires a wallet/EIP-712 signer for live order submission",
        diagnostics:{ chain, required:"walletSigner.signGmxPreparedOrder" }
      };
    }

    // GMX request schemas are richer than CEX order schemas.
    // Exchange-specific values remain in metadata to avoid polluting the common protocol.
    const prepareBody = {
      account: order.account || order.metadata.account,
      market: order.metadata.market,
      initialCollateralToken: order.metadata.initial_collateral_token,
      initialCollateralDeltaAmount: order.metadata.initial_collateral_delta_amount,
      sizeDeltaUsd: order.metadata.size_delta_usd,
      acceptablePrice: order.metadata.acceptable_price,
      triggerPrice: order.metadata.trigger_price || "0",
      isLong: order.side === "BUY",
      orderType: order.metadata.gmx_order_type,
      decreasePositionSwapType: order.metadata.decrease_position_swap_type,
      receiver: order.metadata.receiver || order.account,
      callbackContract: order.metadata.callback_contract,
      uiFeeReceiver: order.metadata.ui_fee_receiver,
      referralCode: order.metadata.referral_code
    };
    Object.keys(prepareBody).forEach(k => prepareBody[k] === undefined || prepareBody[k] === null ? delete prepareBody[k] : 0);

    const prep = await ctx.transport({
      method:"POST",
      url:`${base}/orders/txns/prepare`,
      body: prepareBody
    });

    if (!statusFromHttp(prep.statusCode)) {
      return { ok:false, status:"REJECTED", error:asError(prep.body, `HTTP ${prep.statusCode}`), diagnostics:{phase:"prepare", chain} };
    }

    const signed = await ctx.walletSigner.signGmxPreparedOrder(prep.body, { order, chain });
    const submit = await ctx.transport({
      method:"POST",
      url:`${base}/orders/txns/submit`,
      body: signed
    });

    const ok = statusFromHttp(submit.statusCode);
    return {
      ok,
      status: ok ? "SUBMITTED" : "REJECTED",
      exchange_order_id: submit.body && (submit.body.requestId || submit.body.taskId) || null,
      raw_status: submit.body && submit.body.status || null,
      error: ok ? null : asError(submit.body, `HTTP ${submit.statusCode}`),
      diagnostics:{phase:"submit", chain, eventual_consistency:true}
    };
  }

  async positions(query, ctx) {
    const chain=query.chain||"arbitrum", address=String(query.address||query.account||"").trim();
    if(!/^0x[a-fA-F0-9]{40}$/.test(address))throw new Error("GMX_ACCOUNT_ADDRESS_INVALID");
    const r=await ctx.transport({method:"GET",url:`${chainHost(chain)}/positions?address=${encodeURIComponent(address)}&includeRelatedOrders=true`});
    if(!statusFromHttp(r.statusCode))throw new Error(asError(r.body,`HTTP ${r.statusCode}`));
    return {ok:true,exchange:"GMX",chain,address,positions:Array.isArray(r.body)?r.body:[],source:"GMX_API"};
  }

  async orders(query, ctx) {
    const chain=query.chain||"arbitrum", address=String(query.address||query.account||"").trim();
    if(!/^0x[a-fA-F0-9]{40}$/.test(address))throw new Error("GMX_ACCOUNT_ADDRESS_INVALID");
    const r=await ctx.transport({method:"GET",url:`${chainHost(chain)}/orders?address=${encodeURIComponent(address)}`});
    if(!statusFromHttp(r.statusCode))throw new Error(asError(r.body,`HTTP ${r.statusCode}`));
    return {ok:true,exchange:"GMX",chain,address,orders:Array.isArray(r.body)?r.body:[],source:"GMX_API"};
  }

  async balances(query, ctx) {
    const chain=query.chain||"arbitrum", address=String(query.address||query.account||"").trim();
    if(!/^0x[a-fA-F0-9]{40}$/.test(address))throw new Error("GMX_ACCOUNT_ADDRESS_INVALID");
    const r=await ctx.transport({method:"GET",url:`${chainHost(chain)}/balances/wallet?address=${encodeURIComponent(address)}`});
    if(!statusFromHttp(r.statusCode))throw new Error(asError(r.body,`HTTP ${r.statusCode}`));
    return {ok:true,exchange:"GMX",chain,address,balances:Array.isArray(r.body)?r.body:[],source:"GMX_API"};
  }

  async cancel(order, ctx) {
    ensureLive(ctx); const chain=order.chain||"arbitrum", base=chainHost(chain);
    if(!ctx.walletSigner||typeof ctx.walletSigner.signGmxPreparedOrder!=="function")return {ok:false,status:"SIGNATURE_REQUIRED",error:"GMX cancellation requires a wallet/EIP-712 signer",diagnostics:{chain,required:"walletSigner.signGmxPreparedOrder"}};
    const prep=await ctx.transport({method:"POST",url:`${base}/orders/txns/cancel/prepare`,body:{account:order.account||order.metadata.account,orderKey:order.exchange_order_id||order.metadata.order_key}});
    if(!statusFromHttp(prep.statusCode))return {ok:false,status:"REJECTED",error:asError(prep.body,`HTTP ${prep.statusCode}`),diagnostics:{phase:"cancel-prepare",chain}};
    const signed=await ctx.walletSigner.signGmxPreparedOrder(prep.body,{order,chain,action:"cancel"}),submit=await ctx.transport({method:"POST",url:`${base}/orders/txns/submit`,body:signed}),ok=statusFromHttp(submit.statusCode);
    return {ok,status:ok?"CANCEL_REQUESTED":"REJECTED",exchange_order_id:order.exchange_order_id||submit.body&&(submit.body.requestId||submit.body.taskId)||null,raw_status:submit.body&&submit.body.status||null,error:ok?null:asError(submit.body,`HTTP ${submit.statusCode}`),diagnostics:{phase:"cancel-submit",chain,eventual_consistency:true}};
  }
}
module.exports = { GmxExecutor };
