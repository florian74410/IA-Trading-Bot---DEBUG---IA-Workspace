# 2.4.2-R1 — bilan du nettoyage et qualification

Base : `189e9c09f1549dd8f2f73bb62c62fc19d6f31d15` (2.4.1).
Branche de livraison : `2.4.2-R1`. Version numérique : **2.4.2**, révision R1,
statut DEV. Aucune fusion main, promotion stable ou opération GEN-1.

## Trois passes réalisées

1. **Inventaire** : 2 166 fichiers suivis, analyse de 1 162 unités JavaScript
   (scripts HTML inclus). Les 537 unités de l'application sont valides ; l'unique
   erreur d'analyse initiale se situe dans un ancien build supprimé.
2. **Plan avant exécution** : `PLAN.json`, `INVENTORY.tsv` et `REVIEW.md` ont été
   enregistrés dans un commit distinct avant le nettoyage. `ADDENDUM.json` donne
   les extensions découvertes pendant les vérifications, avec décision avant
   modification. Les empreintes sont contrôlées avant chaque suppression.
3. **Nettoyage et qualification** : **1 303 fichiers retirés**, dont les anciens
   builds et leurs bases/WAL, les maquettes inutilisées et l'ancien stub Liquidity.
   Retrait de **42 fonctions privées sans consommateur**, trois objets/tableaux,
   une affectation sans lecteur et un import ; le module-stub supprimé contient
   également ses deux fonctions désormais inutilisées. Les contrats publics,
   migrations et fichiers de sécurité actifs sont conservés.

## Taille de la copie source

| Périmètre | Avant (octets) | Après (octets) | Gain |
| --- | ---: | ---: | ---: |
| Arborescence complète | 23,552,726 | 6,651,185 | 71.76 % |
| App exécutable et ses tests/docs | 5,308,462 | 5,220,185 | 1.66 % |

Les tailles ci-dessus portent sur les fichiers suivis, sans `.git`, dépendances
npm ou données utilisateur. La baisse concerne surtout les copies historiques
à la racine ; le runtime App ne perd que les éléments reconnus inutiles.
L'historique Git n'est pas réécrit. Utiliser un clone `--depth 1` pour éviter de
retélécharger les objets des anciennes versions.

## Contrôles statiques

- Tous les JS et scripts HTML maintenus sont parsés ; aucun nouvel import ni
  asset manquant. Le référentiel d'exceptions `REFERENCE_BASELINE.json` est vide.
- Aucun candidat fonction/objet sans lecture n'est signalé par le même contrôle
  de portée dans la source applicative maintenue. Ce résultat ne prétend pas
  prouver l'inexistence de tout comportement mort face à une réflexion arbitraire.
- Empreintes des manifestes CP/1, built-ins, migrations SQL, Auth21 et Firewall
  vérifiées inchangées. Versions npm/UI/manifest/pointeur launcher cohérentes.
- Syntaxe Python et Bash vérifiée. L'audit métier historique Market Data compare
  désormais la version réelle du build au lieu d'exiger 2.0.0.
- La gouvernance RBAC et ses tests négatifs passent. La route existante
  `/api/admin/firewall/status` est ajoutée ADMIN-only dans les deux inventaires
  statiques auparavant désynchronisés ; aucun rôle ou accès runtime n'est élargi.

## Résultats locaux

| Suite | Réussis | Échecs | Ignorés |
| --- | ---: | ---: | ---: |
| Trading, calendrier, CP/1, snapshots/ingress réels et nouveau navigateur 2.4.1 | 67 | 0 | 0 |
| Market Data, Liquidity, Fundamental, Portfolio, Strategy, Risk, transferts | 77 | 0 | 0 |
| Auth21 | 488 | 0 | 2 |
| Indicator | 6 | 0 | 0 |
| ChartViewer Firefox | 20 | 0 | 0 |
| Python stockage et inventaires de déploiement | 32 | 0 | 0 |

Soit **658 tests Node réussis + 32 Python**, et deux tests TTY ignorés uniquement
sur le conteneur local dont le seul UID disponible est root. La qualification
GitHub de la branche exige les **660 tests Node sans aucun test ignoré**, les
32 tests Python et les gardes d'intégrité. Les traces CI du commit de livraison
sont la preuve du résultat publié ; une mesure locale seule n'est pas présentée
comme une qualification CI.

Les sondes manuelles `test_market_data_runtime_v2.js` et
`test_market_liquidity_layer_v2.js` exigent des services déjà démarrés ;
`test_shadow_runtime_orchestrator_v1.js` exige en plus une configuration SHADOW.
Elles ne sont pas transformées en faux tests unitaires. Les transports CP/1,
snapshots/ingress et UI sont exercés avec services/identités temporaires et
réponses fournisseurs contrôlées. Aucun test n'envoie d'ordre réel ; cette
qualification ne prétend pas vérifier la disponibilité actuelle de chaque API
externe.

## Reproduire l'audit

Depuis la racine, avec Node 22 et les dépendances applicatives installées :

```bash
npm install --prefix /tmp/iatb-source-audit --no-audit --no-fund acorn@8.19.0 eslint-scope@8.4.0
NODE_PATH=/tmp/iatb-source-audit/node_modules node Tools/CI/audit_source_v242.cjs . /tmp/iatb-source-audit.json
python3 Tools/CI/source_integrity_v242.py /tmp/iatb-source-audit.json
node App/Tools_validate_release_version.js
node Tools/CI/verify_rbac_registry.js --self-test
```

Le workflow `.github/workflows/v24-finance-trading-logs.yml` décrit les suites
exactes. Les dépendances d'audit ne sont pas ajoutées au runtime de production.
Les fichiers générés (historiques d'installation, bases, WAL, dépendances) sont
exclus de Git ; la suppression de l'historique embarqué n'efface pas celui d'une
autre installation.

## Livraison et recette

Récupérer cette branche dans une nouvelle copie ; les données privées Auth21
existantes sont réutilisées. Node 22, `npm ci --omit=dev`, puis
`bash App/start_auth21_local_safe.command` depuis la racine (ou le nom sans App/
depuis App). Interface **https://localhost:8000**. Arrêter l'ancienne instance
avant de démarrer ; les ports occupés ne sont pas libérés de force.

L'UpdateManager historique ne sait pas appliquer une suppression de fichiers de
source : aucune archive incrémentale non compatible n'est déclarée installable.
Cette candidate se déploie par copie propre. Les opérations de rollback d'autres
installations, comptes, clés et historiques privés ne sont pas modifiés.

## Impact Wiki

Sources mises à jour : Home, Sidebar, Changelog, Versioning-and-Releases,
Installation, Roadmap, Wiki-Publishing et nouvelle page Nettoyage-2.4.2-R1.
Les liens vers les documents historiques retirés pointent vers le commit de base.
Le Wiki natif GitHub n'est pas déclaré publié par la seule modification de ces
sources, conformément à Wiki-Publishing.
