'use strict';
// Explicit one-time, offline creation of a new isolated DEBUG identity store.
// Must run BEFORE user-management migration and before starting Core.
// Does not import users from RELEASE and never overwrites an existing key.
const fs=require('node:fs'),path=require('node:path');
const ClientCrypto=require('../Core/Clients/client_crypto');
const ClientRepository=require('../Core/Clients/client_repository');
const root=process.env.IATB_DATA_ROOT;
if(root!=='/debug-private/data')throw Error('DEBUG_DATA_ROOT_REQUIRED');
const db=path.join(root,'Database','clients.sqlite');
const key=path.join(root,'Security','client_master.key');
if(fs.existsSync(db)&&!fs.existsSync(key))throw Error('REFUSE_REPLACE_MISSING_CLIENT_KEY');
new ClientCrypto(key,{clientDbPath:db});
const repo=new ClientRepository({
 dbPath:db,
 migrationsDir:path.join(__dirname,'../Core/Clients/migrations')
});
repo.assertReady();
repo.close();
console.log('DEBUG fresh identity store prepared; no accounts copied.');
