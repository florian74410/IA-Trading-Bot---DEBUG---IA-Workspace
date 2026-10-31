# IA-TB — environnements et déploiement

`App/` contient la source 2.4.2-R1 ; les copies historiques des builds ont été
retirées de cette branche. Les anciens états restent accessibles par Git.
Les fichiers Compose génériques et la qualification Auth21 sont conservés ;
le Compose de release 2.2.1 et son vérificateur hardcodé ne sont plus livrés ici.

Cette branche est une candidate DEV de recette locale, pas une image déclarée
prête pour la production. Le `Dockerfile` de préflight reste volontairement
limité ; sa présence ne prouve pas un déploiement complet de l'application.

DEBUG et RELEASE doivent conserver des comptes, clés et volumes distincts.
Les données persistantes restent hors Git. Aucun déploiement ni nettoyage des
répertoires d'un VPS n'est effectué par le nettoyage de source.

Consulter `../Documentation/Cleanup/2.4.2-R1/RESULTS.md` pour les vérifications et
le démarrage local Auth21 SAFE sur https://localhost:8000.
