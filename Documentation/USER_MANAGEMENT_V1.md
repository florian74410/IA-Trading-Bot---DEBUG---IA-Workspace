# User Management V1 — Auth21 sur IA-TB 2.2.0

## Référence et état de qualification

Base : `release/v2.1.1-gen1`, `43863e817b45c0821de3928d585cfc58f55ce9c5`.
Travaux Auth21 importés depuis `feature/debug-2.1-auth-design`,
`85383cd617bb29b1e2804078f4ef92fab5c881d3`. Branche de développement : `feature/user-management-v1`. Livraison TEST sur
`release/v2.2-gen1` après qualification ; aucun déploiement GEN-1.
Voir [les notes 2.2.0](https://github.com/florian74410/IA-Trading-Bot/blob/189e9c09f1549dd8f2f73bb62c62fc19d6f31d15/Documentation/RELEASE_2.2.0.md) et [la procédure de recette](https://github.com/florian74410/IA-Trading-Bot/blob/189e9c09f1549dd8f2f73bb62c62fc19d6f31d15/Documentation/GEN1_TEST_2.2.0.md).

Cette livraison ajoute un mode authentifié réel, une CLI sur la base existante,
la connexion email et la sécurité du compte dans le Profil existant. Elle ne
qualifie pas la totalité des fonctionnalités métier du projet en multiutilisateur.
Les anciennes opérations sans contexte de propriétaire restent refusées, y compris
pour ADMIN. **L'activation sur une stack existante n'est pas une mise à niveau
transparente de toutes ses fonctionnalités.** Voir les limites ci-dessous avant
une décision d'installation. Les modules expérimentaux Auth21 restent identifiés
comme expérimentaux et ne sont pas utilisés comme preuves métier.

## Modes et frontières

- `DEV-LOCAL` : bypass historique conservé, `IATB_AUTH_MODE=disabled` ; bind loopback,
  accès local ou tunnel privé seulement. Aucun header HTTP ne l'active.
  Le démarrage écrit `DEV_BYPASS_ACTIVATED` dans `client_audit`.
- `AUTHENTICATED` : `IATB_AUTH_MODE=authenticated`, session obligatoire,
  aucun rôle administratif implicite. Core et UI utilisent HTTPS avec certificat
  vérifié entre les deux services. Cookie `__Host-iatb21`, HttpOnly, Secure,
  SameSite=Strict, Path=/ ; token brut jamais dans SQLite ou localStorage.
- `PRODUCTION` : mode explicite ou NODE_ENV=production ; refuse le bypass,
  le bootstrap DEBUG et le rôle de bypass UI. N'active pas le trading.

Le mode authentifié refuse le cumul avec les flags `IATB_AUTH21_*_TRIAL=1`.
Le coordinateur de snapshot expérimental ne couvre pas les nouveaux writers.
Utiliser une maintenance hors ligne pour les migrations et sauvegardes de stack.
Les points HTTP historiques des Engines sont fermés en mode authentifié ; CP/1
exige son secret interne. Le Router ferme ses bridges UI directs ; le navigateur
passe par Gateway puis Core. Les services restent internes sur loopback.

## Préparation locale, sans installation sur GEN-1

Node 22 requis, dépendances verrouillées dans `App/package-lock.json` :

```sh
cd App
npm ci
cd ..
export IATB_DATA_ROOT=/chemin/absolu/donnees-existantes
node App/CLI/users.js help
```

`IATB_DATA_ROOT` doit contenir `Database/clients.sqlite` et
`Security/client_master.key` d'origine. Aucun nouveau fichier de clés ne doit
remplacer celui de l'installation existante. Conserver aussi le wallet master
key, les bases de réglages, les coffres historiques, les annexes et secrets de
stack. Ne pas les committer.

La CLI exige un terminal réel et l'UID non-root propriétaire de la base, de la
clé et du terminal. Fichiers privés 0600, chemins canoniques, aucun lien symbolique.
Pas de mot de passe en argument, variable d'environnement ou pipe. Même les
opérations de lecture de comptes nécessitent une authentification ADMIN locale.

### Migration explicite et premier ADMIN

Arrêter les anciens writers dans une fenêtre de maintenance avant migration.
Sauvegarder l'ensemble des données et configurations, pas seulement clients.sqlite.
La CLI demande la confirmation littérale `MIGRATE USER MANAGEMENT V1` :

```sh
node App/CLI/users.js migrate
node App/CLI/users.js create-first-admin
```

La migration contrôle SQLite et le déchiffrement des identités avec la clé
d'origine. Elle produit une sauvegarde SQLite via l'API backup (WAL inclus), en
0600 dès la création, avant tout changement. Elle ajoute le schéma Auth21 v3 et
les tables V1 v4 et la migration additive de politique v5 ; convertit SUPERADMIN en ADMIN sans changer les identifiants,
les empreintes de mots de passe ni les identités chiffrées. PBKDF2 historique
reste vérifiable ; les nouveaux mots de passe sont Argon2id (64 MiB, 3 passes).
La migration invalide les anciennes sessions expérimentales et introduit la
version de permissions 3, contrôlée à chaque résolution de session.
Aucune migration n'est lancée automatiquement par le runtime authentifié.
En cas d'échec intermédiaire, conserver la sauvegarde et restaurer hors ligne :
la migration complète v3+v4+v5 n'est pas une unique transaction SQL.

Le bootstrap est refusé dès qu'un ADMIN actif existe. Il demande l'identité et
le mot de passe sur le terminal puis `CREATE FIRST ADMIN`. Aucun ADMIN par défaut.
Les triggers SQLite protègent le dernier ADMIN actif, même en écriture SQL directe.

### Commandes d'administration

```sh
node App/CLI/users.js list
node App/CLI/users.js show CL000001
node App/CLI/users.js create
node App/CLI/users.js set-role CL000002 USER
node App/CLI/users.js disable CL000002
node App/CLI/users.js enable CL000002
node App/CLI/users.js reset-password CL000002
node App/CLI/users.js revoke-sessions CL000002
node App/CLI/users.js audit
```

Remplacer les IDs d'exemple par ceux retournés par `list`. Les commandes mutantes
exigent `CONFIRM <commande>`. Le changement de rôle, la désactivation, le reset
et le changement de mot de passe invalident immédiatement les sessions en base.
Les commandes normales peuvent coexister avec Core ; seul `migrate` exige l'arrêt
des writers. Code de sortie 0 si succès, 1 si refus/erreur ; messages sans secrets.
Aucune route HTTP de création, administration ou réinitialisation d'un autre compte.

### Conservation et import du coffre historique

Les nouveaux secrets sont chiffrés par la clé client existante, séparément des
sessions et du KDF de mot de passe. Changement et reset n'effacent pas ces secrets.
Un ancien coffre RSA global exige toujours son **mot de passe d'origine** :

```sh
export IATB_LEGACY_VAULT=/chemin/absolu/secrets_v2.dat
node App/CLI/users.js import-legacy-vault CL000001
```

L'ADMIN confirme explicitement l'attribution au compte cible. Le mot de passe
original déverrouille la clé RSA ; les secrets sont re-chiffrés sous la clé client,
jamais affichés. Fichier original conservé octet pour octet, pas d'écrasement des
secrets déjà présents, attribution globale unique en base. Après import, un reset
préserve les secrets importés. Sans le mot de passe original, aucune récupération
cryptographique du coffre historique n'est promise. Le reset CLI exige l'accusé
`ACKNOWLEDGE LEGACY VAULT` avant confirmation.

## Démarrage authentifié sur une copie isolée

Définir les mêmes variables de mode et chemins de runtime pour tous les services.
Le certificat doit inclure le nom `localhost` pour la liaison UI/Core et le nom
utilisé par le navigateur. La clé TLS est un fichier canonique privé 0600.

```sh
export IATB_DEPLOYMENT_MODE=AUTHENTICATED
export IATB_AUTH_MODE=authenticated
export IATB_AUTH_ORIGIN=https://localhost:8000
export IATB_AUTH_TLS_CERT=/chemin/absolu/tls.crt
export IATB_AUTH_TLS_KEY=/chemin/absolu/tls.key
# Dans des terminaux distincts, avec le même environnement et le runtime isolé :
node App/Core/Server/server.js
node App/Core/Router/router.js
node App/Indicators/Engine/indicator_service.js
node App/UI/Gateway/ui_service.js
```

Ces commandes ne démarrent pas Trading Engine. Ne pas exposer les ports des
Engines, du Router ou de Core comme des interfaces navigateur. HTTPS est également
requis à travers le tunnel SSH. Les ports usuels restent UI 8000, Core 8001,
Router 8021, Indicator 8012 et peuvent être surchargés pour une copie de test.

## Profil et isolation réellement implémentés

`/login` : email, mot de passe, affichage/masquage, chargement et erreurs génériques.
Pas d'inscription publique ni de récupération web simulée. Mot de passe oublié :
contacter l'opérateur CLI. Profil reste dans Paramètres : nom, email, rôle,
changement de mot de passe, sessions, révocation, activité récente, déconnexion.
Les changements d'identité et secrets exigent le mot de passe courant ; changement
d'email ou de mot de passe exige une nouvelle connexion.

Tokens aléatoires 256 bits, SHA-256 stocké, durée absolue 1 heure, maximum 20
sessions actives par compte, dernière activité enregistrée sans prolonger la durée.
État et révocations persistent aux redémarrages. Échecs de connexion limités en
SQLite à 5 par email/5 minutes, 30 par origine réseau interne/5 minutes, et 2 KDF
simultanés par processus. Le proxy ne fait pas confiance aux headers IP du navigateur.
Une forte charge de connexions derrière Gateway peut donc atteindre le quota commun.

Les profils, sessions, préférences, secrets et réglages legacy autorisés sont
associés à l'identité de session. Les lectures d'anciens réglages globaux ne sont
pas utilisées comme fallback privé. Le navigateur reçoit son propre état chiffré (limite totale 256 Kio, 256 clés,
128 Kio par valeur)
stocké côté serveur ; ses anciens localStorage/sessionStorage restent physiquement
inchangés et ne sont pas importés automatiquement dans le mode authentifié.

GUEST accède uniquement aux métadonnées natives et aux lectures publiques
locales explicitement autorisées ; il ne déclenche ni collecte de bougies ni
calcul. Les appels de données avec coût fournisseur et les calculs des utilisateurs
sont plafonnés à 300 par compte et par fenêtre de cinq minutes pour chaque voie.
Les requêtes de refresh forcé restent interdites.

Les indicateurs Custom sont validés/compilés par l'Engine existant et conservés
par utilisateur, sans écriture dans le Registry Custom global. Le calcul utilise
l'Engine existant via une preuve Core liée au propriétaire, aux arguments et à
l'action. L'Engine redemande à Core la validité de la session avant calcul.
L'autre utilisateur ne voit pas la définition et ne peut pas la calculer.
Calculs natifs, JSON V2 et Visual Renderer V2 restent inchangés.

Wallets : accès par identifiant de session, réglages chiffrés dans l'espace privé,
aucune adoption automatique d'un wallet global par le premier utilisateur. La clé
wallet existante est requise ; un runtime authentifié ne la régénère jamais.

## Données historiques : attribution explicite hors ligne

Arrêter les writers avant chaque import. La CLI exige le propriétaire OS non-root,
un TTY réel, une authentification ADMIN, un compte cible actif non-GUEST et deux
confirmations, dont `IMPORT LEGACY OWNER`. Aucun propriétaire n'est déduit du
navigateur ni choisi automatiquement.

```sh
# Chemins absolus existants, fichiers privés 0600, aucune donnée GEN-1 en recette.
export IATB_PORTFOLIO_DB=/chemin/prive/portfolio.db
node App/CLI/users.js import-legacy-portfolio CL_COMPTE_CIBLE
export IATB_USER_DB=/chemin/prive/user_data.db
node App/CLI/users.js import-legacy-setting CL_COMPTE_CIBLE
```

Portfolio copie les cinq tables historiques vers les tables du propriétaire,
uniquement si elles sont vides. Settings demande le scope et la clé exacts :
`app_profile`, `app_selection`, `configuration`, `swap_bridge`, `bank_transfer`,
`bank_wallets`, `notifications`, `credits` ou `token_usage`. Une ligne source est
attribuable à un seul compte. Le contenu copié est chiffré pour les Settings ;
la source est conservée. Pour `bank_wallets`, la copie est rangée sous
`wallets:client:<compte>`, les enveloppes sont vérifiées avec la clé originale
`Security/wallet_master.key` et restent inchangées. Aucun secret n'est régénéré.
Chaque commande produit d'abord une sauvegarde SQLite native privée et conserve
une revendication d'attribution dans la même transaction que la copie. Un conflit
ou une interruption annule la copie ; ne jamais supprimer la revendication pour
forcer un second propriétaire. Un import ne fusionne pas des données existantes.

Les fichiers JSON/JSON dans .dat Custom Indicator, Strategy V1/V2 et Mosaïque
sont attribuables individuellement via la même CLI :

```sh
export IATB_LEGACY_DEFINITION=/chemin/prive/definition.json
node App/CLI/users.js import-legacy-definition CL_COMPTE_CIBLE
# Le terminal demande INDICATOR, STRATEGY ou MOSAIC.
```

La CLI réutilise les validateurs canoniques sans modifier leurs calculs. Elle
refuse les collisions et IDs BuiltIn, préserve le fichier source, et revendique
son attribution dans la même transaction que la copie privée. Les définitions
Indicator sont chiffrées dans clients.sqlite ; Strategy et Mosaïque utilisent
IATB_USER_DB comme les dispatchers propriétaires. Les Settings du dashboard
s'importent séparément par leur scope/clé. Aucun fichier arbitraire n'est exécuté
ni automatiquement adopté. Seuls les formats canoniques validés sont convertis.

## Paramètres et services authentifiés

Les champs API existants sont acceptés, y compris feeRecipient et RPC. Les RPC
personnels exigent HTTPS et une origine approuvée côté serveur : origines
PublicNode prévues par `settings_policy.js`, complétées par
`IATB_AUTH_RPC_ORIGINS` (origines séparées par des virgules, configuration opérateur).
Aucun domaine arbitraire fourni par le navigateur n'est accepté. Les chemins et
clés RPC sont chiffrés dans les réglages privés. Effacer une clé API exige le
mot de passe courant, y compris via la fenêtre de réauthentification de l'UI.

Les tests OpenAI/X/0x utilisent le secret personnel ; OpenAI passe par une
capacité Supervisor signée et Core conserve la clé. Les appels externes facturés
ne sont pas exécutés dans la recette fictive. Les réglages Supervisor MOCK et
OPENAI_API sont privés. REMOTE_LLM n'est pas ouvert sans décision sur les
origines réseau et les credentials. Les sondes Core/UI utilisent le certificat
TLS épinglé en mode authentifié.

## Limites fonctionnelles conservées dans la livraison TEST 2.2

- L'exécution réelle de Trading/transferts/swaps reste interdite. Les prévisualisations
  et historiques privés ne valent pas validation d'une chaîne d'exécution complète.
  Une décision explicite reste requise pour accepter cette restriction fonctionnelle.
- Le test email historique dépend d'Apple Mail et n'est pas migré vers Linux/SMTP.
  Il reste refusé. Sa suppression ou son remplacement nécessite une décision explicite.
- REMOTE_LLM et les destinations RPC hors allowlist nécessitent un choix opérateur.
- Les historiques ne sont jamais automatiquement attribués. Les imports explicites
  des formats canoniques sont qualifiés sur fixtures ; une installation réelle
  exige un inventaire opérateur et ne fait pas partie de cette recette.
- La recette complète de chaque écran métier et de tous les échanges privés entre
  Engines n'est pas achevée. Les pages peuvent encore présenter des commandes refusées.
- Pas de qualification du snapshot expérimental avec les nouveaux writers.
- La recette Docker à 13 services, TLS, socket UI, isolation et redémarrage a réussi
  sur `a9d61354`. Elle n'a accédé à aucune stack GEN-1 ni donnée réelle.

Le refus d'une route démontre son confinement, pas sa migration fonctionnelle.
La livraison TEST ne vaut pas acceptation de ces restrictions en production.
La recette GEN-1 et une qualification des fonctions encore indisponibles restent
nécessaires avant une promotion stable. Voir RELEASE_2.2.0.md pour l’état courant.

## Tests et preuves

```sh
# Playwright/Firefox requis pour le volet navigateur existant du projet.
IATB_FIREFOX_CONTAINER=1 bash App/Tools/CI/test_user_management_v1.sh
node App/Tools/CI/user_management_route_inventory.js
```

La suite utilise des bases et comptes fictifs dans /tmp. Le test intégré démarre
les vrais Core, Gateway, Router et Indicator ; aucun Trading Engine. Firefox
réalise une connexion et une modification du Profil. Alice et Bob ont des
réglages indépendants ; un Custom d'Alice n'est ni listé ni calculable par Bob.
Le test du coffre fabrique un RSA réel puis vérifie déchiffrement, ré-encryption,
reset et conservation du fichier original.

`Documentation/UserManagement/route-inventory.json` inventorie les routes Core
littérales et leur politique. Les préfixes dynamiques non autorisés échouent fermés.
`Documentation/UserManagement/VALIDATION.md` consigne les résultats exécutés,
les exclusions et les skips ; aucun résultat de test dépendant de services
absents ne doit être présenté comme un succès.

## Retour arrière hors ligne

Ne jamais restaurer un seul fichier pendant que Core/CLI/Engines écrivent.
Conserver l'image et le commit précédents, la sauvegarde complète de la stack,
la sauvegarde SQLite avant migration, les clés originales et les configurations.
Après arrêt des writers, restaurer dans **un nouveau répertoire privé** ; vérifier
integrity_check, foreign_key_check, déchiffrement des identités et inventaire des
wallets/annexes avec les clés d'origine. Relancer le commit précédent pointé sur
cette copie après validation opérateur. Garder les données récentes à part pour
réconciliation ; un rollback de sauvegarde perd les écritures intervenues après
celle-ci si elles ne sont pas réconciliées. Aucun volume n'est supprimé.
