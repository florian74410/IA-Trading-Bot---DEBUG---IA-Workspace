'use strict';
/* IA-TB Auth 2.1 — OFFLINE password verifier / KDF adapter.
 * Opt-in only. Never imports Core runtime, databases or client key material.
 * No implicit credential writes, privilege assignments, or password resets.
 */
const crypto = require('node:crypto');
const { promisify } = require('node:util');
const pbkdf2 = promisify(crypto.pbkdf2);

// Conservative initial policy, provisional until CPU/memory calibration on GEN-1.
// 64 MiB, 3 passes, 1 lane. Only run on login/create/change, never on market ticks.
const ARGON2_POLICY = Object.freeze({
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 1,
  hashLength: 32
});
const MAX_PASSWORD_BYTES = 1024;
const LEGACY_ALGO = 'PBKDF2_SHA256';
const NEW_ALGO = 'ARGON2ID';

function loadNative() {
  let native;
  try { native = require('argon2'); } catch (_) {
    throw new Error('AUTH_ARGON2_MODULE_UNAVAILABLE');
  }
  if (!native || typeof native.hash !== 'function' ||
      typeof native.verify !== 'function' || native.argon2id === undefined) {
    throw new Error('AUTH_ARGON2_MODULE_UNAVAILABLE');
  }
  return native;
}

function safePassword(password) {
  return typeof password === 'string' &&
    Buffer.byteLength(password, 'utf8') > 0 &&
    Buffer.byteLength(password, 'utf8') <= MAX_PASSWORD_BYTES;
}

function canCreatePassword(password) {
  return safePassword(password) && password.length >= 10;
}

function algorithmOf(account) {
  const alg = account && account.passwordAlgo;
  return alg == null || alg === '' ? LEGACY_ALGO : String(alg).toUpperCase();
}

function validLegacy(account) {
  if (!account || !/^[0-9a-f]{64}$/i.test(String(account.passwordHash || ''))) return false;
  const salt = account.passwordSalt;
  const iters = Number(account.passwordIterations);
  return typeof salt === 'string' && salt.length >= 16 && salt.length <= 128 &&
    Number.isSafeInteger(iters) && iters >= 10000 && iters <= 2000000;
}

function parseArgon2Cost(encoded) {
  if (typeof encoded !== 'string' || encoded.length > 512 || encoded.length < 50) return null;
  // Accept only PHC Argon2id version 19 and the expected fields.
  const m = /^\$argon2id\$v=19\$([^$]{1,80})\$[A-Za-z0-9+/]{11,}\$[A-Za-z0-9+/]{20,}$/.exec(encoded);
  if (!m) return null;
  // Different native Argon2 providers serialize m/t/p in different orders.
  // Accept only these exact three unique parameter names, no extras.
  const fields = m[1].split(',');
  if (fields.length !== 3) return null;
  const params = Object.create(null);
  for (const field of fields) {
    const pair = /^(m|t|p)=(\d+)$/.exec(field);
    if (!pair || Object.hasOwn(params,pair[1])) return null;
    params[pair[1]] = Number(pair[2]);
  }
  if (!Object.hasOwn(params,'m') || !Object.hasOwn(params,'t') || !Object.hasOwn(params,'p')) return null;
  const memory = params.m,time = params.t,parallel = params.p;
  // Bound resource costs so a corrupted database row cannot cause memory/CPU DoS.
  if (!Number.isSafeInteger(memory) || memory < 19456 || memory > 131072 ||
      !Number.isSafeInteger(time) || time < 2 || time > 6 ||
      !Number.isSafeInteger(parallel) || parallel < 1 || parallel > 4) return null;
  return {memoryCost:memory,timeCost:time,parallelism:parallel};
}

function failure() {
  return {verified:false, algorithm:null, needsUpgrade:false};
}

/** Generate an Argon2id PHC hash for a NEW password, without touching storage. */
async function hashNewPassword(password) {
  if (!canCreatePassword(password)) throw new Error('AUTH_PASSWORD_LENGTH_INVALID');
  const native = loadNative();
  return native.hash(password, {type:native.argon2id, ...ARGON2_POLICY});
}

/** Pure verifier. PBKDF2 legacy is accepted, but never silently rewritten.
 * Callers MUST gate login on result.verified; on legacy success they may later
 * schedule an explicitly version-checked, transactional rehash migration.
 */
async function verifyAccountPassword(account, password) {
  if (!account || account.enabled === false || account.enabled === 0 ||
      account.enabled === '0' ||
      (account.status !== undefined && account.status !== 'ACTIVE') ||
      !safePassword(password)) return failure();
  const alg = algorithmOf(account);
  if (alg === LEGACY_ALGO) {
    if (!validLegacy(account)) return failure();
    const expected = Buffer.from(account.passwordHash, 'hex');
    const candidate = await pbkdf2(password, account.passwordSalt, Number(account.passwordIterations), 32, 'sha256');
    const ok = expected.length === candidate.length && crypto.timingSafeEqual(expected,candidate);
    return ok ? {verified:true, algorithm:LEGACY_ALGO, needsUpgrade:true} : failure();
  }
  if (alg !== NEW_ALGO) return failure();
  const params = parseArgon2Cost(account.passwordHash);
  if (!params) return failure();
  const native = loadNative();
  let ok=false;
  try{ok=await native.verify(account.passwordHash,password);}catch(_){return failure();}
  if (!ok) return failure();
  return {
    verified:true,
    algorithm:NEW_ALGO,
    needsUpgrade:params.memoryCost < ARGON2_POLICY.memoryCost ||
      params.timeCost < ARGON2_POLICY.timeCost || params.parallelism !== ARGON2_POLICY.parallelism
  };
}

module.exports = {
  ARGON2_POLICY, LEGACY_ALGO, NEW_ALGO,
  hashNewPassword, verifyAccountPassword, parseArgon2Cost
};
