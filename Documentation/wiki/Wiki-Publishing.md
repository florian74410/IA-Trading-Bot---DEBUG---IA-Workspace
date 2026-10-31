# Publication du Wiki GitHub

> **Source nettoyée : [2.4.2-R1 DEV](Nettoyage-2.4.2-R1.md)** sur la branche `2.4.2-R1`, issue de 2.4.1. Recette locale à suivre ; aucune promotion stable ou opération GEN-1.

Les sources officielles du Wiki sont conservées dans `Documentation/wiki/` afin qu'elles soient versionnées avec le code et relisibles dans les pull requests.

## Wiki natif GitHub

Le dépôt doit avoir l'option **Wikis** activée dans `Settings > General > Features`.

Une fois le Wiki natif activé, les fichiers de `Documentation/wiki/` servent de source de publication : `Home.md`, `_Sidebar.md` et les pages associées.

## Règle de synchronisation

Le dépôt reste la source de vérité. Une modification faite directement dans le Wiki natif doit être répercutée dans `Documentation/wiki/` ou elle risque d'être perdue lors de la prochaine synchronisation.

## Pourquoi conserver les deux

- `/Documentation/wiki` : versionné avec le code, reviewable, rattaché aux releases ;
- Wiki GitHub natif : navigation plus agréable pour les utilisateurs.

## Branche 2.4.0 DEV

Les changements de `feature/v2.4-finance-calendar` sont documentés dans les sources du Wiki. Leur présence dans GitHub ne prouve **pas** la publication dans le Wiki natif. Publier/synchroniser seulement selon le processus validé, en conservant la distinction développement, recette locale et production.
