# ⚙️ Paramètres / API — V2.0 DEBUG

> **🟢 En simple : Paramètres est le centre de configuration d’IA-TB. Les réglages ordinaires vont dans SQLite ; les secrets API sensibles vont dans un coffre chiffré séparé.**

---

## 🗃️ Réglages applicatifs

**🟢 En simple : les paramètres ne reposent plus sur une multitude de fichiers modifiés à la main.**

Le `SQLiteSettingsStore` stocke les réglages utilisateur dans :
```text
~/IA-TB-UserData-Server/User Data/<profil>/user_data.db
```

Schéma : `iatb-settings-v2`.

Le store utilise :
- SQLite CLI lorsque disponible ;
- `better-sqlite3` comme backend de repli ;
- WAL ;
- timeout busy ;
- migrations.

Les valeurs par défaut sont initialisées depuis `Config/Defaults/app_settings.json`.

---

## 🔐 Secrets API

**🟢 En simple : une clé OpenAI, 0x ou un token X ne doit pas finir en clair dans le fichier de paramètres.**

Le Core possède un coffre RSA :
- paire RSA 2048 ;
- chiffrement RSA-OAEP SHA-256 pour les secrets ;
- clé privée du coffre elle-même enveloppée avec AES-256-GCM ;
- clé dérivée du mot de passe avec PBKDF2-SHA256 ;
- fichier du coffre avec permissions restrictives lorsque possible.

Secrets explicitement suivis par le statut actuel :
- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `X_BEARER_TOKEN`
- `ZEROX_API_KEY`

La présence d’un secret peut être affichée sans révéler sa valeur.

---

## 🤖 IA

**🟢 En simple : le choix du fournisseur LLM et du modèle est configurable indépendamment des moteurs de trading.**

Réglage V2.0 par défaut :
- provider LLM : MOCK ;
- fallback : OFF ;
- OpenAI disponible comme provider configuré ;
- modèle OpenAI : `gpt-5.6`;
- timeout : 45 s.

Le Supervisor recharge sa configuration LLM depuis les paramètres.

---

## 📡 Market Data

**🟢 En simple : on choisit ici quels providers sont actifs et leurs paramètres, mais toutes les données continuent de passer par le Market Data Collector.**

Providers configurables V2.0 :
- Kraken ;
- Binance ;
- GMX ;
- OKX ;
- CoinGecko ;
- DeFiLlama.

Paramètres :
- priorité ;
- activation ;
- paires ;
- quote currency ;
- refresh ;
- cache ;
- Market Registry ;
- TTL financiers.

---

## 🛡️ Risk / Trading

**🟢 En simple : les seuils Risk et le mode Trading sont des paramètres de sécurité, pas des préférences visuelles.**

Risk possède ses seuils et poids persistés.

Trading démarre avec Live désactivé par l’environnement de démarrage. Le passage en Live ne doit pas être confondu avec l’activation d’un simple bouton UI.

---

## 🏦 Banque

**🟢 En simple : Banque utilise des configurations réseau/API distinctes des secrets de wallet.**

Exemples :
- RPC EVM ;
- endpoint Bitcoin Esplora ;
- RPC Solana ;
- 0x API pour Swap/Bridge ;
- fee recipient 0x.

Les clés privées des wallets sont gérées par Wallet Service, pas par la section API générale.

---

## 🧭 Sections UI

La page Paramètres expose actuellement :
- Vue d’ensemble ;
- IA ;
- Profile ;
- API & Data ;
- Crédits/Tokens ;
- Sécurité ;
- Fundamental ;
- Indicateurs ;
- Stratégie ;
- Trading ;
- Risk Manager ;
- Liquidité ;
- Portfolio ;
- Collecteur ;
- Providers ;
- CoinGecko ;
- Registry ;
- Communication ;
- Mosaïque ;
- Graphique ;
- Notifications ;
- Versions.

---

## 🔐 Règle obligatoire

**🟢 En simple : GitHub ne doit contenir aucune vraie clé.**

Ne jamais placer une clé API, un secret, une seed ou un mot de passe :
- dans le code ;
- dans le Wiki ;
- dans les logs ;
- dans un commit ;
- dans un exemple de configuration versionné.
