# IA-TB — DEBUG IA Workspace

## 🧠 AI-Core multi-agents — documentation v1.0

La nouvelle architecture validée est versionnée sur `work/ai-core-multi-agent-v1.0`.
Consulter le [sommaire du wiki technique](Documentation/Wiki/Home.md) et la
[référence d'architecture](AI-Core/ARCHITECTURE_V1.md).

Décisions figées : `Soul.md` narratif uniquement (aucun `Soul.json`),
`Agent-Memory.db` SQLite **par agent**, `Agent-Registry.db` SQLite central,
`Events.jsonl`, et table `Statistiques` append-only avec scores 0–100 historisés.
Le futur Supervisor utilise le code AI-Core partagé mais sans partage de privilèges.

**État : conception et schémas publiés, non déployés sur GEN-1.**
Les interfaces Admin existantes et les anciens modules mémoire constituent des
prototypes distincts à migrer explicitement ; ce jalon ne les remplace pas.



Espace de développement IA dédié au projet [IA-Trading-Bot](https://github.com/florian74410/IA-Trading-Bot).

## Rôle

Ce dépôt **public** accueille les brouillons, patchs, tests et configurations du DEBUG Online. Il ne contient **aucune** donnée utilisateur, clé privée, token, certificat, dump de base ou volume du VPS.

- Référence applicative : `florian74410/IA-Trading-Bot`, branche `2.5.3`, commit `8caae37ac25ffbd72c25f52ca4eeab21ee10aa8b`.
- Objectif de recette : `https://trading.debug.iatb.dns.org` (DNS et HTTPS **non encore validés**).
- VPS GEN-1 : runtime Docker DEBUG indépendant des versions RELEASE.
- Serveur MCP local : `IA-TB-DEBUG-SOURCE v0.2.0` sur `127.0.0.1:8800`, **non connecté directement à ChatGPT et sans droits Docker**.

## Politique de développement

1. Travailler sur des branches de fonctionnalités `work/*`.
2. Tester sur GitHub Actions avec des runners hébergés, sans secrets du VPS.
3. Identifier les changements par commit SHA et les soumettre à validation.
4. Déployer uniquement sur le projet DEBUG, avec données de test isolées, trading LIVE désactivé et rollback.
5. Intégrer une version validée dans le dépôt principal seulement après accord.

## État actuel

La première étape de documentation et de CI est dans `Infrastructure/DEBUG_ONLINE/`.
**Ce dépôt n'est pas encore une copie complète de l'application.** Une synchronisation contrôlée du code source 2.5.3 sera nécessaire avant de compiler une version applicative ici.
Le workflow de CI ne déploie pas le VPS.

Ne jamais monter `/var/lib/iatb`, les comptes historiques, les clés de RELEASE ni `/var/run/docker.sock` dans cet espace.
