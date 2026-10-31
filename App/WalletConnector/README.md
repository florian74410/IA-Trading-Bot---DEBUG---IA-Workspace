# IA-TB Wallet Connector

Wallet Connector central de l'application.

- WalletConnect/Reown AppKit : QR code et choix du wallet.
- Wallet navigateur : connexion EIP-1193 quand disponible.
- Une connexion externe est enregistrée dans Banque > Mes Portefeuilles avec le type produit **Cold Wallet**.
- Une connexion Connector ne crée jamais d'entrée dans Mes Clés et IA-TB ne demande jamais la clé privée.
- Portfolio et Supervisor doivent référencer le portefeuille par son identifiant interne, pas par une clé privée.

## Configuration
Définir `WALLETCONNECT_PROJECT_ID` dans l'environnement du Core. Le Project ID ne doit pas être commité dans le dépôt.

Le connecteur front demande `/api/wallet-connector/config` au Core puis ouvre AppKit.