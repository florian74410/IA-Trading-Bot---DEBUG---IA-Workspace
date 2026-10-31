# IA-TB DEBUG 2.1 — Phase 2 — Argon2id et transition PBKDF2

**Statut : module de vérification isolé testé ; NON activé dans le login.**
14/10/2026 — branche `feature/debug-2.1-auth-design`. Aucun compte ni service GEN-1 touché.

## Avancement vérifié

- Nouveau `App/Core/Clients/password_hasher_v2.js` : hash Argon2id asynchrone ; vérification native de hash PHC Argon2id ; vérification asynchrone des anciens hash PBKDF2/SHA-256 sans changement de données.
- Coûts initiaux **provisoires** : Argon2id v19, 65 536 KiB (64 MiB), 3 passes, parallélisme 1 et 32 octets de sortie. Uniquement login/création/changement de mot de passe, jamais chemin rapide marché.
- Mode ancien compte : `passwordAlgo` absent signifie `PBKDF2_SHA256`. Un succès donne `verified:true`, `needsUpgrade:true`, mais n'écrit jamais en DB. Compte désactivé, algo inconnu, mot de passe erroné : refus.
- PHC Argon2id : extraction strictement bornée des paramètres m/t/p, indépendamment de leur ordre sérialisé. Les doublons, paramètres inattendus et coûts abusifs sont refusés.
- Dépendance native testée : **`argon2@0.45.1` sur Node 22**. Le workflow dédié l'installe dans un **préfixe npm temporaire du runner**, pas dans le runtime IA-TB ; `App/package.json` et `App/package-lock.json` **ne sont pas encore modifiés** pour éviter un `npm ci` incohérent.
- **[11/11 tests natifs SUCCESS](https://github.com/florian74410/IA-Trading-Bot/actions/runs/38521734959)** dans `App/Tools/Tests/password_hasher_v2.test.js` : hashes réels, erreurs de mot de passe, compatibilité PBKDF2, comptes désactivés, rehash suggéré, paramètres non sûrs et validation d'entrée.

## Obligations avant activation réelle

1. Runner transactionnel du schéma v3 sur copie, backup et rollback vérifiés : SQL actuellement **non actif** (`auth21_proposed_migrations`).
2. `ClientRepository` doit lire explicitement `password_algo` et intégrer un **compare-and-swap transactionnel** de l'ancien hash + version de sécurité. Rejet des races avec désactivation/reset/changement de mot de passe.
3. Après une authentification PBKDF2 réussie, calculer Argon2id hors du thread bloquant et réaliser le rehash uniquement après CAS réussi, avec audit sans secrets. Échec de migration : ne pas altérer l'ancien compte.
4. Installation du package natif et verrou npm reproductible dans le runtime cible, Node 22 Linux confirmé ; panne du module = refus sûr. Aucun fallback PBKDF2 sur un enregistrement déclaré Argon2id.
5. Contrôler mémoire, concurrence, latence et p95/p99 sur banc isolé comparable à GEN-1 ; calibrer la politique avant intégration au login, au RBAC et aux sessions.
6. Vérifier Auth et restauration inter-Engines en Phase 6 avant tout déploiement ou publication.

**Conclusion :** la cryptographie de l'adaptateur a été validée sur vraies bibliothèques natives et comptes fictifs ; cela **ne signifie pas** qu'IA-TB a déjà migré les mots de passe. La Phase 2 reste **OUVERTE**.
