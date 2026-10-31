# IA-TB 2.4 — intégration journaux Trading V2

Base : `feature/v2.4-finance-calendar`, commit
`eaae3dfdf36d986b19be193abe6a853e53957501` (2.4.0 DEV).
Origine : prototype du 20 octobre, branche `feature/v2.3-trading-engine-2.0`,
`32b6ccdd5409ba45227b5a3e39c4e795a5e1e732`.

## Intégration

Le service Trading conserve lifecycle, Health Monitor, commandes ADMIN Auth21,
protections Risk/Firewall et contrat CP/1. Seul son stockage d'historique change.
`trading.history` reste compatible et lit le JSONL ; aucune nouvelle route
HTTP/CP/1 de lecture globale SQLite n'est exposée. Le formatter est disponible
pour une future UI ; cette livraison n'ajoute pas un nouvel écran de journaux.

Les événements sont écrits dans `trading_history.jsonl` et `trading_logs.db`
(SQLite WAL), dans le même espace utilisateur. Avec IATB_DATA_ROOT défini :
`User Data/<IATB_USERDATA_USER ou default>/`. Le chemin explicite historique
reste prioritaire. Un override SQLite vers un autre dossier est refusé pour
éviter de partager accidentellement le miroir entre deux espaces.
Les fichiers nouvellement créés sont privés (0600). La séparation de fichiers
ne remplace pas les autorisations Auth21 : les gardes de lecture existants sont
conservés, sans ajouter un accès SQL multiutilisateur.

## Corrections apportées au prototype

- Masquage récursif avant les deux écritures, pas uniquement côté SQLite.
- Un request_id n'est pas un identifiant unique d'événement ; plusieurs étapes
  d'un ordre sont conservées. event_id/execution_id sont prioritaires, sinon
  empreinte canonique stable pour le rejeu historique.
- SQLite en échec : JSONL préservé et lisible ; état dégradé visible dans
  `health.executionLogs`, reprise idempotente au redémarrage ou prochain append.
- Import du JSONL existant sans le réécrire ; lignes malformées signalées.
- Rejeu borné à 64 Mio, sans troncature silencieuse ; état REPLAY_LIMIT si
  dépassé. Une migration hors ligne dédiée est alors nécessaire.
- Aucune création SQLite/WAL pendant une reprise de snapshot gelé ; le garde
  d'écriture s'applique également au rejeu.
- Formatter : zéros conservés, erreurs sensibles masquées.

Le JSONL reste l'autorité durant cette migration ; aucune suppression ni
rétention automatique nouvelle n'est activée. Les anciens fichiers JSONL ne
sont pas réécrits pour effacer d'éventuels secrets historiques ; les nouvelles
écritures et lectures via le wrapper sont expurgées. Aucun masquage par clés ne
peut garantir l'absence de secrets placés arbitrairement dans un texte libre.

## Régressions corrigées lors de la qualification

Le test du contrôleur ADMIN doit distinguer l'absence de ledger du stade
COMMAND_IMPLEMENTATION_PENDING : les deux refus sont désormais exercés avec
une vraie base éphémère. Aucune commande d'exécution n'est rendue disponible.
Une regex historique CME suréchappait les limites de mots et espaces : HTTP
403/429 est à nouveau classé HTTP_BLOCKED. Finance Calendar JSON reste le
fournisseur économique actif ; aucun scraping CME n'est réactivé.

Le recensement des writers inclut explicitement les nouveaux fichiers et les
writers Runtime déjà présents : leur classement ne qualifie pas une sauvegarde
à chaud globale. Les tests USER/GUEST reflètent les restrictions actuelles :
paramètres infrastructure réservés ADMIN, page Settings interdite GUEST,
secrets personnels AI toujours accessibles au propriétaire autorisé. Aucune
permission de production n’a été élargie.

## Validation et déploiement

Voir le workflow `v24-finance-trading-logs.yml` et le rapport de PR. Les essais
utilisent des bases, identités et exécuteurs fictifs ; aucun ordre réel.
Le lancement local sera réalisé ensuite sur `https://localhost:8000` avec
`App/start_auth21_local_safe.command`, Node 22 et le répertoire privé existant
contenant les comptes et certificats. Ce lanceur refuse les ports occupés et
conserve Auth21, TLS et Trading LIVE=0. Aucun lancement sur GEN-1 n'est inclus.

## Qualification après fusion PR #21 (21 octobre 2026)

La [PR #21](https://github.com/florian74410/IA-Trading-Bot/pull/21) a été fusionnée **dans `feature/v2.4-finance-calendar`**, sans promotion stable. Le compte rendu indique **566 tests CI réussis, 0 échec, 0 test ignoré** ; les workflows de push et PR sont validés. Référence fournie pour la livraison : `ae586a0` ; utiliser GitHub comme source de vérité pour le HEAD réel, distinct de la référence de PR.

La qualification CI ne remplace pas la recette sur Macro. Le service doit encore être lancé localement sous Auth21/TLS avec `IATB_TRADING_LIVE=0`. Contrôles conseillés : démarrage local sans ports occupés, service Trading health et champ `health.executionLogs`, absence de secrets dans les **nouveaux** événements JSONL/SQLite, lecture historique existante, miroirs réconciliés et aucune commande LIVE activée.

**Limites inchangées :** JSONL autoritaire, pas d'accès SQL global, aucune garantie que tous les textes libres historiques soient expurgés, snapshots gelés en lecture seule, rejeu borné à 64 Mio, récupération des bases utilisateurs hors dépôt. Les 566 tests CI ne qualifient pas une sauvegarde globale à chaud ni une exécution sur exchange.
