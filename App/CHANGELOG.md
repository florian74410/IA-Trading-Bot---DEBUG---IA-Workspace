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

# Changements IA-TB

## 2.5.1 DEV — consolidation ChartViewer

- Recette locale : bandeau économique en grille responsive dans le flux, texte repliable, défilement vertical et infobulles bornées au graphique. Test Firefox 320–1440 px.

- Repères économiques UTC exacts, lignes pointillées translucides et badges interactifs : CME cyan, FED jaune-orangé, Finance Calendar distinct.
- Détails complets au survol/focus/toucher, regroupement par instant, fuseau explicite, navigation future sans OHLCV fictif et préservation des Drawing Tools.
- Tests UTC/DST et Firefox sur la vraie page ; qualification complète héritée activée sur `2.5.1`. Recette finale encore requise, aucune promotion stable.
- Rapport : [2.5.1 DEV](../Documentation/Consolidation/2.5.1-DEV.md).

## 2.4.2-R1 DEV

- **Modifications** : copie source allégée ; anciens builds, archives, plans et maquettes inutiles retirés.
- **Nettoyage** : 42 fonctions privées sans consommateur, objets/écriture sans lecteur et un import retirés ; stub Liquidity obsolète supprimé, contrat CP/1 courant testé.
- **Correctifs de cohérence** : VERSION, npm, manifest et pointeur de lancement alignés en 2.4.2, révision R1 ; audit runtime délié de la version 2.0.0.
- **Sécurité/configuration** : contrats CP/1, migrations, Auth21 et Firewall conservés ; état généré exclu de Git. Aucune donnée privée d'une autre installation effacée.
- **Validation** : audit de source et de dépendances, suites métier, tests d'entrées/snapshots et Firefox. Voir `../Documentation/Cleanup/2.4.2-R1/RESULTS.md`.
- **Compatibilité** : recette sur copie propre ; aucune fausse archive incrémentale de suppression pour l'UpdateManager historique. Aucun déploiement ou promotion stable.

## 2.4.1 DEV

Calendrier responsive et lignes d'événement transparentes ; alignement Crypto ;
Swap/Bridge, coffres et prêts suspendus ; 51 lectures normalisées CP/1 pour
Supervisor et contexte partagé de onze familles. Base qualifiée par 583 tests CI.

## 2.4.0 DEV

Finance Calendar JSON, provenance et attribution, UI défilante ; Trading Logs V2
réintégré avec masquage des deux écritures, reprise SQLite et protections snapshot.

[Changelog antérieur](https://github.com/florian74410/IA-Trading-Bot/blob/189e9c09f1549dd8f2f73bb62c62fc19d6f31d15/App/CHANGELOG.md)
