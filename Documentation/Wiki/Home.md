# IA-TB — Wiki technique (sources versionnées)

Bienvenue dans la documentation **IA-TB AI-Core Multi-Agent v1.0**.

> État : architecture validée et schémas SQLite versionnés sur la branche `work/ai-core-multi-agent-v1.0`. Il s'agit d'un **wiki prêt à publier**, hébergé dans le dépôt source ; il n'est pas encore synchronisé avec le Wiki GitHub indépendant.

## Sommaire

- [Vue d'ensemble multi-agents](AI-Core-Multi-Agent.md)
- [Mémoire SQLite et statistiques](Agent-Memory-SQLite.md)
- [Identité Soul et évolution du caractère](Soul-et-Evolution.md)
- [Supervisor Engine : intégration envisagée](Supervisor-Integration.md)
- [Référence architecturale](../../AI-Core/ARCHITECTURE_V1.md)
- [Schéma de mémoire](../../AI-Core/database/agent_memory.schema.sql)
- [Schéma de registre](../../AI-Core/database/agent_registry.schema.sql)

## Frontière entre développement et production

Le code et les schémas sont un **jalon de conception**. Ne pas déployer le Supervisor existant, modifier RELEASE, les règles Caddy, les volumes ou les secrets de GEN-1 à partir de ces documents. L'Admin Panel v1 expérimental est distinct de cette architecture.
