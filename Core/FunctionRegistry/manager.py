"""Core-owned Function Registry Manager v1.1. Not a new Engine.

An authenticated Router gateway must provide caller identity and enforce the
result independently; this module never calls trading functions or grants itself
privileges. Registry data is descriptive, never executable code.
"""
import hashlib
import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

def utc_now():
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00","Z")

def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",",":"), ensure_ascii=False)

def digest(value):
    return hashlib.sha256(canonical(value).encode("utf-8")).hexdigest()

class FunctionRegistryManager:
    def __init__(self, db_path):
        self.path = Path(db_path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(str(self.path), timeout=10)
        self.db.row_factory = sqlite3.Row
        self.db.execute("PRAGMA foreign_keys=ON")
        self.db.execute("PRAGMA journal_mode=WAL")
        self.db.execute("PRAGMA busy_timeout=10000")
        self.db.executescript(Path(__file__).with_name("schema.sql").read_text(encoding="utf-8"))

    def close(self):
        self.db.close()

    def sync(self, engine, revision, functions, actor="router:verified"):
        """Full snapshot. Ignore stale revisions; revoke grants if contract changes."""
        if not isinstance(engine,str) or not engine or not engine.replace("_","").replace("-","").isalnum():
            raise ValueError("invalid engine")
        if not isinstance(revision,int) or isinstance(revision,bool) or revision < 1:
            raise ValueError("invalid revision")
        if not isinstance(functions,list) or len(functions)>1000:
            raise ValueError("invalid snapshot")
        seen=set()
        contracts={}
        for item in functions:
            if not isinstance(item,dict) or item.get("engine")!=engine:
                raise ValueError("engine mismatch")
            fid=item.get("function_id")
            if not isinstance(fid,str) or not fid or len(fid)>160 or not all(c.isalnum() or c in "._-" for c in fid):
                raise ValueError("invalid function id")
            if fid in seen:
                raise ValueError("duplicate function")
            if item.get("risk") not in ("LOW","MEDIUM","HIGH","CRITICAL"):
                raise ValueError("invalid risk")
            if not isinstance(item.get("arguments"),dict) or not isinstance(item.get("returns"),dict):
                raise ValueError("invalid contract")
            seen.add(fid)
            contracts[fid]=item
        now=utc_now()
        with self.db:
            row=self.db.execute("SELECT revision FROM engine_registry WHERE engine=?",(engine,)).fetchone()
            if row and revision<=row["revision"]:
                return {"status":"STALE","revision":row["revision"]}
            self.db.execute("INSERT INTO engine_registry(engine,revision,updated_at) VALUES(?,?,?) ON CONFLICT(engine) DO UPDATE SET revision=excluded.revision,updated_at=excluded.updated_at",(engine,revision,now))
            for fid,item in contracts.items():
                h=digest(item)
                old=self.db.execute("SELECT contract_hash FROM functions WHERE engine=? AND function_id=?",(engine,fid)).fetchone()
                self.db.execute("INSERT INTO functions(engine,function_id,contract_json,contract_hash,revision,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(engine,function_id) DO UPDATE SET contract_json=excluded.contract_json,contract_hash=excluded.contract_hash,revision=excluded.revision,updated_at=excluded.updated_at",(engine,fid,canonical(item),h,revision,now))
                if old and old["contract_hash"]!=h:
                    self.db.execute("DELETE FROM privileges WHERE engine=? AND function_id=?",(engine,fid))
            previous=[v["function_id"] for v in self.db.execute("SELECT function_id FROM functions WHERE engine=?",(engine,))]
            for fid in previous:
                if fid not in contracts:
                    self.db.execute("DELETE FROM privileges WHERE engine=? AND function_id=?",(engine,fid))
                    self.db.execute("DELETE FROM functions WHERE engine=? AND function_id=?",(engine,fid))
            self.db.execute("INSERT INTO audit(occurred_at,actor,event,engine,details) VALUES(?,?,?,?,?)",(now,actor,"REGISTRY_SYNC",engine,canonical({"revision":revision,"count":len(contracts)})))
        return {"status":"APPLIED","revision":revision,"count":len(contracts)}

    def set_privilege(self, agent_serial, engine, function_id, decision, actor, approved=False):
        """Called ONLY by independently authenticated ADMIN gateway."""
        if not actor or not approved:
            raise PermissionError("verified admin approval required")
        if decision not in ("ALLOW","DENY"):
            raise ValueError("invalid decision")
        with self.db:
            row=self.db.execute("SELECT contract_hash,contract_json FROM functions WHERE engine=? AND function_id=?",(engine,function_id)).fetchone()
            if not row:
                raise KeyError("unknown function")
            contract=json.loads(row["contract_json"])
            if contract.get("hard_deny") and decision=="ALLOW":
                raise PermissionError("hard deny")
            if contract["risk"] in ("HIGH","CRITICAL") and decision=="ALLOW":
                raise PermissionError("sensitive privileges require separate approval workflow")
            now=utc_now()
            self.db.execute("INSERT INTO privileges(agent_serial,engine,function_id,decision,contract_hash,updated_at,updated_by) VALUES(?,?,?,?,?,?,?) ON CONFLICT(agent_serial,engine,function_id) DO UPDATE SET decision=excluded.decision,contract_hash=excluded.contract_hash,updated_at=excluded.updated_at,updated_by=excluded.updated_by",(agent_serial,engine,function_id,decision,row["contract_hash"],now,actor))
            self.db.execute("INSERT INTO audit(occurred_at,actor,event,engine,function_id,details) VALUES(?,?,?,?,?,?)",(now,actor,"PRIVILEGE_CHANGE",engine,function_id,canonical({"agent":agent_serial,"decision":decision})))

    def view(self, agent_serial):
        rows=self.db.execute("""SELECT f.engine,f.function_id,f.contract_json,f.contract_hash,
          p.decision,p.contract_hash AS approved_hash FROM functions f
          LEFT JOIN privileges p ON p.engine=f.engine AND p.function_id=f.function_id AND p.agent_serial=?
          ORDER BY f.engine,f.function_id""",(agent_serial,)).fetchall()
        result=[]
        for row in rows:
            contract=json.loads(row["contract_json"])
            effective="ALLOW" if row["decision"]=="ALLOW" and row["approved_hash"]==row["contract_hash"] and not contract.get("hard_deny") else "DENY"
            result.append({"engine":row["engine"],"function_id":row["function_id"],"contract":contract,"decision":effective})
        return {"agent_serial":agent_serial,"functions":result,"generated_at":utc_now()}

    def authorized(self, agent_serial, engine, function_id):
        """Defence-in-depth lookup. Router and Engine must recheck via trusted gateway."""
        return any(f["engine"]==engine and f["function_id"]==function_id and f["decision"]=="ALLOW" for f in self.view(agent_serial)["functions"])
