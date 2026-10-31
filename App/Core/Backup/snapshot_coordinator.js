'use strict';
/* IA-TB Auth P2.2 — isolated coordinator primitive (NOT wired to runtime).
 * This module does not access disks, databases, wallets, network or secrets.
 * A participant must block NEW writes before it returns a QUIESCED ACK, and
 * must invalidate an epoch on RELEASE/ABORT, including if a prepare finishes late.
 * This primitive alone DOES NOT guarantee inter-service consistency.
 */

class SnapshotCoordinator {
  constructor({ writerIds, timeoutMs = 3000 } = {}) {
    if (!Array.isArray(writerIds) || !writerIds.length ||
        writerIds.some(id => typeof id !== 'string' || !/^[a-z0-9][a-z0-9._-]*$/i.test(id)) ||
        new Set(writerIds).size !== writerIds.length) {
      throw new Error('SNAPSHOT_INVALID_WRITER_ALLOWLIST');
    }
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60000) {
      throw new Error('SNAPSHOT_INVALID_TIMEOUT');
    }
    this.writerIds = [...writerIds];
    this.timeoutMs = timeoutMs;
    this.writers = new Map();
    this.state = 'IDLE';
    this.epoch = 0;
    this.pendingCleanup = null;
  }

  register(id, hooks) {
    if (this.state !== 'IDLE') throw new Error('SNAPSHOT_COORDINATOR_BUSY');
    if (!this.writerIds.includes(id)) throw new Error('SNAPSHOT_UNKNOWN_WRITER');
    if (this.writers.has(id)) throw new Error('SNAPSHOT_DUPLICATE_WRITER');
    if (!hooks || ['prepare', 'release', 'abort'].some(key => typeof hooks[key] !== 'function')) {
      throw new Error('SNAPSHOT_INVALID_HOOKS');
    }
    this.writers.set(id, hooks);
  }

  unregister(id) {
    if (this.state !== 'IDLE') throw new Error('SNAPSHOT_COORDINATOR_BUSY');
    this.writers.delete(id);
  }

  async withTimeout(action) {
    let timer;
    try {
      return await Promise.race([
        Promise.resolve().then(action),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('SNAPSHOT_ACK_TIMEOUT')), this.timeoutMs);
        })
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  async execute(capture) {
    if (this.state !== 'IDLE') throw new Error('SNAPSHOT_COORDINATOR_BUSY');
    if (typeof capture !== 'function') throw new Error('SNAPSHOT_INVALID_CAPTURE');
    if (this.writerIds.some(id => !this.writers.has(id))) throw new Error('SNAPSHOT_WRITER_MISSING');

    this.state = 'PREPARING';
    const epoch = ++this.epoch;
    const visited = [];
    let error = null;
    let result;
    try {
      // Serial ACKs are deliberate here: simple, bounded and infrequent.
      // The caller does not receive permission to capture before ALL ACKs.
      for (const id of this.writerIds) {
        const hooks = this.writers.get(id);
        visited.push({ id, hooks });
        const ack = await this.withTimeout(() => hooks.prepare(epoch));
        if (!ack || ack.epoch !== epoch || ack.writerId !== id || ack.pending !== 0) {
          throw new Error('SNAPSHOT_INVALID_ACK');
        }
      }
      this.state = 'QUIESCED';
      result = await capture({ epoch });
    } catch (e) {
      error = e;
    }

    this.state = error ? 'ABORTING' : 'RELEASING';
    // Always signal all visited writers, including the one whose prepare failed.
    // A late prepare must ignore an already-aborted generation.
    const failures = [], failureCodes = Object.create(null);
    for (const { id, hooks } of visited.reverse()) {
      try {
        const cleanup=() => error ? hooks.abort(epoch) : hooks.release(epoch);
        try {
          await this.withTimeout(cleanup);
        } catch (transient) {
          // A lost HTTP ACK is not evidence that the durable gate was
          // released. Retry only transport errors, and only the SAME epoch.
          // Any semantic rejection still requires explicit BLOCKED recovery.
          const code=String(transient&&transient.code||'');
          const msg=String(transient&&transient.message||'');
          if(!['ECONNRESET','EPIPE','ETIMEDOUT'].includes(code)&&
             !/^SNAPSHOT_REMOTE_TIMEOUT$/.test(msg)&&
             !/^(socket hang up|read ECONNRESET)$/.test(msg))throw transient;
          await this.withTimeout(cleanup);
        }
      } catch (err) {
        failures.push(id);
        const code=String(err&&err.message||'SNAPSHOT_UNKNOWN_ERROR');
        failureCodes[id]=/^[A-Za-z0-9_:-]{1,150}$/.test(code)?code:code.replace(/[^A-Za-z0-9_:-]/g,'_').slice(0,150);
      }
    }
    if (failures.length) {
      // No new capture until every failed participant has confirmed cleanup.
      this.pendingCleanup = {epoch, failedIds: failures, abort: !!error, failureCodes};
      this.state = 'BLOCKED';
      throw new Error('SNAPSHOT_CLEANUP_FAILED');
    }
    this.state = 'IDLE';
    if (error) throw error;
    return result;
  }
  // Explicit recovery is safe only after the same epoch is cleared by every
  // failed participant. Never reset a BLOCKED coordinator on a timer/restart.
  async recoverBlocked() {
    if (this.state !== 'BLOCKED' || !this.pendingCleanup)
      throw new Error('SNAPSHOT_NOT_BLOCKED');
    const pending = this.pendingCleanup;
    const stillFailed = [];
    for (const id of pending.failedIds) {
      const hooks = this.writers.get(id);
      try {
        await this.withTimeout(() => pending.abort ? hooks.abort(pending.epoch) : hooks.release(pending.epoch));
      } catch (_) { stillFailed.push(id); }
    }
    if (stillFailed.length) {
      pending.failedIds = stillFailed;
      throw new Error('SNAPSHOT_RECOVERY_INCOMPLETE');
    }
    this.pendingCleanup = null;
    this.state = 'IDLE';
    return {recovered:true, epoch:pending.epoch};
  }

}

