#!/usr/bin/env node
'use strict';
const {preflightTradingAdminKey}=require('../../Core/Clients/auth21_trading_key_provider');
const requested=process.env.IATB_AUTH21_TRADING_ADMIN_BRIDGE==='1';
const result=requested?preflightTradingAdminKey():{ok:true,state:'DISABLED',reason:'CONFIGURATION_NOT_ENABLED'};
console.log(JSON.stringify({...result,liveAuthorized:false,chainValidated:false}));
process.exitCode=result.ok?0:2;
