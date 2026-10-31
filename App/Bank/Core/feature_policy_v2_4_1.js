"use strict";
const SUSPENDED=Object.freeze(['swap','bridge','vaults','shared','loans']);
function blockedPath(p){return /^\/api\/(?:swap-bridge|bank\/(?:vaults?|shared|loans?|swap|bridge))(?:\/|$)/.test(p)||/^\/api\/admin\/bank\/(?:vaults?|shared|loans?|swap|bridge)(?:\/|$)/.test(p);}
function blockedAction(action){return /^(?:bank\.(?:vaults?|shared|loans?)|swap(?:[-_.]bridge)?|bridge)(?:[./]|$)/i.test(String(action||''));}
function assertEnabled(feature){if(SUSPENDED.includes(feature))throw Error('BANK_FEATURE_SUSPENDED');}
module.exports={SUSPENDED,blockedPath,blockedAction,assertEnabled};
