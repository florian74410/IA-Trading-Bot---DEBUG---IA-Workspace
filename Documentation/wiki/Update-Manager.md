# Ancien Update Manager — archive fonctionnelle

Les interfaces et services de création/installation de patchs décrits ci-dessous
ont été retirés en **2.5.2 DEV**. Ce document décrit leur fonctionnement
historique et ne constitue plus une procédure utilisable. Le launcher conserve
ses fonctions indépendantes de récupération et ses historiques.

---

# ⬆️ Update Manager

> **🟢 En simple : Update Manager empêche d’appliquer aveuglément un patch construit pour une autre version et protège les données utilisateur pendant la mise à jour.**

---

## 🏷️ Compatibilité de version

**🟢 En simple : un patch incrémental doit connaître exactement sa version de départ et sa version d’arrivée.**

Un package déclare notamment :
```text
package_type = UPDATE
from_version = X
to_version = Y
```

`from_version` doit correspondre à la version installée ciblée. Une incompatibilité bloque l’installation.

---

## 🔎 Manifest et intégrité

**🟢 En simple : le package doit permettre de vérifier que ses fichiers n’ont pas été remplacés ou corrompus.**

Le manifest décrit les fichiers attendus et le workflow de release prévoit la vérification de hashes, notamment SHA-256 selon le format du package.

---

## 👤 Données utilisateur

**🟢 En simple : mettre à jour le code ne doit pas effacer wallets, secrets, paramètres, bases ou logs utilisateur.**

Les données persistantes sont séparées du code, notamment sous `~/IA-TB-UserData-Server`. Une migration explicite doit être utilisée lorsqu’un schéma change.

---

## ↩️ Rollback

**🟢 En simple : une modification sensible doit prévoir comment revenir à l’état précédent.**

Selon le type de mise à jour :
- sauvegarde ;
- copie avant migration ;
- restauration de version ;
- validation post-installation.

---

## 🛠️ Interface Admin

**🟢 En simple : Update Manager est intégré à l’Admin afin que mise à jour, diagnostic et version soient visibles au même endroit.**

Voir aussi [Versionnage et releases](Versioning-and-Releases.md).
