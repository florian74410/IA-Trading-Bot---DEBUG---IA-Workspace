'use strict';
/* IA-TB Social Provider X.
   The X bearer token remains inside Core Vault.
   Fundamental reaches X only through Router CP/1 -> X Secret Gateway. */
var path=require('path'),PATHS=require('../../Core/Shared/paths'),CPClient=require('../../Core/Communication/cp1_client');
var CP=new CPClient({root:PATHS.ROOT,routerPort:+(process.env.ROUTER_PORT||8021),timeout:22000,maxBytes:2*1024*1024});
function config(feed){try{return JSON.parse(feed&&feed.provider_config||'{}')||{};}catch(e){throw new Error('X_PROVIDER_CONFIG_INVALID');}}
function requestBroker(feed,cfg,cb){var query=String(cfg.query||'').trim(),maxResults=Math.max(10,Math.min(100,+cfg.max_results||10)),started=Date.now();CP.request('x_gateway','x_gateway.search',{query:query,maxResults:maxResults},'evidence',function(e,o){if(e)return cb(e);o=o||{};var bytes=0;try{bytes=Buffer.byteLength(JSON.stringify(o),'utf8');}catch(x){}cb(null,o,bytes);});}
function clean(s){return String(s||'').replace(/\s+/g,' ').trim();}
function titleOf(text){var t=clean(text);if(!t)return'Publication X';var m=t.match(/^(.{20,220}?[.!?])(?:\s|$)/);return clean(m&&m[1]||t.slice(0,220));}
function collect(feed,cb){var cfg;try{cfg=config(feed);}catch(e){return cb(e);}if(String(feed&&feed.platform||'X').toUpperCase()!=='X')return cb(new Error('PROVIDER_NOT_IMPLEMENTED:SOCIAL_'+String(feed&&feed.platform||'UNKNOWN')));if(!String(cfg.query||'').trim())return cb(new Error('X_QUERY_REQUIRED'));requestBroker(feed,cfg,function(e,o,bytes){if(e)return cb(e);var data=Array.isArray(o.data)?o.data:[],users=Object.create(null),inc=o.includes&&Array.isArray(o.includes.users)?o.includes.users:[];inc.forEach(function(u){if(u&&u.id)users[String(u.id)]=u;});var items=[];data.forEach(function(x){if(!x||!x.id)return;var text=clean(x.text);if(!text)return;var u=users[String(x.author_id||'')]||{},username=String(u.username||'').replace(/^@/,'');items.push({externalId:String(x.id),url:username?'https://x.com/'+username+'/status/'+x.id:'https://x.com/i/web/status/'+x.id,title:titleOf(text),summary:text,author:username?'@'+username:(u.name||null),publishedAt:x.created_at||null,language:String(x.lang||cfg.language||'en').toLowerCase().split('-')[0]});});cb(null,{items:items,bytes:bytes||0,transport:'x-api-v2',meta:o.meta||{}});});}
module.exports={collect:collect};
