# Nettoyage 2.4.2-R1 DEV

> **🟢 En simple : la copie source est allégée, sans retirer les modules réellement utilisés par la 2.4. L'historique reste dans Git et les données privées restent intactes.**

Le travail suit trois passes : inventaire de toute l'arborescence, plan écrit
fichier par fichier, puis nettoyage et contrôles d'intégrité. Les anciens builds,
bases embarquées et maquettes sans référence ne sont plus livrés. Les anciens
noms de fichier encore utilisés par les imports et les pages sont conservés.

Les fonctions privées sans consommateur et les anciens collecteurs réseau CME
non utilisés sont retirés. Finance Calendar/FED, les parseurs exportés et les
contrats CP/1 restent présents. Le stub Liquidity obsolète est remplacé dans les
tests par un contrôle du client Market Data courant, sans connexion Internet directe.
Les fonctions Bank suspendues en 2.4.1 restent présentes et bloquées.

## Contrôles

> **🟢 En simple : un nom ancien ne justifie pas une suppression. Les migrations de comptes, les tests de sécurité et les composants chargés dynamiquement sont conservés.**

La CI contrôle les imports, assets, versions, syntaxe, contrats protégés et tests
métier/UI. [Le dossier de nettoyage](https://github.com/florian74410/IA-Trading-Bot/tree/2.4.2-R1/Documentation/Cleanup/2.4.2-R1)
contient l'inventaire, le plan, l'addendum et le bilan. Les tests utilisant des
réponses fournisseurs fictives ne prouvent pas que toutes les API externes sont
disponibles en temps réel.

## Recette

Branche `2.4.2-R1`, version `2.4.2`, révision R1, statut DEV.
Copie propre et clone `--depth 1` conseillés ; le clone complet télécharge encore
les objets historiques de Git. Démarrage avec Node 22 et le lanceur Auth21 SAFE
sur `https://localhost:8000`, avec les comptes/certificats privés existants.
Pas de fusion main, de promotion stable ou de déploiement GEN-1 dans ce chantier.
Les sources du Wiki sont mises à jour selon [Wiki-Publishing](Wiki-Publishing.md) ;
aucune publication native n'est présumée.
