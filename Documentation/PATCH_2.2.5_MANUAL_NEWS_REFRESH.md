# IA-TB v2.2.5 — Synchronisation manuelle News & Événements

**État : bouton Fundamental raccordé au module d’état partagé ; vérifications backend Auth21/permissions et recette multi-rôles encore requises.**
**PR commune : #18 — feature/v2.2.5-calendar-events-chart.**

## Comportement attendu

Le bouton « Actualiser » de Fundamental/News & Événements est une **action de collecte ordinaire** autorisée à **tous les rôles authentifiés**. Il ne doit pas ouvrir de boîte de dialogue demandant un mot de passe administrateur, ni appeler une commande de maintenance privilégiée. Les contrôles de session et d'isolation multiutilisateur continuent de s'appliquer côté serveur ; aucun accès anonyme.

Le bouton :
1. vérifie qu'aucune synchronisation identique n'est déjà en cours (single-flight) ;
2. appelle par route Core authentifiée une commande bornée de rafraîchissement incrémental des sources/news/événements configurés ;
3. utilise les collecteurs FED/CME/news actuels sans suppression, purge ou reset du stockage ;
4. insère les nouveaux éléments et met à jour les anciens **seulement pour de nouveaux champs vérifiés** (ex. publication du « réel » après le « prévu ») ;
5. préserve provenance, historique, dates originales, idempotence et ordre chronologique ;
6. actualise l'UI en conservant filtres, sélection et défilement lorsque possible ;
7. expose nombre ajoutés/mis à jour/ignorés, sources en erreur et dernière synchronisation.

## Sécurité et limites

- Toute session autorisée à consulter Fundamental peut demander ce refresh. Permission distincte de « purge », « réindexation », « modification des providers », « force-reset » ou autres commandes admin.
- Le serveur impose cooldown, quota global/par utilisateur, limites de timeout, limite de concurrence et audit (utilisateur, action, résultat).
- Réutiliser CP/1/Router et les routes internes existantes ; pas d'appel direct du navigateur aux services privés ni aux URLs fournies par les news.
- Les options sensibles restent réservées aux rôles privilégiés ; ne pas élargir les permissions des routes d'administration existantes par inadvertance.
- En cas de source partiellement indisponible : conserver les anciennes données, rapporter erreur de cette source et continuer avec les autres.
- En cas d'échec global : ne pas vider le calendrier/liste ; rendre l'erreur explicite et permettre nouvelle tentative après cooldown.

## Contrat logique de résultat (à mapper sur les routes réelles)

```json
{
  "status": "complete",
  "added": 0,
  "updated": 0,
  "unchanged": 0,
  "failedSources": [],
  "lastSyncAt": "timestamp ISO-8601"
}
```

Ne pas créer un endpoint nommé ou supposer ces noms comme existants avant audit.

## Implémentation / QA obligatoire

- [ ] Identifier le handler réel du bouton « Actualiser », l'API appelée et l'origine exacte du prompt mot de passe.
- [ ] Distinguer le refresh de consultation de la synchronisation ou maintenance admin.
- [ ] Implémenter autorisation « authenticated read+refresh » de façon explicite, testée pour tous les rôles autorisés.
- [ ] Modifier le backend pour une fusion incrémentale atomique et idempotente, sans effacement ni écrasement de données plus récentes.
- [x] Raccorder le bouton Fundamental existant au contrôleur d’état partagé (Actualiser / Actualisation… / À jour / Erreur), sans purge et avec single-flight. Les comptes détaillés restent dans le panneau de notification.\n- [ ] Valider le résultat partiel, la gestion de tous les rôles authentifiés et la synchronisation FED/CME côté serveur.
- [ ] Tester deux clics simultanés, 2 utilisateurs, quota, expiry session et protections Auth21/CP1.
- [ ] Tester refresh FED + CME + News : données existantes préservées ; doublons non créés ; prévision/réel mis à jour en présence de données officielles.
- [ ] Exécuter recette navigateur et tests de non-régression avant fusion ou déploiement.

**Ne pas confondre spécification ajoutée à la PR avec correctif runtime fonctionnel.**

## UX transverse — États des boutons Actualiser / Synchroniser

Tous les boutons d'actualisation ou de synchronisation applicatifs doivent suivre un modèle de statut uniforme : `Actualiser` (repos), `Actualisation…` (en cours), `À jour` (réussite) et `Erreur` (échec). Pour les boutons initialement nommés `Synchroniser`, conserver le terme métier au repos lorsque nécessaire, mais utiliser les mêmes quatre états visuels et la même concision. Aucun nombre de résultats ni texte de diagnostic long dans la barre de boutons. Les résultats détaillés restent dans diagnostics, logs ou panneaux secondaires. Composant partagé amorcé : `App/Frontend/JS/sync_button_state_v2_2_5.js` ; raccordement aux vues et recette restant à faire.

## Source v2.2.5 — état du composant transversal

Implémentation committée : `App/Frontend/JS/sync_button_state_v2_2_5.js` ; tests : `tests/sync_button_state_v2_2_5.test.cjs`.

Exemple d'intégration à **un bouton existant** après import du script, sans remplacer sa logique API :

```js
const handle = IATBSyncButtonState.bind(
  document.getElementById('actualiser'),
  () => refreshNewsViaExistingAuthenticatedCoreRoute()
);
// Au démontage de la vue : handle.destroy();
```

Le composant ne lance aucun appel réseau lui-même, ne modifie aucune permission et ne règle pas à lui seul la demande de mot de passe : ce raccordement dépend de l'audit des handlers et routes en place. État : **code partagé committé, branchements réels restants, tests non exécutés**.
