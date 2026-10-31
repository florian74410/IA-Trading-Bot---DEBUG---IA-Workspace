#!/usr/bin/env node
'use strict';

/**
 * P2.1 TEST FIXTURES ONLY — authenticated AES-256-GCM bundle.
 * No integration with real IA-TB data, service keys, wallet or running app.
 * Encryption key is ephemeral, provided by stdin, NEVER persisted.
 *
 * Usage: node Tools/CI/fixture_aead_bundle.js seal|open <fixture_root> <file>
 * stdin: 64 ASCII hex chars representing throwaway 256-bit test key.
 * seal file: <fixture_root>/_sealed/fixture-*.enc.json
 * open file: same location; decrypts into a new _snapshots/fixture-* folder.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const MARKER = '.iatb-auth-p21-fixture-only';
const MAGIC = 'IA-TB-P21-TEST-AEAD-1';
const SNAPFILES = [
  'data/Database/clients.sqlite',
  'data/User Data/default/user_data.db',
  'data/User Data/default/portfolio.db',
  'data/Security/client_master.key',
  'manifest.json'
];
const MAX_ONE = 10 * 1024 * 1024;
const MAX_BUNDLE = 32 * 1024 * 1024;

function refuse(message) { throw new Error(message); }
function secureDirectory(name) {
  const st = fs.lstatSync(name);
  if (!st.isDirectory() || st.isSymbolicLink() ||
      (st.mode & 0o777) !== 0o700 || st.uid !== process.getuid())
    refuse('FIXTURE_PRIVATE_DIRECTORY_REQUIRED');
}
function rootFixture(rootArg) {
  const root = path.resolve(rootArg);
  const temp = fs.realpathSync(os.tmpdir());
  if (!root.startsWith(temp + path.sep) || root === temp ||
      !path.basename(root).startsWith('iatb-p21-fixture-'))
    refuse('FIXTURE_SANDBOX_REQUIRED');
  if (fs.realpathSync(root) !== root) refuse('FIXTURE_SYMLINK_REFUSED');
  secureDirectory(root);
  const marker = path.join(root, MARKER);
  const st = fs.lstatSync(marker);
  if (!st.isFile() || st.isSymbolicLink() ||
      fs.readFileSync(marker, 'utf8') !== 'IA-TB-AUTH-P21-FIXTURE\n')
    refuse('FIXTURE_MARKER_REQUIRED');
  return root;
}
function underRoot(root, given) {
  const target = path.resolve(given);
  if (!target.startsWith(root + path.sep)) refuse('FIXTURE_PATH_OUTSIDE_ROOT');
  let cur = root;
  for (const component of path.relative(root, target).split(path.sep)) {
    cur = path.join(cur, component);
    if (fs.existsSync(cur) && fs.lstatSync(cur).isSymbolicLink())
      refuse('FIXTURE_SYMLINK_REFUSED');
  }
  return target;
}
function keyFromStdin() {
  const txt = fs.readFileSync(0, 'utf8').trim();
  if (!/^[a-fA-F0-9]{64}$/.test(txt)) refuse('FIXTURE_EPHEMERAL_KEY_REQUIRED');
  return Buffer.from(txt, 'hex');
}
function pack(root, fixtureDir) {
  const dir = underRoot(root, fixtureDir);
  if (path.dirname(dir) !== path.join(root, '_snapshots') ||
      !path.basename(dir).startsWith('fixture-'))
    refuse('FIXTURE_SNAPSHOT_ONLY');
  secureDirectory(dir);
  const files = Object.create(null);
  let total = 0;
  for (const relative of SNAPFILES) {
    const full = underRoot(root, path.join(dir, relative));
    const st = fs.lstatSync(full);
    if (!st.isFile() || st.isSymbolicLink() ||
        (st.mode & 0o777) !== 0o600) refuse('FIXTURE_FILE_NOT_PRIVATE');
    if (st.size > MAX_ONE) refuse('FIXTURE_FILE_TOO_LARGE');
    total += st.size;
    if (total > MAX_BUNDLE) refuse('FIXTURE_BUNDLE_TOO_LARGE');
    files[relative] = fs.readFileSync(full).toString('base64');
  }
  return Buffer.from(JSON.stringify({type:MAGIC, source:'TEST_ONLY',
                                     file_order:SNAPFILES, files}));
}
function createPrivateDir(root, name) {
  const d = underRoot(root, path.join(root, name));
  if (!fs.existsSync(d)) fs.mkdirSync(d, {mode:0o700});
  secureDirectory(d);
  return d;
}
function seal(root, snapshotDir, key) {
  const payload = pack(root, snapshotDir);
  if (payload.length > MAX_BUNDLE * 1.5) refuse('FIXTURE_BUNDLE_TOO_LARGE');
  const nonce = crypto.randomBytes(12);
  const id = crypto.randomUUID();
  const aad = Buffer.from(MAGIC + ':' + id, 'utf8');
  const cipher = crypto.createCipheriv('aes-256-gcm', key, nonce);
  cipher.setAAD(aad);
  const encrypted = Buffer.concat([cipher.update(payload), cipher.final()]);
  const tag = cipher.getAuthTag();
  const targetFolder = createPrivateDir(root, '_sealed');
  const output = underRoot(root, path.join(targetFolder, 'fixture-' + id + '.enc.json'));
  const body = {type:MAGIC, id, algorithm:'AES-256-GCM',
                nonce:nonce.toString('base64'), tag:tag.toString('base64'),
                ciphertext:encrypted.toString('base64')};
  fs.writeFileSync(output, JSON.stringify(body) + '\n', {mode:0o600, flag:'wx'});
  process.stdout.write(output + '\n');
}
function validatedPayload(contents) {
  let obj;
  try { obj = JSON.parse(contents.toString('utf8')); }
  catch { refuse('FIXTURE_DECRYPTED_PAYLOAD_INVALID'); }
  if (!obj || obj.type!==MAGIC || obj.source!=='TEST_ONLY' ||
      JSON.stringify(obj.file_order)!==JSON.stringify(SNAPFILES) ||
      !obj.files || typeof obj.files!=='object' ||
      JSON.stringify(Object.keys(obj.files))!==JSON.stringify(SNAPFILES))
    refuse('FIXTURE_FILES_NOT_ALLOWLISTED');
  const result=[];
  let size=0;
  for (const file of SNAPFILES) {
    const base64 = obj.files[file];
    if (typeof base64!=='string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64))
      refuse('FIXTURE_PAYLOAD_INVALID_BASE64');
    const bytes = Buffer.from(base64, 'base64');
    if (bytes.length > MAX_ONE) refuse('FIXTURE_FILE_TOO_LARGE');
    size += bytes.length;
    if (size > MAX_BUNDLE) refuse('FIXTURE_BUNDLE_TOO_LARGE');
    result.push([file,bytes]);
  }
  return result;
}
function open(root, file, key) {
  const source = underRoot(root, file);
  if (path.dirname(source)!==path.join(root,'_sealed') ||
      !/^fixture-[a-f0-9-]+\.enc\.json$/.test(path.basename(source)))
    refuse('FIXTURE_ARCHIVE_PATH_REFUSED');
  const st=fs.lstatSync(source);
  if (!st.isFile() || (st.mode&0o777)!==0o600 || st.size>MAX_BUNDLE*2)
    refuse('FIXTURE_ARCHIVE_INVALID');
  const wrapped=JSON.parse(fs.readFileSync(source,'utf8'));
  if (wrapped.type!==MAGIC || wrapped.algorithm!=='AES-256-GCM' ||
      !/^[a-f0-9-]{36}$/.test(wrapped.id) ||
      path.basename(source)!=='fixture-'+wrapped.id+'.enc.json')
    refuse('FIXTURE_ARCHIVE_HEADER_INVALID');
  const nonce=Buffer.from(wrapped.nonce,'base64');
  const tag=Buffer.from(wrapped.tag,'base64');
  if (nonce.length!==12 || tag.length!==16) refuse('FIXTURE_NONCE_OR_TAG_INVALID');
  const ciphertext=Buffer.from(wrapped.ciphertext,'base64');
  const dec=crypto.createDecipheriv('aes-256-gcm',key,nonce);
  dec.setAAD(Buffer.from(MAGIC+':'+wrapped.id));
  dec.setAuthTag(tag);
  let payload;
  try { payload=Buffer.concat([dec.update(ciphertext),dec.final()]); }
  catch { refuse('FIXTURE_AEAD_AUTH_FAILED'); }
  const entries=validatedPayload(payload);
  const targetFolder=createPrivateDir(root,'_snapshots');
  const result=path.join(targetFolder,'fixture-'+crypto.randomUUID());
  fs.mkdirSync(result,{mode:0o700});
  let done=false;
  try {
    for (const [relative,bytes] of entries) {
      const full=underRoot(root,path.join(result,relative));
      fs.mkdirSync(path.dirname(full),{mode:0o700,recursive:true});
      fs.writeFileSync(full,bytes,{mode:0o600,flag:'wx'});
    }
    done=true;
    process.stdout.write(result+'\n');
  } finally {
    if (!done) fs.rmSync(result,{recursive:true,force:true});
  }
}
function main(argv) {
  if (argv.length!==3 || !['seal','open'].includes(argv[0]))
    refuse('USAGE: seal|open fixture_root path');
  const root=rootFixture(argv[1]);
  const target=underRoot(root,argv[2]);
  const key=keyFromStdin();
  if (argv[0]==='seal') seal(root,target,key);
  else open(root,target,key);
}
try { main(process.argv.slice(2)); }
catch(e) { console.error('[FAIL] '+e.message); process.exitCode=1; }
