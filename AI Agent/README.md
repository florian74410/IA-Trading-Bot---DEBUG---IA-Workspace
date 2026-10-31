# IA-TB — AI Agent v0.3 (Admin Panel isolé)

Branche : `work/ai-agent-admin-v0.3` — évolution de `work/ai-agent-v0.2`.

> **IMPORTANT : NON DÉPLOYÉ, NON AUTONOME.**
> Ce dépôt public contient du code source, un catalogue de capacités et une
> **maquette locale**. Il ne contient pas de secrets ni d'autorité de permission.
> Aucun droit SSH/Docker, aucun accès RELEASE et aucun trading LIVE ne sont accordés.

## Ce qui fonctionne dans le code de cette branche

- `Memory/General/` : base v0.1 conservée, table et triggers append-only inchangés.
- `Engine/MemoryManager/manager.py` : façade `init,append,search,get,stats,correct,export`.
- `Memory/Episodic|Project|Procedural|Config` : définitions de classement et contraintes.
- `Soul/` : identité v0.1 préservée; personnalité, objectifs et comportement v0.2.
- `Skills/` : six manifestes versionnés, permissions nécessaires et validateur de catalogue
  `Engine/SkillLoader/loader.py`. Ils **n'exécutent pas** leurs actions.
- `Rules/Authorized/permissions.json` : souhaits déclaratifs, jamais des privilèges.
- `Rules/Non-Authorized/denied.json` : interdictions HARD_DENY et RESTRICTED.
- `Engine/PolicyEngine/policy.py` : refus par défaut, rejet des chemins suspects,
  précédence HARD_DENY, contrôle d'une autorité injectée indépendante (refus par défaut).
  Même une décision `ALLOW` de ce moteur est `executable=false`.
- `Engine/PermissionManager/requests.py` : file SQLite privée pour les demandes
  RESTRICTED prédéfinies, décision administrative via vérificateur externe injecté,
  expiration/rejet/révocation. **Un état APPROVED n'accorde aucun droit technique.**
- `Audit/` : base d'audit distincte append-only avec traces structurées.
- `AdminPanel/` : interface **IA-TB Admin** dédiée, styles propres, filtres et vues en lecture seule ; serveur Python limité à `127.0.0.1` avec authentification ADMIN distincte. Aucun accès à un programme local de monitoring.
- `Tests/test_agent_v02.py` : tests sans accès réseau ou VPS.

## Matrice d'avancement

| Phase | État réel | Restant |
|---|---|---|
| A — Architecture et mémoire | Partiellement implémentée | Rétention, sauvegardes, migration/stockage protégé hôte |
| B — Permissions | Socle implémenté | Schémas JSON complets, adaptation au contrôleur réel |
| C — Demandes administratives | File locale prototype | Signature d'approbations, quota atomique, délégation permanente et révocation au contrôleur |
| D — Skills | Manifests et catalogue | Interfaces exécutables limitées + tests de gateway |
| E — Admin Panel | UI native IA-TB + API GET authentifiée (prototype) | Revue sécurité, déploiement local sous SSH et autorité d'approbation indépendante |
| F — GEN-1 | Non commencé | Contrôle des comptes Linux, chaîne CI→SSH→contrôleur→santé, rollback contrôlé |

Le chemin autorisé de la base SQLite mémoire est défini par
`IATB_AGENT_MEMORY_DB` (chemin absolu, répertoire privé, hors Git).
Les bases d'audit et de demandes sont également stockées hors dépôt.

## Exécution des tests

À la racine du dépôt :

```bash
python3 -m py_compile 'AI Agent/Memory/General/journal.py' \
  'AI Agent/Engine/PolicyEngine/policy.py' \
  'AI Agent/Engine/PermissionManager/requests.py' \
  'AI Agent/Engine/MemoryManager/manager.py' \
  'AI Agent/Engine/SkillLoader/loader.py' \
  'AI Agent/Audit/audit.py'
python3 -m unittest discover -s 'AI Agent/Tests' -p 'test_*.py' -v
```

`AdminPanel/index.html` peut être ouvert localement dans un navigateur (prévisualisation);
aucune requête réseau ni commande administrative n'en part.

## Frontières de confiance

1. Le LLM et ses mémoires n'ont aucun rôle d'autorité.
2. Le Git public versionne les politiques candidates; il ne signe aucun grant.
3. Une autorité d'administration indépendante doit vérifier identité et portée,
   puis la passerelle technique *doit revalider* chaque opération à l'exécution.
4. Les approbations ne doivent jamais être signées depuis une interface/script
   modifiable par l'agent.
5. Ne jamais accorder un sudo générique, un shell arbitraire, l'accès au socket Docker
   ou un contrôle des secrets/volumes RELEASE.
6. Une CI réussie ne démontre ni déploiement ni santé HTTP en situation réelle.

Ce jalon **ne déclenche aucun déploiement** : le DEBUG reste fermé jusqu'à
une recette complète de la chaîne sécurisée.
