> **Consolidation en cours : `2.5.2` — 2.5.2 DEV**, issue de `2.5.1`. Aucun déploiement ni promotion stable. Voir [le rapport](../Consolidation/2.5.2-DEV.md).

> **Branche de référence : `2.5` — 2.5.0 DEV.** Dérivée du nettoyage `2.4.2-R1`. Aucun déploiement GEN-1, aucune promotion stable. La recette Auth21 et les données R2 par utilisateur restent à valider.



> **Source nettoyée : [2.4.2-R1 DEV](Nettoyage-2.4.2-R1.md)** sur la branche `2.4.2-R1`, issue de 2.4.1. Recette locale à suivre ; aucune promotion stable ou opération GEN-1.

> **Candidate suivante : [2.4.1 DEV](Correctif-2.4.1.md)** sur `feature/v2.4.1-bank-calendar-cp1`, pour recette locale ; la 2.4.0 et la production restent distinctes.
# 🏷️ Versionnage et releases

> **État de développement : 2.4.0 DEV** sur `feature/v2.4-finance-calendar` (PR #21 fusionnée, 566 tests CI rapportés). **Non déployée sur VPS / non promue stable.** Recette locale Auth21/TLS à effectuer.

**Important :** les documents 2.2.1 et V2.0 DEBUG sont historiques ; le VPS v2.2.5-R1 reste indépendant. Source de vérité Wiki : `Documentation/wiki/` (voir [Wiki-Publishing](Wiki-Publishing.md)).

> **🟢 En simple : le projet ne considère pas une version terminée parce que le code compile. Il faut aligner code, tests, patch, changelog, GitHub et Wiki.**

La procédure détaillée reste dans `docs/RELEASE_PROTOCOL.md`.

---

## 🔁 Cycle officiel

1. Versionnage
2. Développement
3. Tests
4. Construction/validation du patch
5. Changelog
6. Synchronisation GitHub
7. Analyse d’impact Wiki
8. Mise à jour Wiki

**🟢 En simple : la documentation vient après vérification du code réel, afin de ne pas annoncer une fonction imaginaire.**

---

## 🧪 Branche DEBUG

**🟢 En simple : V2.0 DEBUG est un état de développement, pas une déclaration de stabilité.**

La branche `debug` peut contenir des fonctions plus avancées que la dernière release stabilisée. Les pages Wiki V2.0 DEBUG décrivent ce code, mais le statut STABLE exige le processus de release complet.

---

## 📦 Patch

**🟢 En simple : le patch doit être compatible avec sa base.**

Champs essentiels :
- `from_version`
- `to_version`
- type de package
- manifest fichiers
- hashes

Une erreur `Version source incompatible` bloque l’installation.

---

## 📚 Impact Wiki

**🟢 En simple : toute modification d’architecture, API, connecteur, sécurité ou comportement utilisateur doit déclencher une vérification documentaire.**

Après un changement :
- identifier les pages touchées ;
- les corriger dans la même évolution ;
- ou déclarer explicitement `Wiki impact: NONE`.

---

## 🔐 Interdits de release

**🟢 En simple : une archive ou un commit ne doit jamais embarquer les données privées de la machine de développement.**

Ne jamais versionner :
- clés API ;
- coffre ;
- mots de passe ;
- private keys ;
- bases utilisateur ;
- logs personnels ;
- tokens/session ;
- fichiers runtime temporaires.

---

## ✅ Équation de validation

```text
VERSION OK
+ CODE OK
+ TESTS OK
+ PATCH OK
+ CHANGELOG OK
+ SOURCE GITHUB OK
+ WIKI IMPACT OK
+ WIKI OK
= VERSION VALIDABLE
```
