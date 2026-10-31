# IA-TB DEBUG 2.1 — P1.4 — Relevé des frontières réseau GEN-1

**Contrôle :** diagnostic en lecture seule exécuté par Overflow sur GEN-1, transmis le 14 octobre 2026.  
**Rattachement :** [Trust Boundary Contract v1](../Architecture/AUTH_DEBUG_2.1_TRUST_BOUNDARIES.md) · [Security Endpoint Audit P1.3](AUTH_ENDPOINT_AUDIT_v1.md).  
**Périmètre :** ports hôte, publications Docker, modes réseau et ports en écoute dans le namespace du Router, recherche de quelques relais/proxy par nom de processus.  
**Intervention :** aucune configuration modifiée, pas d'exposition ajoutée, pas d'ordre de trading ni de donnée sensible consultée.

## 1. Observations

| Sonde | Observé | Conclusion bornée |
| --- | --- | --- |
| `ss -lnt` sur l'hôte | `127.0.0.1:25`, `[::1]:25`, `127.0.0.53:53`, `127.0.0.54:53`, `0.0.0.0:22`, `[::]:22`, `0.0.0.0:5355`, `[::]:5355` | Aucun socket TCP IA-TB sur le réseau hôte dans cette capture ; SSH et 5355 sont des écouteurs hôte exposés à leurs interfaces respectives, selon filtrage externe |
| `docker ps ... --format Ports` | Champ `PORTS` vide pour les 13 conteneurs DEBUG | Aucun port publié dans cette liste |
| `docker inspect ... HostConfig.PortBindings` | `{}` pour les 13 conteneurs | Aucune publication de port configurée au niveau HostConfig de ces conteneurs |
| `docker inspect ... NetworkMode` | 12 conteneurs en `network=container:<id-router>`; Router en `iatb-debug-stack_debug-egress` | Espace réseau **partagé** ; il ne constitue pas une frontière de confiance entre processus IA-TB |
| `nsenter ... ss -lnt` | Écouteurs **sur 127.0.0.1 interne** : 3000, 8000, 8001, 8012, 8013, 8014, 8015, 8017, 8018, 8019, 8020, 8021 | Douze ports IA-TB détectés et limités au loopback du namespace partagé ; absence de 8016 |
| Namespace Docker, DNS | `127.0.0.11:40449` | Résolveur DNS Docker, **pas** une API IA-TB |
| `ps -eo comm= | ... grep` | Aucun processus nommé `socat`, `nginx`, `caddy`, `haproxy` ou `traefik` | Ces noms n'étaient pas visibles ; cela n'exclut pas tous les relais, un service masqué, les règles NAT ni un proxy distant |
| Trading | Pas de port 8016 dans le namespace ; le précédent audit signalait aucun conteneur Trading | Conforte la désactivation du moteur LIVE en DEBUG au moment de l'audit |

**Vérification croisée :** cohérent avec le `compose.debug.stack.yml` canonique et le rapport `iatb vps audit` du 13 octobre 2026 (13 conteneurs actifs, 0 port IA-TB hôte parmi 22/25/53/5355, `authMode=disabled`, Trading absent).

### Remarques importantes

- `127.0.0.1` à l'intérieur du namespace Docker commun **n'est pas le loopback du VPS**. Il protège contre un accès direct par le réseau du bridge **dans le contexte observé**, mais tous les conteneurs partageant ce namespace peuvent joindre les services entre eux.
- Les montages de volumes, l'UID/GID commun et l'accès au secret CP/1 doivent être audités et restreints avant publication. **Une preuve CP/1 machine ne remplace jamais une autorisation ADMIN/USER/GUEST liée à une session.**
- Les ports hôte `22` et `5355` écoutent sur toutes les interfaces IPv4 et IPv6 selon `ss` ; le **filtrage entrant effectif** (UFW/nftables, fournisseur Contabo) n'a pas été inspecté. Le 5355 peut correspondre à un résolveur LLMNR ; son processus propriétaire n'est pas déterminé par cette commande et doit être confirmé si un audit de durcissement hôte est envisagé.
- Les noms des conteneurs observés, les ports et l'absence de `PortBindings` ne prouvent ni la résistance à une attaque depuis un autre conteneur ni l'inaccessibilité de l'ensemble de l'hôte depuis Internet.

## 2. Décision P1.4

**La topologie DEBUG privée concorde avec le contrat de conception.** L'architecture de confiance documentée en P1.4 peut être **clôturée comme point de conception et de diagnostic**, avec les quatre principes précédemment approuvés par Overflow et la contrainte « sécurité sans régression notable » ; elle **n'est pas une implémentation sécurisée déjà testée**.

### Contrôles restant obligatoires avant ouverture / utilisation réelle

- [ ] Implémenter Core Auth, validation serveur des sessions/rôles/ownership, autorisations action par action Router/Engine et filtrage anti-en-têtes usurpés ; fournir des tests 401/403, IDOR, CSRF, GUEST et révocation.
- [ ] Isoler matériellement les secrets Auth et les autorisations des services CP/1, comparer le coût d'une segmentation réseau/UDS et auditer permissions des volumes persistants.
- [ ] Démontrer les règles NAT, pare-feu de l'hôte et filtrage Contabo, provenance des proxys, et vérifier l'accès effectif depuis une origine non autorisée **sans requête destructive**.
- [ ] Benchmarker p50/p95/p99 et débit à charge équivalente ; les objectifs +5 % p95 / +10 % p99 sont **provisoires**, non mesurés.
- [ ] Mettre en place HTTPS/TLS avant tout login public, séparer DEBUG/RELEASE, maintenir Trading LIVE désactivé en DEBUG.

Ces éléments relèvent respectivement des phases Auth/RBAC, de la définition des versions et du jalon **Phase 7 — ouverture réseau**. **Aucune publication Internet ni activation d'Auth sans implémentation ne découle de P1.4.**
