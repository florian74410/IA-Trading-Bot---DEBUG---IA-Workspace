# IA-TB — Paramètres → IA → Privilèges (UI v1)

**Prototype autonome HTML/CSS/JS, non intégré au runtime Trading.**

Ouvrir `index.html` pour voir une maquette fonctionnelle. Deux panneaux verticaux autorisées/interdites, glisser-déposer HTML natif, alternative accessible par boutons, filtre par moteur, recherche, inspecteur de fonction, export d'une proposition JSON. Couleurs bleu électrique IA-TB, responsive, animations respectant prefers-reduced-motion.

**Sécurité** : les fonctions sont FICTIVES et non dérivées d'un inventaire réel des Engines; aucune connexion réseau, aucune sauvegarde de privilège, aucune activation du mode Direct Trading. `vault.export_private_key` reste bloquée pour illustrer une interdiction système non négociable. L'export contient `demo_only: true` et ne doit jamais être appliqué en production.

## Intégration à prévoir avant activation

1. Inventorier le code source réel IA-TB et ses opérations CP/1, pour chaque Engine. Lister inputs JSON Schema, outputs, erreurs, effets de bord, niveau de risque et version de contrat.
2. Publier des manifestes `Functions/manifest.json` versionnés, validés et liés au SHA installé ; jamais accorder de droit à partir d'une simple déclaration agent.
3. Persister l'état dans SQLite (registre des fonctions + politiques par agent), default DENY, audit append-only et changements protégés par authentification ADMIN.
4. Contrôler **chaque** exécution au point de contrôle du Router / de l'Engine, pas seulement à l'affichage ou au démarrage ; l'API IA ne peut contourner ce contrôle.
5. Risk Engine reste autorité indépendante pour le trading ; interdictions système absolues, approbation renforcée pour HIGH/CRITICAL, version de policy, révocation et tests.
6. Installer l'onglet dans `Paramètres → IA` uniquement après comparaison avec les vrais fichiers UI, sauvegarde, tests et validation CI.

**Aucun déploiement GEN-1 ou changement RELEASE réalisé par ce prototype.**
