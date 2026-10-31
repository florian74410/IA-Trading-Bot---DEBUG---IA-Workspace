# AI-Core multi-agents — Vue d'ensemble

**Version : 1.0 — conception figée.**

## Principe

Un framework commun comporte AgentManager, MemoryManager, CharacterEngine, SkillManager, PolicyEngine et AuditManager. Chaque agent dispose cependant de ses propres données, droits, identité et limites.

| Identifiant | Usage | État de cette version |
| --- | --- | --- |
| IATB-AGT-0001 | Agent développeur / Codex GEN-1 | Identifiant cible ; le workspace Codex est distinct |
| IATB-AGT-0002 | Futur Supervisor Trading | Réservé ; agent non créé dans ce jalon |

## Arborescence du code (cible)

```text
AI-Core/{AgentManager,MemoryManager,CharacterEngine,SkillManager,PolicyEngine,AuditManager}/
Agents/{templates,Development,Supervisor}/
App/Engines/Supervisor/{Core,Identity,Memory,Character,Skills,Connectors,Security,API,Config,Tests}/
```

## Arborescence des données (cible GEN-1)

```text
/var/lib/iatb-ai/
├── Agent-Registry.db
└── agents/
    └── IATB-AGT-XXXX/
        ├── Soul.md
        ├── Events.jsonl
        ├── Agent-Memory.db
        ├── Skills/
        └── snapshots/
```

Le registre central ne contient que les métadonnées d'identité. Les bases de mémoire des agents ne sont pas partagées. Les droits d'un agent ne se transmettent pas à un autre.

## Connectivité

ChatGPT ↔ GitHub existe via le connecteur ; GEN-1 peut accéder au dépôt en HTTPS. Une connexion directe entre cette conversation et GEN-1 reste à établir. L'installation locale de Codex CLI ne confère pas un accès SSH à ChatGPT.

[Retour à l'accueil](Home.md)
