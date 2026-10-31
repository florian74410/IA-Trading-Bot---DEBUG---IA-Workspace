# GEN-1 — installation, maintenance et rollback v1.1

## État et limites

Non installé par cette livraison. Aucun accès SSH administrateur vérifié dans la session de développement. Aucune modification Caddy, aucun test HTTPS distant. La cible fournie est GEN-1 169.58.177.163 et https://ia.iatb.duckdns.org ; ni la résolution DNS ni l'état de ces services n'ont été vérifiés ici.

Python 3.10+ avec SQLite et scrypt ; aucun paquet pip requis. Interface HTML/CSS/JS sans framework ni CDN. Ne jamais exposer ce backend Basic Auth au WAN. Le code n'implémente ni session MFA ni confiance dans un proxy : les en-têtes Forwarded/X-Forwarded-* et X-Remote-User sont refusés.

## Phase A — opérateur humain sur GEN-1

Revoir la PR et son SHA exact, les tests et la CI. Exécuter les commandes suivantes depuis une session administrateur humaine autorisée ; ne pas utiliser le compte IA limité et ne pas élargir ses droits. Les commandes sudo sont réservées à cet opérateur, jamais accessibles au panneau.

Sur le poste administrateur, depuis un clone vérifié :

```bash
# Remplacer par le SHA approuvé de la PR, jamais par une branche mouvante.
REV=REMPLACER_PAR_LE_SHA_APPROUVE
git cat-file -e "$REV^{commit}"
git archive --format=tar "$REV" 'AI Agent' > iatb-admin-reviewed.tar
sha256sum iatb-admin-reviewed.tar
# Transférer cette archive par le canal administrateur approuvé, puis comparer le hash sur GEN-1.
```

Sur GEN-1, inspecter d'abord `id`, `python3 --version`, `python3 -c 'import sqlite3,hashlib; print(sqlite3.sqlite_version); assert hasattr(hashlib,"scrypt")'`, `getent passwd iatb-admin-panel`, `getent group docker`, `sudo ss -ltnp` et les éventuelles installations existantes. Ne pas écraser un utilisateur ou une installation existante sans revue. Pour une première installation :

```bash
sudo useradd --system --user-group --home-dir /nonexistent --shell /usr/sbin/nologin iatb-admin-panel
sudo install -d -o root -g root -m 0755 /opt/iatb-admin
sudo tar --no-same-owner -xf iatb-admin-reviewed.tar -C /opt/iatb-admin
sudo chown -R root:root /opt/iatb-admin
sudo chmod -R go-w /opt/iatb-admin
sudo install -d -o iatb-admin-panel -g iatb-admin-panel -m 0700 /var/lib/iatb-admin-panel
sudo -u iatb-admin-panel python3 '/opt/iatb-admin/AI Agent/AdminPanel/server.py' init-admin --credential-file /var/lib/iatb-admin-panel/credentials.json
sudo -u iatb-admin-panel python3 '/opt/iatb-admin/AI Agent/AdminPanel/preflight.py' --credential-file /var/lib/iatb-admin-panel/credentials.json
```

Le preflight doit sortir avec code 0. Il contrôle l'identité, les groupes, l'écriture du code, l'accès Docker et les credentials. Il ne prouve pas à lui seul l'isolation RELEASE : contrôler séparément les ACL Linux, les groupes supplémentaires, les montages et l'accès aux chemins de production. Utiliser des projections SQLite expurgées, lisibles mais non inscriptibles par le service. Les DB sont facultatives ; leur absence est visible dans l'interface.

```bash
cd /opt/iatb-admin
python3 -m unittest discover -s 'AI Agent/Tests' -p 'test_*.py' -v
sudo install -o root -g root -m 0644 'AI Agent/AdminPanel/systemd/iatb-admin-panel.service.example' /etc/systemd/system/iatb-admin-panel.service
sudo systemd-analyze verify /etc/systemd/system/iatb-admin-panel.service
sudo systemctl daemon-reload
sudo systemctl start iatb-admin-panel
sudo systemctl status iatb-admin-panel --no-pager
sudo ss -ltnp '( sport = :18082 )'
curl --fail http://127.0.0.1:18082/healthz
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:18082/api/permissions
curl --fail --user admin http://127.0.0.1:18082/api/permissions
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://127.0.0.1:18082/api/requests
```

