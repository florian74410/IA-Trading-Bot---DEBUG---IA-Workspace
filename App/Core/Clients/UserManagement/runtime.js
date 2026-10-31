'use strict';
const crypto=require('node:crypto'),fs=require('node:fs'),Database=require('better-sqlite3');
const {UserStore}=require('./store'),{createHandler}=require('./http');
function open({paths,clientCrypto,config,configurationFor,aiRequest,recordUsage,personalSettings,walletAccess}){
 const file=paths.PersistentData.clientDb,st=fs.lstatSync(file);
 if(!st.isFile()||st.isSymbolicLink()||(st.mode&0o077))throw Error('AUTH_DB_PERMISSIONS');
 const db=new Database(file,{fileMustExist:true});db.pragma('foreign_keys=ON');db.pragma('busy_timeout=5000');
 try{const sessions=new UserStore({db,clientCrypto});const tradingVault=new (require('./trading_vault').TradingVault)({sessions,walletAccess});const bridge=require('./cp_bridge').createBridge({root:paths.ROOT,sessions,configurationFor,tradingVault,routerPort:+process.env.ROUTER_PORT||8021});const secret=crypto.createHmac('sha256',clientCrypto.master).update('Auth21 browser v1').digest();const aiTransport=require('./owner_ai').transport({sessions,request:aiRequest,recordUsage,personalSettings});const tradingAdmin=require('../auth21_trading_admin_bridge').createAuthenticatedDispatcher({sessions,env:process.env,port:+process.env.IATB_FIREWALL_PORT||8017});return {sessions,bridge,tradingVault,handler:createHandler({sessions,secret,origin:config.origin,bridge,aiTransport,personalSettings,tradingAdmin,tradingVault}),close(){db.close()}};}catch(e){db.close();throw e;}
}
module.exports={open};
