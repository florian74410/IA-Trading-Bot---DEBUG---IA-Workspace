# Soul, personnalité et apprentissage

## Deux supports, pas de Soul.json

- `Soul.md` : rôle, identité narrative, valeurs, philosophie, habitudes et stratégies apprises, rédigés de façon lisible.
- Table SQLite `Statistiques` : valeurs numériques des traits et leurs historiques d'itérations.

**`Soul.json` est abandonné dans cette architecture.**

## Cycle des expériences

1. Consigner une observation dans `events` et `Events.jsonl`.
2. Relier les actions, interactions et réponses observables grâce à `records`.
3. Produire une déduction explicite dans `reflexions`, en mentionnant les preuves et les incertitudes.
4. Consolider uniquement les leçons vérifiées dans `memories` puis proposer leur synthèse dans `Soul.md`.
5. Le CharacterEngine propose une nouvelle ligne `Statistiques`, dans les limites de sa politique, avec validation selon l'importance.

Aucune source externe ne peut modifier directement `Soul.md` ou les privilèges. Les changements critiques nécessitent une approbation humaine. La sauvegarde et le retour arrière doivent rester possibles.

## Pour le trading

La personnalité influence la prudence d'analyse, pas les limites de risque ni le pouvoir d'exécution. Le Risk Engine reste indépendant et peut refuser les propositions.

[Modèle Soul.md](../../Agents/templates/Soul.md) · [Retour](Home.md)
