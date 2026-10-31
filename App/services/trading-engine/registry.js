"use strict";

const fs = require("fs");
const path = require("path");

const CATALOG = path.join(__dirname, "executor_catalog.json");

function readCatalog() {
  const raw = JSON.parse(fs.readFileSync(CATALOG, "utf8"));
  const rows = Array.isArray(raw.executors) ? raw.executors : [];
  return rows.filter(x => x && x.enabled !== false);
}

function safeModule(spec) {
  const mod = String(spec.module || "");
  if (!/^\.\/[A-Za-z0-9_./-]+$/.test(mod) || mod.includes("..")) {
    throw new Error("TRADING_EXECUTOR_MODULE_INVALID: " + String(spec.id || ""));
  }
  const abs = path.resolve(__dirname, mod);
  if (abs.indexOf(path.resolve(__dirname) + path.sep) !== 0) {
    throw new Error("TRADING_EXECUTOR_MODULE_FORBIDDEN: " + String(spec.id || ""));
  }
  const loaded = require(abs);
  const ctor = loaded[String(spec.export || "")];
  if (typeof ctor !== "function") {
    throw new Error("TRADING_EXECUTOR_EXPORT_INVALID: " + String(spec.id || ""));
  }
  return ctor;
}

function registerDefaultExecutors(engine) {
  const rows = readCatalog();
  rows.forEach(spec => {
    const id = String(spec.id || "").toUpperCase();
    if (!/^[A-Z][A-Z0-9_-]{1,31}$/.test(id)) {
      throw new Error("TRADING_EXECUTOR_ID_INVALID: " + id);
    }
    const Executor = safeModule(spec);
    engine.registerExecutor(id, new Executor(spec.options || {}));
  });
  return engine;
}

function executorCatalog() {
  return readCatalog().map(spec => ({
    id: String(spec.id || "").toUpperCase(),
    module: spec.module,
    export: spec.export,
    enabled: spec.enabled !== false
  }));
}

module.exports = { registerDefaultExecutors, executorCatalog };
