# Correctif 2.4.1 DEV

> **🟢 En simple : cette candidate améliore la présentation des événements, met en pause les fonctions Bank demandées et permet à Supervisor de lire les données collectées à travers Router. Elle est destinée à un essai local avant toute promotion.**

## Ce qui change

- Calendrier responsive avec liste défilante, sans débordement horizontal.
- Traits verticaux discrets à l'heure des événements sur les bougies ; pas de trait si l'heure est inconnue ou hors écran.
- Alignement du label Crypto dans Bank → Portefeuilles → Transaction.
- Swap/Bridge, coffres personnels/partagés et prêts cachés et bloqués côté serveur ; données conservées.
- Catalogue de 51 lectures de données normalisées par CP/1, contexte partagé Supervisor de onze familles et indisponibilités explicites.

## Sécurité et limites

> **🟢 En simple : masquer un bouton ne suffit pas. Les appels directs sont aussi bloqués. Les nouveaux accès aux données ne donnent pas accès aux secrets ni au portefeuille d'un autre utilisateur.**

Les autorisations Auth21, le contrôle de session, les preuves signées et les
protections Risk/Firewall restent en place. Aucun ordre réel n'est envoyé par
les tests. Le périmètre concerne les produits normalisés des collecteurs, pas
un accès arbitraire aux fichiers ou aux réglages des fournisseurs.

## Version et recette

Branche `feature/v2.4.1-bank-calendar-cp1`, issue de la dernière 2.4.0 DEV et de
la fusion des journaux Trading V2. Cette candidate n'est ni promue stable, ni
déployée sur GEN-1. L'essai local se fait sur `https://localhost:8000`, avec le
lanceur Auth21 SAFE existant et Trading LIVE désactivé.

Les détails et le périmètre des tests figurent dans
[la documentation technique 2.4.1](https://github.com/florian74410/IA-Trading-Bot/blob/feature/v2.4.1-bank-calendar-cp1/Documentation/RELEASE_2.4.1_DEV.md).
Les sources de cette page sont versionnées selon [Wiki-Publishing](Wiki-Publishing.md) ;
leur mise à jour ne constitue pas une publication dans le Wiki natif GitHub.
