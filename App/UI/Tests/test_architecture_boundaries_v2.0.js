'use strict';
var fs=require('fs'),path=require('path'),assert=require('assert');
var ROOT=path.resolve(__dirname,'../..');
function walk(dir,out){out=out||[];fs.readdirSync(dir).forEach(function(n){var p=path.join(dir,n),s=fs.statSync(p);if(s.isDirectory())walk(p,out);else if(/\.(js|html)$/.test(n))out.push(p);});return out;}
var files=walk(path.join(ROOT,'Frontend')),forbidden=['/indicator-api','/portfolio-api','/liquidity-data','/fundamental-api','/firewall-events','/kraken-api','/api/gmx/','/api/market/symbols','/api/klines','/api/market/klines','/api/crypto/catalog','/api/crypto/resolve','/api/wallet-asset-price','/api/wallet-prices','/api/strategies'];
files.forEach(function(p){var c=fs.readFileSync(p,'utf8');forbidden.forEach(function(x){assert(c.indexOf(x)<0,path.relative(ROOT,p)+' still references legacy boundary '+x);});});
var router=fs.readFileSync(path.join(ROOT,'Core/Router/router.js'),'utf8');
assert(router.indexOf('/communication/v1/ui/read')>=0,'UI read CP/1 channel missing');
assert(router.indexOf('/communication/v1/ui/write')>=0,'UI write CP/1 channel missing');
var app=fs.readFileSync(path.join(ROOT,'Frontend/Pages/app_v1.0.html'),'utf8');
var dash=fs.readFileSync(path.join(ROOT,'Frontend/JS/trading_dashboard_v2.0.js'),'utf8');
var gateway=fs.readFileSync(path.join(ROOT,'UI/Gateway/ui_service.js'),'utf8');
assert(app.indexOf('id="gmxPanel"')<0,'hidden legacy GMX panel returned');
assert(app.indexOf('gmxTimer')<0,'legacy GMX polling timer returned');
assert(dash.indexOf("fetch('/router-health'")>=0,'Trading dashboard must use real Router health');
assert(dash.indexOf("fetch('/api/status'")<0,'Trading dashboard must not infer Engine health from Core status');
assert(gateway.indexOf("p==='/router-health'")>=0,'UI Gateway Router health contract missing');
console.log('[ARCH-BOUNDARIES] OK v2.0');
