

> **Source nettoyée : [2.4.2-R1 DEV](Nettoyage-2.4.2-R1.md)** sur la branche `2.4.2-R1`, issue de 2.4.1. Recette locale à suivre ; aucune promotion stable ou opération GEN-1.
# 📦 Installation et démarrage — V2.0 DEBUG

> **🟢 En simple : IA-TB embarque son propre Node.js 16.20.2 pour rester compatible avec le Mac Intel cible. `start.command` prépare le runtime, démarre les services dans un ordre contrôlé, vérifie leur santé puis ouvre l’interface sur le port 8000.**

---

## 💻 Cible locale

**🟢 En simple : le build reste conçu pour pouvoir fonctionner sur l’ancien MacBook Pro Intel utilisé pour le développement.**

Runtime local :
- Node.js **v16.20.2**
- archive `node-v16.20.2-darwin-x64.tar.gz`
- installation dans `.node/`

`install_runtime.command` télécharge le runtime officiel Node si nécessaire et vérifie son SHA-256.

---

## 📁 Runtime local

**🟢 En simple : les fichiers temporaires de fonctionnement sont séparés du code.**

Répertoires créés :
- `.runtime/logs`
- `.runtime/state`
- `.runtime/database`
- `.runtime/cache`
- `.runtime/config`
- `.runtime/pids`
- `.runtime/updates`

Les données utilisateur persistantes utilisent en parallèle `~/IA-TB-UserData-Server`.

---

## ▶️ Démarrage

```bash
bash start.command
```

**🟢 En simple : le script vérifie d’abord qu’aucune ancienne instance ne bloque les ports, prépare Node/SQLite/dépendances, démarre les services puis teste leur health.**

Ordre fonctionnel observé :
1. préparation runtime ;
2. dépendances Banque ;
3. SQLite Fundamental ;
4. Kraken Adapter + Indicator Engine ;
5. **Firewall + workers Trading/Data** ;
6. **Market Data Collector V2.1** ;
7. **Liquidity Engine V2.0** puis les autres Engines ;
8. Core ;
9. Router ;
10. UI Service puis ouverture du navigateur.

**🟢 En simple : le Firewall Data est maintenant démarré et vérifié avant Market Data. Ainsi, le premier appel Internet du Collector ne peut pas remplir un cache ou une base avant que la couche de contrôle soit prête.**

---

## 🚦 Services attendus

**🟢 En simple : le startup console attend 14 services en ligne.**

Ports :
```text
8000  UI
8001  Core
8011  Kraken
8012  Indicator
8013  Market Data
8014  Liquidity
8015  Fundamental
8016  Trading
8017  Firewall
8018  Strategy
8019  Risk
8020  Portfolio
8021  Router
3000  Supervisor
```

Le script affiche **14 / 14 SERVICES ONLINE** lorsque tous les contrôles prévus passent.

---

## 🔥 Vérification Firewall

**🟢 En simple : “le port répond” ne suffit pas pour le Firewall. Le démarrage attend aussi les deux workers de protection.**

Le health doit exposer :
- thread Trading ;
- thread Data.

Cela évite de considérer le Firewall opérationnel alors qu’un worker critique n’est pas lancé.

---

## ⚡ Trading au démarrage

**🟢 En simple : démarrer IA-TB ne démarre pas automatiquement le trading réel.**

Le script fixe :
```text
IATB_TRADING_LIVE=0
```

Le moteur reste donc en mode SAFE par défaut.

---

## 🌐 Interface

**🟢 En simple : l’utilisateur ouvre le port 8000, pas directement les Engines.**

Adresse :
```text
http://127.0.0.1:8000
```

Le Core est sur `8001`, le Router sur `8021`.

---

## 🌍 Accès en ligne

**🟢 En simple : le tunnel externe n’est pas fusionné au runtime principal.**

`start.command` peut proposer le script externe :
`tools/Online_Access/start_online.command`.

Cette séparation évite qu’un outil d’accès distant devienne une dépendance obligatoire de l’application locale.

---

## 🩺 Si un service ne démarre pas

Voir [Dépannage](Troubleshooting.md).

Vérifier en priorité :
- droits d’exécution des `.command` ;
- runtime Node ;
- port déjà occupé ;
- SQLite ;
- logs du service ;
- accès réseau ;
- configuration provider/RPC.


---

## 🧪 Recette locale 2.4.0 DEV — Linux XFCE

> **🟢 En simple :** le lancement de développement Auth21 ne doit pas utiliser les anciens contournements DEBUG. **Cette procédure n'est pas une mise à jour du VPS ni une promotion stable.**

La branche `feature/v2.4-finance-calendar` exige Node 22 et un espace de données privé déjà préparé avec les comptes Auth21, la clé utilisateur et le certificat localhost. Lancer depuis `App/` :

```bash
bash ./start_auth21_local_safe.command
```

La page attendue est `https://localhost:8000`. Le lanceur conserve `IATB_AUTH_MODE=authenticated`, TLS, `IATB_TRADING_LIVE=0` et refuse les ports déjà occupés. Les bases, clés et certificats demeurent hors Git ; ne jamais les copier dans le dépôt. Tester Finance Calendar dans Fundamental et les états des journaux Trading avant d'envisager toute promotion.

**Note historique :** la procédure Node 16 ci-dessus décrit les anciens builds DEBUG, et non cette recette v2.4 DEV.
