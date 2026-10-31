'use strict';
// Public source/provider metadata must not expose operator endpoint credentials
// from a historical global feed configuration to ordinary users.
function url(value){try{const parsed=new URL(value);if(!['http:','https:'].includes(parsed.protocol))return value;parsed.username='';parsed.password='';for(const key of [...parsed.searchParams.keys()])if(/key|token|secret|passw|passwd|authorization|signature|credential|(?:^|_)sig$/i.test(key))parsed.searchParams.set(key,'[REDACTED]');return parsed.toString();}catch(_){return value;}}
function redact(value,key=''){
 if(value===null||value===undefined)return value;
 key=key.replace(/([a-z0-9])([A-Z])/g,'$1_$2').replace(/[-\s]/g,'_').toLowerCase();
 if(/(?:^|_)(?:password|secret|credentials?|authorization|api_?key|access_?token|bearer_?token|auth_?token|headers|cookies|token)(?:_|$)/i.test(key)&&!(typeof value==='boolean'&&/configured|present|enabled/i.test(key)))return '[REDACTED]';
 if(typeof value==='string'){if(key==='last_error')return value?'Erreur de collecte':value;if(key==='provider_config'){try{return JSON.stringify(redact(JSON.parse(value)));}catch(_){return null;}}return /^https?:\/\//i.test(value)?url(value):value;}
 if(Array.isArray(value))return value.map(x=>redact(x));
 if(typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,redact(v,k)]));
 return value;
}
module.exports={redact};
