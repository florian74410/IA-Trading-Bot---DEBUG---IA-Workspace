# IA-TB DEBUG 2.1 — Protection de l'intégrité de la politique RBAC

> **Décision d'Overflow (14/10/2026) :** une matrice modifiée frauduleusement ne doit **jamais** permettre à GUEST de devenir ADMIN ou d'obtenir une permission privilégiée. Toute fonctionnalité future doit déclarer ses droits.
> **Statut :** contrat d'architecture approuvé sur le principe, **mécanismes runtime non implémentés**. Ce document complète [P1.7](../Architecture/AUTH_DEBUG_2.1_RBAC_CONTRACT.md), [règle de changement](AUTH_DEBUG_2.1_RBAC_CHANGE_POLICY.md) et [versions P1.6](../Architecture/AUTH_DEBUG_2.1_VERSION_COMPATIBILITY.md).
> **Périmètre :** intégrité des fichiers de permission, pipeline GitHub, artefact de déploiement, application des privilèges. Aucune intervention sur GEN-1, ses ports ou ses clés Wallet.

## 1. Menaces et réponses

| Menace | Protection requise |
| --- | --- |
| Changement de `ADMIN_READ.roles` en `["ADMIN","GUEST"]` ou d'un chemin ADMIN en lecture GUEST | Tests de rôles invariants et d'actions critiques + revue d'un diff de sécurité. **GUEST n'obtient jamais le droit d'écriture ni l'accès à une donnée privée ou système**. |
| Ajout d'un endpoint, d'un target/action CP/1 ou d'un handler dynamique sans permission explicite | Inventaire + vérification CI ; entrée inconnue = `DENY` côté serveur, pas d'autorisation par défaut. Scanner complet des routes dynamiques à développer avant mise en ligne. |
| Modification de la matrice avec son hash SHA-256 dans le même commit | **Hash seul insuffisant** : un attaquant peut modifier les deux. Contrôle GitHub des changements (revue CODEOWNERS + status requis), et **attestation de build signée** par une autorité de déploiement distincte. |
| Modification du JSON **sur le VPS** ou par un Engine | Ne jamais charger une politique depuis un volume partagé `:rw`. Code/politique immuables dans l'image vérifiée, pas de fonction Admin/UI pour éditer le RBAC. UID + montages limités par service. |
| Remplacement de l'image complète ou du vérificateur | Déploiement restreint, artefact construit/revu, signature contrôlée par une autorité hors portée des Engines, digest exact attendu à l'activation. Si un attaquant possède la chaîne de build et la clef de déploiement, la vérification locale seule ne suffit pas. |
| Ancien composant ignorant `permissions_version` ou Session/rôle révoqué | Refus fail-closed sur les opérations sensibles ; revalidation du contexte d'utilisateur/révocation près de la transaction métier. Aucun CP/1 machine ne vaut rôle humain. |

## 2. Deux frontières de sécurité indépendantes

**GitHub / publication :** seuls des changements RBAC approuvés et testés sont intégrables. Ajouter `.github/CODEOWNERS` pour que fichiers politique, contrôles CI, workflows et modules Auth soient examinés par le responsable du dépôt. **Configurer une protection de branche / ruleset GitHub** imposant au moins une approbation CODEOWNERS, workflow RBAC réussi, interdiction de push direct et de contournement non audité. Ces réglages serveur GitHub **ne sont pas activés par la simple présence du fichier CODEOWNERS**.

**Application / déploiement :** l'autorité RBAC est une **table de permissions versionnée et validée**, embarquée dans le build contrôlé. Le JSON de conception actuel **n'est pas la politique active**. À l'implémentation, générer/figer la politique et ses invariants par build ; refuser au démarrage une politique ou signature incohérente, sans repli sur `GUEST=ADMIN` ni retour au mode bypass. L'intégrité doit être ancrée dans une identité de confiance **séparée** du répertoire de politiques et des secrets CP/1 ; une empreinte seule n'authentifie pas un déploiement.

**Conseil architecture :** signatures des artefacts/politiques vérifiées **une fois au démarrage et lors d'une mise à jour autorisée**, permissions en mémoire sous structure non modifiable ; vérifications par action via lookup rapide `(service, target, action, role, owner)`. Ce modèle ne demande ni signature, ni hash de mot de passe à chaque tick MarketData.

## 3. Invariants non configurables par un JSON livré au navigateur

1. `GUEST` : jamais `GLOBAL_ADMIN_*`, `OWNER_*`, `INTERNAL_SERVICE`, action coût fournisseur/IA, write serveur, trading LIVE, wallet, secrets ou admin.
2. `USER` : uniquement ressources propres à son `clientId` authentifié, ou données publiques assainies. Pas de configuration globale.
3. `ADMIN` : gestion des fonctions applicatives globales, sans lecture automatique des secrets bruts des autres clients, ni privilèges SSH/Linux.
4. `SERVICE` : machine par scope, **jamais rôle humain ADMIN** ; preuves humaines indépendantes sur les actions qui l'exigent.
5. `ANONYMOUS` : login/assets publics minimaux uniquement.
6. Aucune route nouvelle ou dynamique n'obtient un rôle implicite ; une décision `DENY` ne peut être transformée en `ALLOW` par un header fourni par le navigateur.
7. Changer la portée, l'effet métier ou les rôles **incrémente `permissions_version`** et invalide les capacités/sessions concernées.
8. La validation Auth s'applique **au Core et à la frontière métier Router/Engine**, pas seulement à l'interface graphique.
9. Même ADMIN ne peut exécuter un ordre LIVE en DEBUG. Le chantier Wallet reste **gelé**, clé Wallet absente non générée.

## 4. Contrôle CI actuel et obligations futures

**Déjà confirmé :** workflow `auth-rbac-governance.yml` sur commit `185d19c` : 212 entrées de registre, 128 routes HTTP explicites, 77 actions UI Router, deux tests négatifs de déclaration inconnue ; job GitHub Actions passé (run `38494625230`).

**À renforcer dans ce point :**
- Vérifier des invariants de privilèges de classes et groupes, avec auto-test simulant une élévation `GUEST`.
- Refuser une reclassification explicite de routes sensibles (`/api/admin/*`, shutdown, firewall, project-file, etc.) vers une classe publique.
- Exiger des tests de non-escalade et la revue du diff de permission pour toute nouvelle action.
- Ajouter CODEOWNERS et documenter la configuration manuelle nécessaire des règles GitHub.

**Encore obligatoire avant déploiement :** scanner complet des routes dynamiques, chargement de politique immuable & attestation de build validés **en conditions réelles**, intégration des 48 tests négatifs RBAC, tests de cohérence de `permissions_version`, revue des montages partagés, benchmarks p95/p99, et approbation du déploiement.

## 5. Critères d'acceptation

- [x] Invariants contre l'élévation GUEST/USER et distinction CI/runtime formalisés.
- [ ] Tests de mutation négatifs CI réussis sur GitHub et code intégré.
- [ ] Ruleset/protection de branche GitHub réellement activé (approbation du propriétaire + contrôle CI requis).
- [ ] Build Auth signé/vérifié, politique immuable hors volumes modifiables, démarrage fail-closed.
- [ ] Tests d'autorisation réels passés, absence de ralentissement significatif.

**La sécurité réelle d'une politique ne se résume pas à la sécurité du JSON.** L'autorité serveur, les permissions système, la provenance du build et la validation des actions restent indispensables.
