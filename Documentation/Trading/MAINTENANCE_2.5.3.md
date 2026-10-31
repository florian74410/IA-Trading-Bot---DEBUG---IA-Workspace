# Maintenance Trading 2.5.3 DEV

## États et stockage

Le service peut être lancé tout en refusant toute exécution. `STOPPED` est un état
du cycle de vie, pas une preuve d'absence de positions distantes. `EMERGENCY_HALTED`
est un verrou persistant qui ne liquide et n'annule rien. `DRAINING` interdit les
nouvelles ouvertures ; `RECONCILING` rapproche les preuves ; `DRAINING_BLOCKED`
signale une incertitude. La reprise vérifiée retourne seulement à `STOPPED`,
sans autoriser implicitement RUNNING ni LIVE.

`RuntimeState` utilise désormais **le journal ADMIN existant**
`User Data/<profil>/trading_admin_actions.db`, avec SQLite WAL et synchronous FULL.
Le chemin de profil découle de `IATB_DATA_ROOT`, `IATB_USERDATA_USER` et, si fourni,
`IATB_TRADING_RUNTIME_STATE`. Core/Firewall/Engine doivent désigner le même profil.
Une autre installation utilisant un autre stockage n'est pas verrouillée par ce
profil. Les colonnes de `admin_commands` sont conservées ; les nouvelles tables
sont additives (`trading_lifecycle`, `trading_lifecycle_events`,
`trading_operations`, `trading_drains`, `trading_owned_resources`,
`trading_drain_actions`).

Le JSON `trading_runtime_state.json` est importé une seule fois, à la création de
la ligne du cycle de vie. Il n'est plus l'autorité après migration. Une valeur
illisible est bloquée. Un journal absent recréé reste STOPPED, jamais RUNNING ;
un journal corrompu, inaccessible ou remplacé bloque aussi les processus déjà
ouverts. Ne pas modifier le JSON pour tenter une reprise.

L'intention ADMIN et le verrou P4 sont enregistrés dans la même transaction
IMMEDIATE avant l'accusé de réception. Une opération réserve durablement son
identifiant comme UNCERTAIN, puis vérifie l'état et la génération sous transaction
juste avant l'appel synchrone du transport. Une révocation marque NOT_SENT ; un
envoi déjà commencé reste UNCERTAIN jusqu'à une preuve externe. Il n'y a aucun
await sous le verrou SQLite. Cette frontière ne peut rappeler un paquet déjà
soumis au réseau. Le verrou s'applique au Firewall, au moteur et à son transport ;
les executors réels possèdent en plus le refus LIVE inconditionnel de cette DEV.
Le Supervisor hérité produit des intentions et ne possède pas d'executor direct.

## Recette locale SAFE

Utiliser Node 22, une installation séparée et les données privées existantes.
Ne pas copier de clés dans le dépôt. Le launcher refuse les conflits de ports et
conserve `IATB_TRADING_LIVE=0`. P3 exige toujours son opt-in et une clé déjà
provisionnée, validée par `Tools/CLI/trading_p3_preflight.js`.

```bash
git fetch origin refs/heads/2.5.3:refs/remotes/origin/2.5.3
git worktree add --track -b 2.5.3 ../IA-TB_2.5.3_DEV origin/2.5.3
cd ../IA-TB_2.5.3_DEV
npm ci --prefix App --omit=dev --no-audit --no-fund
bash App/start_auth21_local_safe.command
```

Si la branche ou le dossier existe, inspecter son état ; ne pas les écraser.
Conserver les paramètres privés du launcher 2.5.2. ADMIN → Maintenance :

1. Vérifier le pont : seul READY attesté permet les boutons.
2. Déclencher et confirmer l'arrêt d'urgence. Attendre EMERGENCY_HALTED confirmé.
3. Arrêter proprement puis relancer les services. STATUS doit toujours afficher
   EMERGENCY_HALTED. En cas de délai réseau, lire STATUS avec un nouvel identifiant ;
   ne jamais supposer que la commande initiale a échoué.
4. Vérifier qu'un compte USER/GUEST ne peut pas appeler la commande.
5. Vérifier que START/RESTART ne déverrouillent pas et que la reprise est refusée
   tant que les lectures broker/Risk/Portfolio ne sont pas qualifiées.

**Reprise réelle indisponible dans cette livraison.** Ne pas supprimer la base,
les lignes de verrou ou l'anti-rejeu, ne pas remplacer la clé pour contourner le
refus. Conserver les preuves et traiter les expositions directement chez le
broker selon la procédure de l'opérateur. Le callback backend de reprise est
qualifié avec fixtures mais volontairement non installé dans le service.
L'administrateur ne peut pas envoyer lui-même des booléens « réconcilié ».

## P5 et récupération après interruption

Le service bloque un préflight SAFE/CLOSE non qualifié en DRAINING_BLOCKED. Il
préserve un EMERGENCY_HALTED préexistant. Aucun inventaire réel vide n'est simulé
pour fabriquer un succès. Le bouton de clôture reste désactivé.

Sur le banc de tests, un plan serveur contient les comptes, marchés, identifiants,
quantités, exclusions et risques. Il est lié à l'identité ADMIN, à un digest et à
une durée de 30 secondes. CLOSE exige une confirmation supplémentaire. Un ordre
manuel, hors compte ou non attribuable n'est jamais muté ; SPOT n'est jamais vendu.
Les tentatives ont un identifiant stable UNIQUE. Une interruption interdit une
nouvelle confirmation financière du même plan : seule une nouvelle lecture de
réconciliation peut résoudre son état. Les preuves de statut et l'inventaire
complet sont obligatoires, ainsi que le rapprochement Portfolio. Les opérations
incertaines, partiels et nouvelles expositions imprévues bloquent STOPPED.

Après crash, ne pas retransmettre une clôture. Conserver la base/WAL, relancer,
relire les statuts distants et réconcilier par identifiant. Ce dernier raccordement
reste à développer pour les adapters réels ; les tests montrent le comportement
attendu avec brokers contrôlés, sans trafic financier.

Sauvegardes : arrêt coordonné de tous les écrivains avant copie cohérente SQLite,
avec checkpoint ou sauvegarde SQLite adaptée ; ne pas copier seulement le fichier
`.db` en omettant son WAL actif. Les écritures de maintenance restent explicitement
hors qualification des snapshots expérimentaux à chaud Auth21. Un retour au code
2.5.2 ne doit pas être utilisé comme méthode de déverrouillage.
