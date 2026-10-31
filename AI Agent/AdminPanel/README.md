# IA-TB AI Agent Admin Control Center v1.1

Panneau de consultation authentifié, propositions locales et préparation GEN-1. **Non déployé. Phase B MFA/HTTPS non implémentée. Aucun contrôleur privilégié raccordé.**

HTML5, CSS3 bleu électrique, JavaScript natif et Python standard (3.10+). Aucune dépendance pip, aucun CDN, aucun framework UI. Code et fonctions limités à l'administration IA-TB DEBUG.

| Section | Fonction réellement disponible |
| --- | --- |
| Dashboard | Observations locales, services non configurés/non vérifiés explicitement signalés |
| Memory | Consultation/recherche des 100 dernières entrées d'une projection SQLite facultative ; brouillon de correction local |
| Soul | Inspection Identity, Personality, Objectives, Behavior ; brouillon local copiable |
| Permissions | Règles déclarées séparées du droit effectif `DENIED_NO_CONTROLLER` |
| Requests | Risques, portée, durée, quota, expiration et décision enregistrée dans l'inspecteur ; aucune décision depuis le panneau |
| Skills | Catalogue, versions et actions nécessaires ; aucune exécution |
| Journal général | Projection filtrable des événements d'audit et de création des demandes ; heures UTC et corrélations |
| Connections | Destinations non sensibles et absence de connecteurs signalée ; aucun test distant implicite |
| Audit | Projection de la base d'audit distincte, append-only par triggers SQLite |

Recherche et filtres portent sur le lot de 100 éléments chargé par source, pas sur l'historique complet. Les corrections sont des brouillons en mémoire navigateur : **aucun envoi GitHub, aucune persistance, aucune modification Soul/Memory**. Copier le brouillon et le soumettre dans une PR revue, avec CI et approbation indépendante. La base originale n'est jamais remplacée. Ne pas saisir de secrets dans les propositions.

## API et sécurité

`server.py` écoute exclusivement `127.0.0.1:18082`. Authentification Basic ADMIN indépendante avec scrypt, réservée à un tunnel SSH administrateur. Host unique/allowlist, refus des proxy headers, CSP, no-store, anti-frame, huit threads maximum, timeout et limitation des échecs d'authentification. Le bind public est refusé aussi par le constructeur serveur. Les écritures HTTP restent 405 ; aucune commande système n'est exposée.

GET `/api/{dashboard,connections,permissions,denied,requests,audit,skills,memory,soul,journal,overview}`. `/healthz` est public uniquement sur loopback. Les chemins/query strings non prévus sont refusés. Aucun cookie de session n'est créé. Les bases facultatives sont ouvertes `mode=ro` + `query_only` : `IATB_ADMIN_REQUESTS_DB`, `IATB_ADMIN_AUDIT_DB`, `IATB_ADMIN_MEMORY_DB`, avec chemins absolus privés et projections préalablement expurgées. La redaction regex est une défense complémentaire et ne garantit pas la détection de tous les secrets.

Un `ALLOW` d'audit signifie validation d'intention et apparaît `VALIDATED`, jamais succès présumé. Une demande est un événement `PERMISSION/PENDING` à sa date de création ; sa décision courante reste un champ séparé. Aucun événement de décision n'est inventé à cette date. Les métadonnées absentes sont null. Le journal ne publie que des événements observables et aucun raisonnement privé du LLM. Les types SYSTEM/CHATGPT/DECISION_SUMMARY/GITHUB/SSH/VPS ne sont pas alimentés sans producteur vérifié.

## Vérifier et installer

```bash
python3 -m unittest discover -s 'AI Agent/Tests' -p 'test_*.py' -v
python3 -m py_compile 'AI Agent/AdminPanel/server.py' 'AI Agent/AdminPanel/preflight.py'
node --check 'AI Agent/AdminPanel/app.js'
```

[Installation, maintenance et rollback](DEPLOY_V11.md) : procédure exacte Phase A, preflight sous utilisateur de service, systemd, tunnel administrateur et recette HTTP. `DEPLOY_V1.md` est la documentation historique v1, remplacée pour cette livraison par DEPLOY_V11.md.

[Rapport de validation](validation/REPORT.md) et captures : [desktop](validation/desktop.jpg), [390 px](validation/mobile.jpg), [proposition Soul](validation/soul-proposal.jpg). Les captures utilisent des snapshots des fichiers locaux dans un serveur de recette, avec bannière explicite ; elles ne prouvent aucune connexion à GEN-1.

## Travail restant avant exécution privilégiée

Contrôleur indépendant avec identité protégée, validation atomique des quotas/expiration au point d'exécution ; connecteurs GitHub et SSH à opérations fermées ; soumission et validation des propositions GitHub ; décisions administratives réellement vérifiées ; MFA, sessions, CSRF et proxy privé revus. Les boutons Approuver/Refuser restent désactivés. La configuration des secrets et connexions reste hors UI. Aucune preuve de déploiement/HTTPS n'est fournie sans exécution réelle.
