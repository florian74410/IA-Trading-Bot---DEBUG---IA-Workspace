# Validation IA-TB Admin v1.1 — 31 octobre 2026

## Verdict

Livraison partielle pour consultation et revue du code. **Pas d'autorisation de mise en production ni d'exécution privilégiée. Non déployé sur GEN-1.** Phase A préparée ; activation effective conditionnée à la recette Linux sous identité de service et au tunnel administrateur. Phase B non implémentée.

## Sources inspectées

Branche de départ `work/ai-agent-admin-v1`, SHA `1e21fc8b758b0050e0c0fab88b5df9318b98ae82`, PR #3 ouverte en draft. Historique de l'AdminPanel et du PolicyEngine, règles Authorized/Non-Authorized, RequestStore, schémas SQLite Audit/Memory, tests, unité systemd et documentation lus. Aucune instruction AGENTS.md trouvée dans le checkout. AGENT_ROLE.md concerne la promotion stable : aucune promotion stable effectuée.

CI de départ réellement vérifiée : runs 41211774066 et 41211756010, SHA de départ exact, `completed/success`. Ce succès ne constitue pas une preuve de déploiement. Le workflow SSH manuel existant est limité à une autre branche et n'a pas été exécuté. Aucun agent SSH local disponible (`ssh-add -l` : aucune connexion à un agent d'authentification). Aucune tentative root, aucun secret GitHub extrait.

## Vérifications exécutées localement

- Python 3.12.14 / Node v24.22.1.
- `python3 -m unittest discover -s 'AI Agent/Tests' -p 'test_*.py' -v` : **43 tests réussis**.
- Compilation server.py et preflight.py : réussie ; syntaxe app.js : réussie ; `git diff --check` : réussi.
- HTTP réel sur serveur localhost éphémère : Basic Auth, faux rôle, Host inattendu et doublonné, proxy identity headers, routes fermées, chemins encodés/traversée, tentatives SQL/shell en URL et absence de droit d'écriture.
- Limitation du bind à loopback, redaction de secrets JSON et tokens usuels, refus de fichier Soul symlink, audit append-only et conservation du code retour 0, corrélation, SHA et durée.
- Les tests PolicyEngine existants couvrent default deny, HARD_DENY prioritaire, interdiction d'auto-approbation, scopes invalides et absence d'autorité indépendante.
- Navigateur Chrome de recette : dashboard, navigation Soul, inspection identity.md, saisie et copie d'une proposition, confirmation « aucune modification appliquée » ; boutons Approuver/Refuser désactivés.
- Recette responsive à largeur de viewport de contenu 390 px (iframe, pas téléphone physique). Débordement d'en-tête détecté puis corrigé et capture renouvelée. Animations CSS désactivées via `prefers-reduced-motion` ; pas de test automatisé OS de cette préférence.

## Captures

[Desktop](desktop.jpg), [390 px](mobile.jpg), [inspecteur/proposition Soul](soul-proposal.jpg). Le serveur de recette sert des snapshots produits par les collecteurs locaux et une bannière `QA · SNAPSHOT LOCAL`. Aucune donnée de VPS, aucun événement simulé, aucune preuve d'authentification de production. Les tests HTTP utilisent séparément le vrai backend authentifié.

## Matrice fonctionnelle

| Fonction | État v1.1 | Limite |
| --- | --- | --- |
| Dashboard / Connections | Actif localement | Aucune sonde distante ni configuration de secrets |
| Memory / Soul | Lecture et brouillon local | Recherche limitée au lot chargé ; aucune PR automatique |
| Permissions | Déclaré/effectif distinct | Toujours refusé sans contrôleur raccordé |
| Requests | Consultation et détails | Aucune décision administrative soumise par l'UI |
| Skills | Catalogue et actions requises | Pas d'installation ni exécution |
| Journal Général | Projection audit/demandes réelle | Pas de SSE ni de producteurs ChatGPT/GitHub/SSH raccordés |
| Audit | Base distincte, lecture seule du panneau | Triggers SQLite, pas stockage inviolable face au propriétaire OS |
| Contrôleur indépendant | Absent/non raccordé | Aucune autorisation exécutable ; quotas non consommés |
| MFA, cookies de session, CSRF pour mutations | Non implémentés | HTTPS proxy volontairement refusé ; mutations 405 |
| Installation, maintenance, rollback | Procédure et preflight fournis | Pas exécutés sur GEN-1 |

## Points de sécurité restant à lever

1. Réaliser une revue indépendante du contrôleur d'autorisation avant toute action privilégiée. Les règles Git et la décision enregistrée en DB n'accordent aucun privilège. Les quotas/durées doivent être consommés atomiquement au point d'exécution.
2. Configurer et vérifier les identités GitHub/SSH à privilèges minimaux et les opérations fermées. Aucun connecteur de production n'est présent dans le panneau.
3. Implémenter et recetter MFA/sessions/révocation/CSRF et réseau privé avant Caddy. Le backend actuel refuse les proxy headers et ne peut pas être exposé tel quel.
4. Contrôler Linux/systemd/ACL et projections DB expurgées sur GEN-1. Les redactions regex et tests locaux ne remplacent pas cette revue.
5. Vérifier les protections de branche, les reviews obligatoires et les checks requis avant fusion des propositions Soul/Rules. Aucun changement des protections GitHub n'a été réalisé.

Les nouveaux tests améliorent la couverture ; ils ne constituent ni un audit externe ni une garantie d'absence de vulnérabilité. Aucune suppression d'historique, aucun accès RELEASE et aucune modification Caddy effectués.
