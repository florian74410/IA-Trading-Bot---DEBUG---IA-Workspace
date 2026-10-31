# General Memory — journal SQLite

Stockage durable **sur le disque où l'outil est exécuté**, pas dans les réponses du LLM. Le schéma SQL définit une table append-only, timestamps UTC, index, et événements rectificatifs.

## Utilisation (Python 3, bibliothèque standard)

Définir le chemin de la base dans un espace R/W **hors dépôt** :

    export IATB_AGENT_MEMORY_DB="$HOME/.local/share/iatb-ai-agent/general.sqlite"
    python3 "AI Agent/Memory/General/journal.py" init
    python3 "AI Agent/Memory/General/journal.py" append --kind decision --source github --summary "Le code est préparé sur une branche isolée." --reference "work/ai-agent-v0.1" --confidence observed
    python3 "AI Agent/Memory/General/journal.py" list --limit 10
    python3 "AI Agent/Memory/General/journal.py" search "branche"
    python3 "AI Agent/Memory/General/journal.py" stats

Le chemin doit être absolu. Les bases SQLite, fichiers WAL et SHM restent non versionnés (.gitignore racine). Le programme crée des répertoires privés et applique le mode 0600 au fichier DB.

## Champs

- created_at_utc : création dans SQLite, au format ISO 8601 UTC.
- kind : observation, analysis_summary, decision, action, result, lesson, correction.
- summary : synthèse explicite, courte, factuelle. Aucun raisonnement interne brut.
- source : user, chat, github, vps, documentation ou test.
- reference : commit SHA, workflow, chemin logique ou identifiant non secret.
- session_ref : référence opaque facultative, sans information personnelle.
- confidence : observed, inferred ou hypothesis.
- correction_of : référence à l'événement erroné, pour rectifier sans le réécrire.

## Limites
L'outil empêche certaines formes courantes de fuite de secrets mais ne remplace pas une inspection. Ne jamais écrire de clés privées, tokens, mots de passe ou données clients. La mémorisation requiert un appel explicite : elle n'est pas déclenchée par toutes les conversations ChatGPT.

Cette mémoire est une **synthèse de décisions et de traces de travail**, et non la chaîne de pensée interne du modèle.