Attendus : bind uniquement 127.0.0.1:18082 ; health 200 ; API sans auth 401 ; API avec mot de passe saisi interactivement 200 et `DENIED_NO_CONTROLLER` ; POST 405. Consigner SHA, heure UTC, état systemd et résultats expurgés. N'activer au démarrage (`systemctl enable`) qu'après recette du tunnel. Aucune règle pare-feu entrante 18082 n'est nécessaire.

Depuis le poste administrateur :

```bash
ssh -N -o ExitOnForwardFailure=yes -o StrictHostKeyChecking=yes -L 127.0.0.1:18082:127.0.0.1:18082 ADMIN_SSH@169.58.177.163
```

Utiliser une identité humaine non-root déjà autorisée, une clé hôte préalablement vérifiée et une configuration SSH limitant le forwarding à 127.0.0.1:18082. Ouvrir http://127.0.0.1:18082 et tester les sections, filtres, inspecteur et brouillon Soul. Les brouillons ne sont pas soumis automatiquement à GitHub.

## Phase B — bloquée dans v1.1

Ne pas ajouter de reverse_proxy de ce backend à Caddy public. Le fonctionnement MFA/sessions/CSRF et l'accès réseau privé restent à implémenter et à recetter. Aucun cookie de session n'est émis aujourd'hui ; tous les verbes de mutation sont refusés. Ce refus n'est pas un remplacement de CSRF lorsqu'une future route d'écriture sera ajoutée.

Avant toute future modification Caddy, l'opérateur doit lire et sauvegarder la configuration réelle :

```bash
sudo cat /etc/caddy/Caddyfile
sudo cp --preserve=all /etc/caddy/Caddyfile /etc/caddy/Caddyfile.before-iatb-admin
sudo caddy validate --config /etc/caddy/Caddyfile
```

Conserver les sites/routes `iatb`, `hardware`, `architecture`, `trading`. Vérifier MFA obligatoire, audiences/identités, expiration et révocation de session, cookies Secure/HttpOnly/SameSite, CSRF/Origin, hôtes autorisés, suppression puis reconstruction des proxy headers par le seul proxy de confiance, réseau privé et absence d'accès direct. Tester aussi l'échec de connexion externe et les routes existantes. Ne recharger Caddy qu'après revue du diff et validation. Une sauvegarde existante ne doit pas être écrasée lors d'une seconde tentative.

## Maintenance

Code root-owned, credentials privés hors Git. Rotation du mot de passe hors ligne après arrêt du service : conserver le hash précédent dans une sauvegarde privée pour rollback, retirer le fichier actif puis relancer init-admin. Ne jamais publier ces sauvegardes. Sauvegarder les DB via l'API SQLite backup, pas par copie d'un fichier en écriture. L'audit possède des triggers anti-UPDATE/DELETE ; le propriétaire Linux de la DB peut les contourner : protection OS indépendante et conservation externe nécessaires. Le panneau lit l'audit avec mode=ro et query_only.

Pour une mise à jour : stopper uniquement iatb-admin-panel, conserver le code précédent dans un répertoire root-owned versionné par SHA, installer l'archive revue, repasser tests/preflight/systemd et recette HTTP avant remise en service. Ne pas toucher aux conteneurs IA-TB ou aux bases RELEASE.

## Rollback

```bash
sudo systemctl stop iatb-admin-panel
sudo systemctl disable iatb-admin-panel
```

Fermer le tunnel. Restaurer l'archive du SHA précédemment validé et son unité revue, sans écraser les credentials ni les DB, puis daemon-reload, preflight et recette avant start. Aucune configuration Caddy n'a été modifiée par v1.1. Si une modification ultérieure échoue : restaurer la sauvegarde Caddy après revue, `caddy validate`, puis `systemctl reload caddy` et tester les quatre routes existantes.
