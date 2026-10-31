PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS engine_registry(engine TEXT PRIMARY KEY, revision INTEGER NOT NULL CHECK(revision>=0), updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS functions(
 engine TEXT NOT NULL, function_id TEXT NOT NULL, contract_json TEXT NOT NULL,
 contract_hash TEXT NOT NULL, revision INTEGER NOT NULL, updated_at TEXT NOT NULL,
 PRIMARY KEY(engine,function_id), FOREIGN KEY(engine) REFERENCES engine_registry(engine));
CREATE TABLE IF NOT EXISTS privileges(
 agent_serial TEXT NOT NULL, engine TEXT NOT NULL, function_id TEXT NOT NULL,
 decision TEXT NOT NULL CHECK(decision IN ('ALLOW','DENY')),
 contract_hash TEXT NOT NULL, updated_at TEXT NOT NULL,
 updated_by TEXT NOT NULL, PRIMARY KEY(agent_serial,engine,function_id),
 FOREIGN KEY(engine,function_id) REFERENCES functions(engine,function_id));
CREATE TABLE IF NOT EXISTS audit(
 id INTEGER PRIMARY KEY AUTOINCREMENT, occurred_at TEXT NOT NULL,
 actor TEXT NOT NULL, event TEXT NOT NULL, engine TEXT NOT NULL,
 function_id TEXT NOT NULL DEFAULT '', details TEXT NOT NULL DEFAULT '');
CREATE INDEX IF NOT EXISTS ix_functions_engine ON functions(engine);
CREATE INDEX IF NOT EXISTS ix_privileges_agent ON privileges(agent_serial);
