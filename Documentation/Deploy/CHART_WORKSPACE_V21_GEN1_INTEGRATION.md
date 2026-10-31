# Préparation GEN-1 — intégration officielle PR #9

## Source et résolution des divergences

Branche : `integration/chart-workspace-v2.1-gen1`, créée depuis DEBUG
`c49e7b024cf6b85f305a3205da2c61e8926b7895`.
Deuxième parent : PR #9 `055caf3c06d5ddd26f04e343a3db945913910bec`, incluant
Renderer V2, son registre et ses 21 définitions JSON depuis PR #7.
PR #7 n'est pas une livraison séparée ; PR #8 n'est pas intégrée.
Version applicative de l'intégration : **2.1.0**.

Les cinq commits propres à DEBUG sont conservés dans l'ascendance :

| Commit | Correctif conservé |
| --- | --- |
| `393415b1` | Sélecteur marché/paire recherchable et événements `change` existants |
| `77113a93` | Overlays dans le prix ; sous-graphes uniquement pour oscillateurs |
| `126b8780` | Dock masqué en l'absence de vrais sous-graphes |
| `df39cc88` | Comptage des overlays même sans nœud DOM de panneau |
| `c49e7b02` | Renouvellement du cache des assets graphiques |

Deux conflits réels :
- `app_v1.0.html` : un seul sélecteur et un seul contrôleur/renderer, chargement
  Studio/dessins #9, suppression du doublon de bloc inline produit par la fusion,
  suffixe du lecteur intégré `2120` pour invalider les anciens assets.
- `indicator_json_reader_v2.0.js` : comptage `overlays/external/errors` et absence
  de panneaux fantômes DEBUG, couleurs/zones/niveaux et rendus V2 conservés ;
  synchronisation des classes `active` et `iatbHasExternalIndicatorPane`.

Diff nul depuis PR #9 pour Renderer V2, contrôleur natif, algorithmes Indicator
Engine, registre V2 et 21 JSON V2. Le lecteur est adapté uniquement pour combiner
les deux comportements existants. Aucun changement aux Router, Firewall,
MarketData, UI Gateway, moteurs Risk/Portfolio/Strategy/Trading, au bridge SSH
ni aux Compose existants. Aucune migration de stockage ajoutée.

## Tests exécutés (fixtures locales)

Node 22.23.3, Firefox Playwright 1.62.1, sans connexion GEN-1 ni ordres réels.
- Graphique : **29/29 PASS**, incluant le nouveau test de compteur/dock lors
  de désactivation/réactivation. Les 28 contrôles de la PR #9 restent valides.
- Statistiques : **7/8 PASS**. Échec reproduit sur `c49e7b02` : test textuel
  `COÛT TOTAL\\s*Indisponible` devenu obsolète face au libellé existant
  `COÛT TOTAL · NON CHIFFRABLE`. Aucun code Statistiques modifié ici.
- Régressions séquentielles : **23/26 scripts PASS**, dont les six suites
  Indicator Engine, Router HTTP/CP1 et protocole, frontières UI, DexScreener,
  cache/Firewall, CoinGecko, liquidations USD, Risk, Portfolio et Strategy.
- Trois échecs historiques, chacun reproduit sur `c49e7b02` :
  `test_risk_gate_boundary.js` (assertion textuelle de routage Risk CP1),
  `test_client_action_ack_v1.js` (`chart.add_indicator` absent du catalogue),
  `test_router_normalization_v1.8.12.js` (Supervisor ACTIVE vs RESERVED).
- Inventaire Docker : **3/3 tests Python PASS**, uniquement sur objets fictifs.

Commandes de vérification graphique :
```bash
node --test App/UI/Tests/test_chart_workspace_v21.js App/UI/Tests/test_chart_drawing_contract_v21.js App/UI/Tests/test_trading_indicators_v204.js App/UI/Tests/test_indicator_visual_v2.js
python3 -m unittest discover -s Tools/Deploy -p 'test_*.py'
git diff --check
```
Aucun Docker disponible dans l'environnement de développement : construction
et démarrage de l'image intégrée non exécutés. La CI et les essais réels restent
nécessaires avant de déclarer le déploiement validé.

## Verrou opérationnel — inventaire réel indispensable

