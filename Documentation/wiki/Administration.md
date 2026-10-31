## 2.5.3 DEV — P4 persistant, P5 simulé

P4 est raccordé au pont ADMIN Auth21/Firewall et conserve le verrou après arrêt
ou crash. RuntimeState partage désormais le journal SQLite ADMIN. P5 SAFE/CLOSE
et la réconciliation sont testés sur brokers contrôlés ; leur raccordement aux
brokers réels et la reprise restent désactivés. START/RESTART restent en attente.
Aucun ordre réel ; cette livraison partielle ne vaut pas acceptation complète P4/P5.

Voir `Documentation/Consolidation/2.5.3-DEV.md`, la matrice
`Documentation/Trading/BROKER_CAPABILITIES_2.5.3.md` et la procédure
`Documentation/Trading/MAINTENANCE_2.5.3.md`. Les sections antérieures ci-dessous
restent historiques ; ce bilan précise l'état actuel.

# 🛠️ Administration — 2.5.2 DEV

> **🟢 En simple : Admin est le tableau de bord technique d’IA-TB. Il sert à voir les services, les logs, le Firewall, les diagnostics et le pont ADMIN P3. Ce n’est pas la page normale de trading.**

> **Accès restreint.** Ne jamais placer de clé API, secret, passphrase, token, mot de passe ou private key dans un log ou une commande de diagnostic.

---

## 🧭 Navigation Admin

**🟢 En simple : Admin conserve volontairement sa barre latérale historique, différente du menu partagé des pages utilisateur.**

Sections actuelles :
- Console ;
- Firewall ;
- Processus ;
- Engines & Services ;
- Maintenance ;
- Diagnostics.

L’ancienne navigation Admin a été conservée pour garder sa densité et ses raccourcis propres à l’exploitation.

---

## 🚦 Inventaire runtime

**🟢 En simple : le Process Registry sert d’inventaire officiel des processus installés et activés.**

| Service | Port |
|---|---:|
| UI | 8000 |
| Core | 8001 |
| Kraken Add-On | 8011 |
| Indicator | 8012 |
| Market Data | 8013 |
| Liquidity | 8014 |
| Fundamental | 8015 |
| Trading | 8016 |
| Firewall | 8017 |
| Strategy | 8018 |
| Risk | 8019 |
| Portfolio | 8020 |
| Router | 8021 |
| Supervisor | 3000 |

Les manifests définissent notamment :
- id ;
- label ;
- type ;
- ordre ;
- port ;
- health path ;
- script ;
- log ;
- dépendances ;
- activation par défaut.

Le Process Registry stocke les toggles d’activation dans SQLite.

---

## 🖥️ Console Générale

**🟢 En simple : la Console Admin exécute des commandes prévues et validées, pas un shell système libre.**

Syntaxe de debug :
```text
debug <target> <action> [key=value]
```

Les cibles et actions proviennent des registres Admin/CP1. Les opérations dangereuses doivent utiliser les confirmations et niveaux de risque prévus.

---

## 🔀 Diagnostic CP/1

**🟢 En simple : Admin peut inspecter ce que le Router connaît réellement, pas seulement ce qui existe dans les fichiers.**

Outils :
- Router health ;
- registry list ;
- capabilities ;
- runtime registry ;
- événements ;
- commandes d’observation autorisées.

Cela aide à distinguer :
- manifest installé ;
- process lancé ;
- service enregistré CP/1 ;
- service réellement joignable.

---

## 🔥 Firewall Admin

**🟢 En simple : le panneau Firewall permet d’observer et régler les protections sans modifier directement les fichiers source.**

Il peut afficher :
- état du coordinator ;
- Trading worker ;
- Data worker ;
- statistiques PASS/WARN/REJECT ;
- événements ;
- configuration.

Les routes `/firewall-admin/**` sont protégées par la permission ADMIN côté UI Service.

---

## Maintenance et diagnostic P3

Le bouton « Vérifier le pont ADMIN » soumet `STATUS` par la session Auth21
ADMIN avec CSRF. `READY` exige la réponse attestée du Trading Engine après
contrôle indépendant du Firewall et écriture dans le journal durable.
La simple présence d’une clé ne produit jamais `READY`.

Les mutations START, RESTART, DRAINING_STOP et EMERGENCY_STOP restent
`COMMAND_IMPLEMENTATION_PENDING` jusqu’à qualification P4/P5. LIVE reste à 0.
Voir [les étapes et la recette P3](../Consolidation/2.5.2-DEV.md).

Project Explorer, son arbre et son aperçu, ainsi que l’ancien générateur et
installateur de patchs ont été retirés du front et du back. Les mécanismes
indépendants de récupération du launcher et les historiques restent conservés.

---

## 🧾 Logs

**🟢 En simple : chaque service important possède son log runtime afin d’éviter une console unique impossible à diagnostiquer.**

Exemples :
- market_data.log ;
- fundamental.log ;
- trading.log ;
- strategy.log ;
- risk.log ;
- portfolio.log ;
- supervisor.log ;
- firewall.log ;
- UI log.

Le démarrage crée `.runtime/logs` et remet en place les fichiers nécessaires.

---

## 🔐 Accès Admin

**🟢 En simple : lorsque l’authentification UI est active, Admin exige un rôle administratif.**

En mode Auth21 authentifié, `/admin` et ses opérations exigent une session
ADMIN validée côté serveur. Aucun rôle fourni par le navigateur ni token
machine CP/1 ne vaut identité ADMIN. Ne pas utiliser de bypass pour la recette.
