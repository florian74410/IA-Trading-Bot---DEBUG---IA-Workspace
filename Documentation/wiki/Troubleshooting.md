# 🩺 Dépannage — V2.0 DEBUG

> **🟢 En simple : commence toujours par identifier quelle couche est en panne : UI, Core, Router, Engine, Firewall ou provider. Éviter de modifier plusieurs composants à la fois masque souvent la vraie cause.**

---

## 🚦 Vérifier les ports

**🟢 En simple : un service attendu absent de son port explique une grande partie des écrans vides.**

```text
8000 UI
8001 Core
8011 Kraken
8012 Indicator
8013 Market Data
8014 Liquidity
8015 Fundamental
8016 Trading
8017 Firewall
8018 Strategy
8019 Risk
8020 Portfolio
8021 Router
3000 Supervisor
```

Utiliser la Startup Console et les health endpoints plutôt que supposer qu’un processus existe.

---

## 🚫 `.command: Permission denied`

**🟢 En simple : macOS doit avoir le droit d’exécuter le script.**

Exemple :
```bash
chmod +x start.command install_runtime.command
```

Puis relancer le script depuis son dossier.

---

## 🟢 Node Runtime introuvable

**🟢 En simple : IA-TB attend son Node local v16.20.2 dans `.node/bin/node`.**

Relancer :
```bash
bash install_runtime.command
```

Si le téléchargement automatique échoue, placer l’archive officielle `node-v16.20.2-darwin-x64.tar.gz` dans `NodeRuntime/`.

---

## 🔌 Port déjà utilisé

**🟢 En simple : une vieille instance IA-TB peut empêcher la nouvelle de démarrer.**

`start.command` essaie d’identifier et arrêter les anciennes instances connues. S’il refuse encore un port, fermer l’ancienne fenêtre/processus puis relancer.

---

## 📈 Graphique vide

**🟢 En simple : vérifier Market Data avant de modifier le graphique.**

Contrôler :
1. source : Kraken/Binance/OKX/GMX ;
2. symbole ;
3. timeframe ;
4. Market Data :8013 ;
5. Firewall :8017 ;
6. Router :8021 ;
7. réseau externe.

Ne pas remplacer automatiquement la source par une autre plateforme.

---

## 📡 Données financières Statistiques absentes

**🟢 En simple : Statistiques dépend du snapshot financier Market Data.**

Vérifier :
- CoinGecko activé ;
- DeFiLlama activé ;
- `marketdata.financial.snapshot` ;
- Data Firewall ;
- fraîcheur du Financial Store ;
- accès `/communication/v1/ui/read`.

---

## 🧠 Strategy vide/offline

**🟢 En simple : Strategy Engine doit être lancé sur 8018 et enregistré CP/1.**

Vérifier :
- `/health` du service ;
- Router ;
- catalogue Strategy ;
- logs `.runtime/logs/strategy.log`.

La page UI est principalement READ_ONLY ; un bouton désactivé n’est pas forcément une panne Engine.

---

## 🤖 Supervisor offline

**🟢 En simple : le Supervisor doit fonctionner même si le provider LLM réel n’est pas configuré, car le provider MOCK existe par défaut.**

Vérifier :
- port 3000 ;
- Router 8021 ;
- log Supervisor ;
- provider LLM dans Settings ;
- éventuelle clé OpenAI uniquement si OpenAI est sélectionné.

---

## ⚡ Trading refuse un ordre

**🟢 En simple : un refus est souvent une protection normale.**

Vérifier :
- `risk_approval_id` ;
- expiration/consommation Risk Gate ;
- Trading Firewall ;
- paire whitelistée ;
- duplicate protection ;
- mode Live ;
- adapter exchange ;
- permissions/clé API.

Ne pas contourner le Firewall pour “tester” une mutation.

---

## 💸 Transfert BTC/SOL reste SUBMITTED

**🟢 En simple : SUBMITTED signifie diffusé, pas confirmé.**

La confirmation automatique complète BTC/SOL reste partielle. Vérifier le hash/signature directement auprès du réseau/provider approprié avant de considérer l’opération finale.

---

## 👛 OnChain Reader refuse Bitcoin/Solana

**🟢 En simple : le lecteur générique actuel est principalement EVM.**

Ce n’est pas une preuve que le wallet BTC/SOL est invalide. Utiliser les modules réseau concernés ; l’extension du Reader reste à faire.

---

## 🔑 Secret/API absent

**🟢 En simple : la présence du secret dans le coffre et son déverrouillage de session sont deux choses différentes.**

Vérifier :
- coffre RSA ;
- session ;
- champ configuré ;
- nom du secret attendu ;
- permission provider.

Ne jamais copier la valeur du secret dans un log de diagnostic.

---

## 📦 `Version source incompatible`

**🟢 En simple : le patch ne correspond pas à la version installée.**

Un patch incrémental doit avoir :
```text
from_version = version réellement installée
```

Utiliser le package adapté ou une release complète explicitement prévue pour remplacer la base.

---

## 🧱 Router health ne montre pas tout

**🟢 En simple : `/router-health` n’est pas l’inventaire absolu des 14 processus.**

Pour un diagnostic complet, recouper :
- Startup Console ;
- Process Registry ;
- Admin > Processus/Engines ;
- CP/1 Registry ;
- health individuel.