Cette préparation **n'autorise aucune installation**. L'accord final d'Overflow
sera demandé après contrôle du commit, de l'inventaire et du rollback.

Le dépôt ne contient PAS l'identifiant immuable de l'image exécutée sur GEN-1.
Ne pas l'inférer d'un tag comme `iatb:debug-v2.01`. Plusieurs installations sont
mentionnées dans l'historique, avec des projets et des overrides différents.
Ne pas choisir `iatb-debug-stack` ou `iatb-debug-v2-01` uniquement d'après son nom.
Le dossier de checkout n'est pas la preuve de la stack réellement utilisée.

### Étape immédiate, uniquement en lecture Docker

Depuis une copie de cette branche sur GEN-1 (ou en copiant seulement ce script) :
```bash
sudo python3 Tools/Deploy/gen1_chart_inventory.py
```
Le rapport donne, sans exporter les secrets :
- tous les projets IA-TB et conteneurs, services réellement démarrés ;
- **immutableImageId** à sauvegarder pour chaque service, références d'image ;
- fichiers Compose, répertoire de projet, UID/GID ;
- montages réels, sources des volumes et chemins du socket SSH ;
- ports publiés et namespace réseau, indicateurs de trading ;
- montages inscriptibles partagés entre plusieurs stacks (bloquant à examiner).

Ce script ne fait aucun `exec`, `stop`, `start`, `up`, build ou changement Docker.
Ses commandes sont seulement `docker ps` et `docker inspect`.
Ne pas transmettre un `docker inspect` brut ou un `compose config` non expurgé :
ils peuvent contenir des secrets. Le rapport du script est volontairement filtré.

## Plan de déploiement à figer après inventaire, AVANT accord VPS

### Périmètre proposé

Remplacer uniquement les conteneurs **ui** et **indicator** de la stack DEBUG 2.1
explicitement choisie. UI sert les nouveaux assets ; Indicator charge le pack V2
et son validateur visuel. Les autres sources backend sont inchangées.

Garder le Router et `ssh-ui-bridge` existants, leur namespace, les UID/GID et le
socket Unix à son chemin réel. `--no-deps` est obligatoire pour ne pas recréer le
Router et déconnecter les services de son namespace. Le tunnel SSH hôte reste
inchangé ; les connexions HTTP peuvent être brièvement interrompues pendant le
remplacement de l'UI. Aucun port public ajouté.

Core/Router et autres Engines conservés peuvent continuer à annoncer leur
ancienne version ; c'est attendu pour ce déploiement graphique ciblé. Le nouveau
frontend et Indicator doivent annoncer/charger les assets et contrats 2.1.0.
Ne pas recréer tous les services uniquement pour harmoniser leurs métadonnées.

### Sauvegarde vérifiable

1. Identifier exactement le projet cible, les services actifs, leurs images,
   fichiers Compose et montages ; vérifier absence de Trading actif/LIVE, ports
   publics et partage inscriptible non approuvé avec RELEASE/ancienne DEBUG.
2. Créer un dossier root privé mode 0700 hors des montages applicatifs. Y conserver
   la configuration Compose résolue et les métadonnées complètes (mode 0600 ;
   peuvent contenir des secrets), sans les publier dans GitHub.
3. Taguer localement les anciens IDs UI/Indicator sous des tags rollback uniques.
   `docker image save` ces deux images dans une archive privée ; calculer SHA256,
   puis `docker image inspect` pour vérifier que les IDs sauvegardés correspondent
   exactement au manifeste. Conserver aussi l'inventaire des images des autres
   conteneurs, qui ne seront pas remplacés.
4. Sauvegarder les données sous quiescence : arrêter **uniquement les writers
   approuvés de la stack cible** pendant la copie. Si le Router est writer SQLite,
   le plan d'arrêt/reprise doit inclure ses dépendants de namespace et être revu
   avant action ; ne pas improviser. Ne pas faire un tar à chaud en prétendant
   obtenir un snapshot SQLite cohérent. Vérifier les éventuels writers externes.
5. Archiver les sources de persistance réellement inventoriées en préservant
   propriétaires numériques, modes, ACL et xattrs. Inclure DB, WAL/SHM s'ils sont
   présents et configurations/clés. Exclure les sockets Unix et PID éphémères.
   Démarrer les mêmes conteneurs existants après la copie, sans nouvelle image.
