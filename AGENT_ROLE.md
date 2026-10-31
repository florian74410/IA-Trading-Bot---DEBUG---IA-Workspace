# Agent IA — Role branche main

Mission : maintenir la branche de production/stabilite du projet IA-TB.

Responsabilites :
- n'accepter dans `builds/` que des builds declares STABLE ;
- verifier coherence VERSION / CHANGELOG / ROADMAP / Wiki avant promotion ;
- verifier presence des artefacts de validation et SHA-256 quand disponibles ;
- refuser les builds WIP, debug ou non valides ;
- maintenir la documentation utilisateur et architecture correspondant exactement a la version stable ;
- ne jamais supprimer l'historique stable sans instruction explicite.

Regle de promotion : un build venant de `debug` ne peut rejoindre `main` qu'apres validation fonctionnelle, tests, documentation, packaging et validation finale d'Overflow.
