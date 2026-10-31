# IA-TB AI Agent — Admin Panel 0.3

**Statut : CODE ET TESTS PRÉPARÉS, NON DÉPLOYÉ SUR GEN-1.**
Ce service n'accorde AUCUNE permission, n'a AUCUN contrôleur d'exécution,
n'interagit PAS avec Docker et ne publie PAS de site public.

## Composants

- \`index.html\`, \`app.css\`, \`app.js\` : interface Cyber Nexus compacte responsive,
  six onglets, tri visuel par état, filtres, détails, actualisation et indicateurs.
  En ouvrant \`index.html\` comme fichier local, des données d'exemple clairement
  marquées **PREVIEW** sont affichées, sans aucune requête.
- \`server.py\` : API **GET uniquement**, authentification ADMIN distincte par hash
  scrypt, refus des hôtes inattendus (anti DNS rebinding), CSP stricte,
  en-têtes anti-cache et anti-frame, limitation des échecs et masquage minimal
  des secrets. Liaison forcée à \`127.0.0.1\`.
- \`/api/{permissions,denied,skills}\` : lecture des manifests du dépôt.
- \`/api/{requests,audit,memory}\` : lecture des bases SQLite **mode=ro**
  explicitement configurées, sans autorisation d'écriture.
  Si une base n'est pas configurée, le panneau dit \`not_configured\`.
- \`/api/overview\` : métadonnées non privilégiées.
- Aucun \`POST\` autorisé, aucune capacité « Approuver », « Refuser »,
  « Deploy », « Stop » ou « Shell ». Les boutons d'approbation du détail
  sont visiblement désactivés.

## Hébergement recommandé : GEN-1, service à part

### Étape 1 (préférée) : SSH + ADMIN, aucune exposition publique

1. Après revue du commit précis, installer les **fichiers du panneau uniquement**
   dans un répertoire appartenant à root, par ex. \`/opt/iatb-admin/AI Agent/AdminPanel/\`,
   ainsi que les manifests nécessaires sous \`/opt/iatb-admin/AI Agent/{Rules,Skills,Engine/SkillLoader}\`.
   Ne pas faire de copier/coller non vérifié depuis une branche évolutive.
2. Créer l'identité dédiée \`iatb-admin-panel\`, sans sudo, sans groupe docker,
   sans shell interactif, sans droit d'écriture sur le code ni accès à RELEASE.
3. Créer \`/var/lib/iatb-admin-panel\`, propriétaire de l'identité de service,
   permissions \`0700\`. Garder la base de credentials **hors du dépôt**.
4. En tant que cet utilisateur non privilégié, initialiser le hash :

   \`\`\`bash
   python3 "/opt/iatb-admin/AI Agent/AdminPanel/server.py" init-admin \
       --credential-file /var/lib/iatb-admin-panel/credentials.json
   \`\`\`

   La commande demande un mot de passe ADMIN distinct (minimum 16 caractères)
   sans l'afficher dans l'historique de shell. Ne jamais publier ce fichier.

5. Après revue des fichiers, démarrer le service **en loopback** avec le
   modèle \`systemd/iatb-admin-panel.service.example\` fourni. Contrôler localement
   le bind \`127.0.0.1:18082\` (et **pas** \`0.0.0.0\`).

6. Depuis la machine administrateur avec une **identité SSH humaine dédiée**
   disposant explicitement du port forwarding vers loopback seulement :

   \`\`\`bash
   ssh -N -L 18082:127.0.0.1:18082 <admin-ssh>@<GEN1>
   \`\`\`

   Puis ouvrir dans Firefox : \`http://127.0.0.1:18082/\`.
   Le navigateur demandera le compte \`admin\` et son mot de passe distinct.
   Le trajet local-vers-GEN-1 est chiffré par SSH; le serveur HTTP local **ne
   doit jamais** être exposé sur un port WAN. L'authentification HTTP Basic
   ne doit jamais transiter sur HTTP public.

**Important :** le port forwarding peut être interdit sur le compte SSH actuel.
Ne pas débrider un compte IA/MCP ni le rôle de déploiement pour le permettre :
configurer/valider un accès humain distinct, limité à \`127.0.0.1:18082\`.

### Étape 2 : HTTPS privé + authentification ADMIN forte

Pour l'intégration à l'interface IA-TB, exposer éventuellement
\`/admin/agent\` via un reverse proxy privé Caddy, mais **uniquement**
après : réseau privé VPN (WireGuard/Tailscale ou équivalent), HTTPS valide,
compte ADMIN de DEBUG indépendant de RELEASE, MFA/WebAuthn, contrôle des rôles,
cookies et CSRF dans le frontal adapté, sécurité des websockets et audits.
L'actuelle auth HTTP Basic n'est pas un remplacement d'Auth21.
Il faudra refaire la recette d'authentification et de proxy avant tout
accès autre que SSH. Une simple URL HTTPS publique + mot de passe n'est pas
la cible recommandée.

### DB facultatives (seulement après isolation Linux)

Variables de service **facultatives**, chemins absolus **hors dépôt** :

- \`IATB_ADMIN_REQUESTS_DB\` : base des demandes;
- \`IATB_ADMIN_AUDIT_DB\` : audit distinct;
- \`IATB_ADMIN_MEMORY_DB\` : mémoire générale.

Si elles ne sont pas présentes, les sections le disent. Le service doit avoir
uniquement les permissions Linux nécessaires à lire ces fichiers, pas les
écrire ni accéder aux données sensibles. Les contenus sont bornés à 100
lignes et assainis pour l'affichage, mais la redaction regex ne garantit
pas la suppression de tous les secrets : ne jamais raccorder de données
sensibles non relues. Ne pas modifier les permissions des répertoires
RELEASE/DEBUG pour faciliter cet accès; préférer une projection
indépendante, filtrée et en lecture seule.

## Architecture

\`\`\`
[PC ADMIN] -- [SSH humain restreint / tunnel chiffré]
                               |
                               v
                    GEN-1 127.0.0.1:18082
                               |
            [Admin Panel, utilisateur sans privilège]
                      /            \
          [manifests déclaratifs] [snapshots SQLite read-only]
                               X
                  SSH commande / Docker / RELEASE
\`\`\`

Le code du panneau est délibérément **différent de l'autorité finale**
des permissions. Il serait dangereux de mettre une clef d'approbation
dans le dépôt Git public, l'UI ou le processus de l'agent.

## Tests

\`\`\`bash
python3 -m unittest discover -s "AI Agent/Tests" -p 'test_*.py' -v
python3 -m py_compile 'AI Agent/AdminPanel/server.py'
node --check 'AI Agent/AdminPanel/app.js'
\`\`\`

## Réserves de recette (avant toute activation réelle)

- Vérifier l'identité OS, ownership, mode des credentials, restrictions
  systemd, pare-feu et absence de bind public.
- Audit externe de la sécurité du serveur HTTP, des dépendances et des
  permissions des DB.
- Tester la configuration SSH humaine et le port-forward restreint.
- Confirmer que l'API ne fournit ni secrets, ni données RELEASE, ni
  journal non expurgé.
- Valider l'authentification, l'absence de mutations, les tests et la CI
  sur le **SHA exact**.
- Ne pas réutiliser le rôle ADMIN de RELEASE ni autoriser la signature
  des approvals depuis le processus de l'agent.

**Désactivation et rollback :** arrêter uniquement le service
\`iatb-admin-panel\` et retirer la redirection SSH. Aucun conteneur IA-TB,
volume ou base RELEASE n'est affecté.
