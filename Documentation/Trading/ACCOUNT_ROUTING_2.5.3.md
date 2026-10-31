# Comptes d’exécution et coffre — 2.5.3 DEV

## Livraison actuelle

Le service Trading instancie désormais le client du coffre en mode Auth21
`authenticated`. Le Core possède les affectations et les clés ; les autres
moteurs ne reçoivent que des références publiques et un ticket opaque.
**LIVE et P5 réel restent désactivés : ce raccordement ne qualifie pas les brokers.**

Dans Paramètres → API & Data → Comptes d’exécution : créer une affectation CEX
(Binance, Kraken, OKX), ou choisir un wallet interne EVM pour GMX, le réseau et
les contrats autorisés. Choisir les actions autorisées, l’état actif et le compte
par défaut. Une ambiguïté de comptes par défaut est refusée. Pour révoquer,
modifier l’affectation et décocher « active ». Un identifiant ne peut pas changer
de broker. Les secrets laissés vides à la modification sont conservés.

Les affectations sont chiffrées dans `client_preferences` (scope `trading`),
les credentials CEX dans `um_secrets`, avec la clé maître existante Auth21.
La mise à jour des deux est atomique dans la base existante. Aucun nouveau
coffre, aucune migration des wallets ni copie de clé privée dans Trading.
Le wallet utilisé est celui du WalletService existant, sous le contexte Auth21
vérifié. USER/ADMIN accèdent uniquement à leurs propres affectations ; GUEST
est refusé. Configuration et signature explicite exigent le mot de passe,
une session valide, l’origine autorisée et CSRF.

## Parcours CEX branché

1. Le pont CP du Core reçoit une intention sous la session authentifiée.
2. La sélection vérifie propriétaire, broker, marché, action et compte demandé
   ou défaut explicite. Le client_order_id doit être stable et déjà fourni.
3. Core émet un ticket aléatoire valable 30 secondes, lié à l’intention normalisée
   complète, à l’action et à la révision de l’affectation. Le ticket ne contient
   ni clé, ni session navigateur. Il n’est pas retourné par le pont UI.
4. L’intention continue par Router et Firewall. Le RiskGate existant reste requis.
5. Trading réclame le ticket une seule fois par HTTPS vers Core. Les credentials
   ne sont récupérables qu’une fois, pour le broker choisi. Session et affectation
   sont revérifiées avant la restitution. Une erreur exige une nouvelle intention,
   jamais une répétition financière aveugle.
6. L’identité publique résolue alimente le résultat et les métadonnées Portfolio.
   Les tickets sont supprimés du journal d’exécution et masqués par le redactor.

Le pont interne exige aussi une signature HMAC de chaque corps, avec nonce et
fenêtre de cinq secondes, à l’aide de la clé P3 déjà provisionnée
`IATB_AUTH21_TRADING_IPC_KEY_FILE`. Le domaine cryptographique est distinct de P3.
Le jeton CP partagé seul est insuffisant. Pas de génération de clé de secours,
pas de certificat TLS ignoré. Les tickets restent en mémoire ; un redémarrage
les invalide. Ils ne sont pas une délégation de stratégie durable.

## Signature interne DEX

Le nouveau signataire EIP-712 réutilise ethers et WalletService. Il vérifie
l’adresse dérivée de la clé, le réseau, le contrat autorisé, le digest exact
approuvé et la validité de l’affectation/session avant de rendre la signature.
Aucune clé n’est retournée par l’API. Aucun broadcast n’est effectué.

`POST /auth21/trading/sign-typed-data` accepte `account`, `typedData`
(`domain`, `types`, `message`, `primaryType` optionnel), `digest`, `confirmed:true`
et `password`. Le digest est celui d’EIP-712, pas le hash du JSON. Cette API est
un parcours de signature explicite pour le propriétaire, **pas un endpoint
accessible au Supervisor ni une autorisation automatique de signer une réponse
GMX**. Aucun formulaire de signature aveugle n’est ajouté à l’interface.

La vérification sémantique des données GMX préparées par rapport à l’ordre Risk,
aux montants, aux frais et au destinataire doit précéder la signature autonome.
Le client Trading refuse donc encore GMX avec `DEX_PREPARED_POLICY_REQUIRED`.

## API et limites

- `GET /auth21/trading/accounts` : métadonnées du propriétaire, sans secrets.
- `PUT /auth21/trading/accounts` : création/modification, réauthentification.
- `POST /auth21/internal/trading-access` : HTTPS machine, signature dédiée,
  ticket lié à l’ordre, session revalidée ; pas d’accès navigateur.
- La configuration est utilisable ; les envois financiers restent bloqués.
- La délégation durable Supervisor/stratégie reste à implémenter. Le parcours
  livré est lié à une session active et ne contourne pas les refus Risk/Firewall.
- Aucun inventaire privé CEX, statut final ou réconciliation P5 réel n’est ajouté
  par cette livraison. La propriété P5 ne découle pas du seul journal Portfolio.
- La préparation GMX actuelle ne correspond pas au contrat SDK/API actuel :
  elle doit être réécrite et qualifiée, avec suivi du requestId sur le même hôte.
  Référence : https://docs.gmx.io/docs/sdk/v2/examples/
- Les nouvelles écritures Auth21 sont classées hors snapshots expérimentaux
  à chaud. Sauvegarde cohérente hors ligne selon la procédure existante.

## Qualification

Tests avec vrais UserStore/SQLite chiffrés, sessions, HTTPS et wallets internes
jetables : isolation, révocation, rotation, altération de l’ordre, expiration,
rejeu, refus du jeton CP seul, signature EIP-712 et récupération de son signataire.
Test Firefox : saisie CEX, effacement des champs secrets, sélection DEX et largeur
390 px. Aucune clé de production, aucun appel privé à un exchange, aucun ordre.
Les empreintes des trois fichiers Auth21 modifiés sont mises à jour après revue
et tests ; les contrôles d’intégrité et de permissions restent actifs.

Résultats locaux finaux, Node 22.23.4 : suite combinée Auth21/Trading **541
réussis sur 543, 0 échec, 2 ignorés** (tests TTY nécessitant un UID non privilégié,
à vérifier en CI Linux). Les 7 tests coffre/signature/HTTPS sont inclus.
Firefox : **1/1**. Intégrité des sources/imports/assets, RBAC et version : réussis.
