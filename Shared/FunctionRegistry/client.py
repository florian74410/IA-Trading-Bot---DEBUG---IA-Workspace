"""Reusable module for Router-connected Engines (not an Engine itself)."""
import json
import sqlite3
from pathlib import Path

class EngineFunctionRegistry:
    def __init__(self, db_path, engine):
        if not engine:
            raise ValueError("engine required")
        self.engine=engine
        self.db=sqlite3.connect(str(db_path))
        self.db.execute("PRAGMA journal_mode=WAL")
        self.db.executescript("""CREATE TABLE IF NOT EXISTS metadata(key TEXT PRIMARY KEY,value INTEGER NOT NULL);
          CREATE TABLE IF NOT EXISTS functions(function_id TEXT PRIMARY KEY,contract TEXT NOT NULL);
          CREATE TABLE IF NOT EXISTS outbox(revision INTEGER PRIMARY KEY,snapshot TEXT NOT NULL,delivered INTEGER NOT NULL DEFAULT 0);""")
        self.db.execute("INSERT OR IGNORE INTO metadata(key,value) VALUES('revision',0)")
        self.db.commit()

    def replace(self, contracts):
        """Atomic registry snapshot + durable outbox notification."""
        data={}
        for contract in contracts:
            if contract.get("engine")!=self.engine:
                raise ValueError("engine mismatch")
            fid=contract["function_id"]
            if fid in data: raise ValueError("duplicate function")
            data[fid]=contract
        with self.db:
            self.db.execute("DELETE FROM functions")
            self.db.executemany("INSERT INTO functions(function_id,contract) VALUES(?,?)",[(k,json.dumps(v,sort_keys=True)) for k,v in data.items()])
            revision=self.db.execute("SELECT value FROM metadata WHERE key='revision'").fetchone()[0]+1
            self.db.execute("UPDATE metadata SET value=? WHERE key='revision'",(revision,))
            self.db.execute("INSERT INTO outbox(revision,snapshot) VALUES(?,?)",(revision,json.dumps(list(data.values()),sort_keys=True)))
        return revision

    def pending(self):
        return [{"engine":self.engine,"revision":r,"functions":json.loads(data)} for r,data in self.db.execute("SELECT revision,snapshot FROM outbox WHERE delivered=0 ORDER BY revision")]

    def acknowledge(self,revision):
        with self.db:
            self.db.execute("UPDATE outbox SET delivered=1 WHERE revision=?",(revision,))
    def close(self):
        self.db.close()
