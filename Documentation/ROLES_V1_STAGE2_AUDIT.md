# Roles V1 — Audit étape 2

Base : 4a502447 (pré-Auth21). Aucun changement GEN-1.

Comptes existants : App/Core/Clients/client_service.js, client_repository.js et migrations/002_client_accounts_v1.sql. Table SQLite client_accounts (username chiffré, hash de mot de passe PBKDF2, role et enabled). Sessions en mémoire dans App/Core/Server/server.js ; endpoints /api/login, /api/logout, /api/bootstrap. UI dans App/UI/Gateway/ui_service.js. Permissions historiques : App/Core/Admin/admin_permissions.js.

Décision : garder les comptes SUPERADMIN hérités sans suppression ; futur mapping/migration contrôlée vers ADMIN. Trois rôles exposés ADMIN/USER/GUEST, et état anonyme distinct. Ne pas migrer maintenant car Core et UI utilisent encore SUPERADMIN pour des actions spécifiques.

Risques : /api/bootstrap annonce authenticated:true via localBypass ; mode IATB_AUTH_MODE=disabled permet le bypass UI ; les routes Core doivent être contrôlées côté serveur. Ne pas publier l'UI sur HTTP public. Aucun nouveau compte ni inscription.

Étape 3 : vérifier hors production les corrections Fundamental et Trading IA entre aac8341 et 4a502447. Étapes 4-5 : implémenter connexion puis rôles, tests avant déploiement.