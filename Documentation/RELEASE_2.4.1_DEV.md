# IA-TB 2.4.1 DEV — calendrier, Bank et données Supervisor

Branche : `feature/v2.4.1-bank-calendar-cp1`.
Base : dernière 2.4, `405e7b17b06980e6cfd0dd7630dd27cea60f8ab2`, incluant
la fusion Trading Logs V2 `ae586a0` et sa documentation.
Cette branche est une candidate de recette locale, pas une release stable ni un
déploiement GEN-1. Les historiques 2.2.x et 2.4.0 restent distincts.

## Interface

Le calendrier unifié s'adapte à la largeur réelle de son panneau : mois et
agenda côte à côte sur grand panneau, empilés sur panneau plus étroit, lignes
d'événements réorganisées en cartes lisibles sur mobile. La liste défile dans
un espace borné ; les valeurs Prévu/Réel/Précédent restent accessibles. Le
plafond visuel de 12 événements du prochain agenda est retiré ; les bornes du
contrat de collecte restent en place.

Finance Calendar devient une provenance explicite dans l'adaptateur commun,
sans perdre la compatibilité du filtre historique CME. Les consensus/prior à
zéro sont conservés. Les événements disposant d'une heure publiée sont tracés
sur le graphique natif par une ligne verticale fine, pointillée, opacité 28 %.
Leur abscisse interpole l'heure entre les bougies visibles et suit zoom/pan.
Une date sans heure n'est jamais placée artificiellement à minuit ; un événement
hors de la fenêtre visible n'est pas dessiné. Les lignes simultanées sont
regroupées pour éviter de foncer le graphique.

Dans Bank → Portefeuilles → Transaction/Transférer, le label Crypto et les
labels des montants partagent espacement, hauteur de ligne et alignement. Le
sélecteur Crypto dispose aussi d'un nom accessible explicite.

## Fonctions Bank suspendues

Swap/Bridge, coffres personnels et partagés, et prêts sont masqués dans la
navigation et les présentations concernées. Le module Swap n'est plus chargé
par la page et les anciens liens directs sont neutralisés. Le code et les
données ne sont pas supprimés.

Les API correspondantes, y compris les routes ADMIN, retournent 403
`BANK_FEATURE_SUSPENDED` après authentification. Le même refus protège les
points d'entrée internes de création de coffre, quote, préparation, exécution
et suivi Swap/Bridge. Les alias CP côté Core sont refusés avant dispatch.
La politique est un commutateur de release explicite ; aucun paramètre client
ou variable d'environnement ne la contourne. Portefeuilles, clés et transferts
ordinaires conservent leurs gardes existants. Le refus spécifique de création
de coffre pendant un essai snapshot est conservé.

## Collecteurs → Router CP/1 → Supervisor

`supervisor.data.catalog` expose un inventaire explicite de **51 lectures** de
produits normalisés Market Data, Fundamental et Liquidity, avec leurs contrats
d'arguments. `supervisor.data.read` permet de lire un produit de cet inventaire
avec `{target, action, arguments}` ; il utilise exclusivement le client CP/1
canonique vers Router. Aucun appel fournisseur direct n'est ajouté à Supervisor.

Couverture : bougies/ticker/catalogues et métadonnées d'actifs ; données
financières CeFi/DeFi et historique ; carnet/microstructure et historique ; open
interest et historique ; liquidations ; liquidité des pools DEX et historique ;
publications et parsers/news ; événements et preuves ; sources/providers ;
calendriers/Fedwatch ; synthèses, traductions et chronologies ; contexte et zones
de liquidité. Les capacités et la provenance détaillée restent dans les
réponses normalisées des moteurs : ce n'est pas un accès aux secrets ni à tous
les fichiers bruts internes des fournisseurs.

`supervisor.context` collecte un contexte partagé borné de onze jeux : bougies,
finance, microstructure, OI, DEX, liquidations, news, événements, calendrier,
Fedwatch et synthèses. Les autres produits restent lisibles à la demande.
Le contexte historique est également enrichi avec `collectorData`. En mode
Auth21, les trois opérations passent par `supervisor.user.request`, une preuve
signée et une session propriétaire courante ; GUEST reste refusé. Le contexte
partagé ne lit pas le portefeuille global d'un autre utilisateur. L'enveloppe
signée AI et sa vérification restent inchangées : aucune insertion invisible de
texte dans un prompt déjà signé.

Les lectures comportent cible, action, heure de récupération, transport et
provenance source disponible. Les données indisponibles restent nulles et
signalées dans `availability`/`warnings` ; une valeur zéro n'est pas une donnée
manquante. Les métadonnées sensibles sont expurgées avant retour à l'utilisateur.
Les actions de réglage, purge, refresh forcé, exécution et les requêtes
arbitraires sont exclues. Les bornes des arguments et les schémas CP sont vérifiés
avant tout dispatch.

## Qualification et limites

Le workflow `.github/workflows/v24-finance-trading-logs.yml` valide Node 22,
Trading/Finance Calendar, les nouveaux contrôles Bank/collecteurs, le routage
HTTP CP/1 avec adaptateurs signés, les snapshots et entrées de vrais services,
Auth21 et Firefox (calendrier/Bank/ChartViewer). La CI exige zéro test ignoré.
Le test de routage utilise des réponses fournisseurs fictives locales : il ne
prouve pas la disponibilité réseau actuelle de chaque API externe. Le smoke
test historique `test_supervisor_pipeline_smoke.js` nécessite une application
complète déjà démarrée ; il ne remplace pas ces essais isolés et n'est pas
lancé comme test unitaire hors de cette condition.

La recette utilisateur suit sur `https://localhost:8000`, Node 22,
`bash App/start_auth21_local_safe.command`, avec le répertoire privé existant
`~/IA-TB-v23-Auth21-private` (ou `IATB_AUTH21_LOCAL_PRIVATE`). Arrêter l'ancienne
instance proprement : le lanceur refuse un port occupé. TLS/Auth21 sont conservés,
Trading LIVE=0 et pont ADMIN P3 désactivé. Aucune migration destructive ou
réinitialisation des comptes n'est nécessaire.
