# Supervisor Engine — intégration future

## But

Permettre au futur Supervisor Trading d'utiliser le même AI-Core que l'agent de développement, mais avec une mémoire, une identité, des Skills et des permissions séparés.

## Chemin de traitement cible

```text
Router CP/1 → Supervisor Core → ContextBuilder
                         ↕
             AI-Core / MemoryManager
                         ↕
          Agent-Memory.db (SQLite individuel)
                         ↕
             CharacterEngine / Soul.md
                         ↓
       Proposition structurée → Risk Engine
                         ↓
       Audit / events / mémoires vérifiées
```

Les Skills ne deviennent pas des privilèges exécutables par simple présence d'une archive. Le contrôle de permission et les limites du Risk Engine restent indépendants du modèle.

## Non inclus dans le jalon v1.0

Aucun changement au Supervisor réellement en service, aucun trading automatisé supplémentaire, aucune migration existante et aucun déploiement sur GEN-1. Les noms de modules et chemins représentent une **architecture cible**, à rapprocher ensuite du code réel.

[Retour](Home.md)