6. Contrôler checksum des archives, table des fichiers, espace disque disponible
   et extraction dans un répertoire temporaire privé. Exécuter `PRAGMA quick_check`
   sur les COPIES des SQLite avec leurs fichiers associés ; ne pas ouvrir les DB
   de production en écriture. Ne jamais restaurer les secrets dans une fixture CI.

Le plan de sauvegarde n'est validé qu'après identification des writers et essai
sur copies. Aucun de ces points n'a été exécuté sur GEN-1 par l'agent.

### Construction et remplacement ciblé (gabarit non exécutable tel quel)

Après inventaire, les valeurs ci-dessous seront remplacées par les chemins,
projet, images et UID/GID réels, puis présentées à Overflow pour accord final.

```bash
# Depuis le checkout isolé du commit d'intégration approuvé :
git rev-parse HEAD
git diff --exit-code HEAD -- App
docker build --label org.opencontainers.image.revision="$APPROVED_COMMIT" \
  -t "$NEW_UNIQUE_IMAGE_TAG" -f App/Dockerfile.app App
# Vérifier VERSION=2.1.0 et hashes des assets via une commande Node one-shot
# dans l'image sans réseau, sans volume et sans lancer de service.

# Reprendre STRICTEMENT la liste réelle des fichiers Compose et le projet
# approuvés ; conserver leurs overrides et toutes les variables actuelles.
# Sauvegarder config + images + données vérifiées AVANT le remplacement.
# Ajouter uniquement un override image pour ui/indicator, sans ports ni mounts.
# Ne pas remplacer l'ancien tag partagé avec une autre stack.
docker compose --project-name "$APPROVED_PROJECT" \
  --project-directory "$EXISTING_COMPOSE_DIRECTORY" \
  -f "$EXISTING_COMPOSE_FILE" -f "$EXISTING_OVERRIDE_FILE" \
  -f "$NEW_UI_INDICATOR_IMAGE_OVERRIDE" --profile manual-stack \
  up -d --no-deps --no-build --pull never --force-recreate ui indicator
```
**Ce gabarit n'est pas une commande exacte de production** : les valeurs doivent
être tirées de l'inventaire et le nombre de fichiers Compose peut différer.
`--profile manual-stack` explique pourquoi un `config --services` sans profil
pouvait sembler vide dans la procédure précédente. Ne jamais utiliser `down`,
`down -v`, `reset --hard`, force-push, prune ou suppression de volumes.

### Validation puis rollback

Comparer après remplacement : IDs des autres conteneurs inchangés, montages/
UID/GID/réseaux UI/Indicator identiques au manifeste, absence de Trading/LIVE,
socket toujours au même chemin et accessible depuis le tunnel privé.
Vérifier UI/Indicator health, CP/1 Router, Firewall et rendu Firefox (Ichimoku,
Bollinger, MACD/RSI, Studio, Fibonacci, positions, zoom/pan, persistance).
Les tests synthétiques n'injectent rien dans les bases réelles.

Au moindre blocage : réappliquer le même Compose et les mêmes overrides avec
**les tags rollback des IDs UI/Indicator sauvegardés**, puis la commande ciblée
`up ... ui indicator` ci-dessus. Le Router/bridge et les données restent en place.
Si nécessaire, `docker image load` l'archive contrôlée par checksum. Vérifier
que les nouveaux conteneurs utilisent les anciens IDs exacts, que le socket et
les healthchecks reviennent. Ne pas restaurer automatiquement les bases :
aucune migration ajoutée ici ; une restauration écraserait des écritures récentes.
La restauration de données serait un arbitrage distinct sous quiescence.

## Informations encore absentes et bloquantes pour l'accord d'installation

- Projet DEBUG 2.1 cible exact et distinction réelle avec l'ancienne stack.
- IDs immuables des images UI/Indicator existantes.
- Liste et contenu local des Compose/overrides actifs, UID/GID, montages et socket.
- Writers à suspendre, espace disque et résultat d'une restauration sur copies.

Ne pas annoncer ces éléments vérifiés tant que le rapport GEN-1 n'a pas été reçu.