/* Core-local adapter. Opt-in only: no live service registers it yet.
 * The Core stores are synchronous: PREPARE executes after their current JS
 * mutation finishes and stops subsequent SQL entry points until RELEASE/ABORT.
 * Cross-process writers, file copies and snapshot packaging remain out of scope.
 */
class LocalSnapshotWriter {
  constructor(writerId) {
    if (typeof writerId !== 'string' || !/^[a-z0-9][a-z0-9._-]*$/i.test(writerId)) {
      throw new Error('SNAPSHOT_INVALID_WRITER_ID');
    }
    this.writerId = writerId;
    this.heldEpoch = null;
    this.lastEpoch = 0;
  }

  assertWritable() {
    if (this.heldEpoch !== null) throw new Error('SNAPSHOT_WRITE_QUIESCED');
  }

  prepare(epoch) {
    if (!Number.isSafeInteger(epoch) || epoch < 1 ||
        epoch <= this.lastEpoch || this.heldEpoch !== null) {
      throw new Error('SNAPSHOT_STALE_OR_BUSY_EPOCH');
    }
    this.lastEpoch = epoch;
    this.heldEpoch = epoch;
    return { epoch, writerId: this.writerId, pending: 0 };
  }

  release(epoch) {
    // A persisted RELEASE may lose its HTTP ACK. Retrying the exact last
    // generation must be safe; any older/future generation remains denied.
    if(this.heldEpoch===null&&this.lastEpoch===epoch)return;
    if (this.heldEpoch !== epoch) throw new Error('SNAPSHOT_EPOCH_MISMATCH');
    this.heldEpoch = null;
  }

  abort(epoch) {
    if (this.heldEpoch === epoch) {
      this.heldEpoch = null;
      return;
    }
    // Idempotent cleanup is only safe for this exact latest generation.
    if (this.heldEpoch !== null || epoch !== this.lastEpoch) {
      throw new Error('SNAPSHOT_EPOCH_MISMATCH');
    }
  }
}

module.exports = { SnapshotCoordinator, LocalSnapshotWriter };
