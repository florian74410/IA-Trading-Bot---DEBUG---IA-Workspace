CUSTOM INDICATORS — v2.0 DEBUG
================================

Ce dossier contient uniquement des fichiers *.indicator.json déclaratifs.
Aucun JavaScript n'est exécuté depuis ce dossier.

BUT
---
Le LLM / Supervisor peut créer un indicateur sur mesure via l'Indicator Engine.
Le fichier JSON est validé, enregistré ici, ajouté au registre dynamique puis calculé
par l'Indicator Engine. Le Chart Viewer / Trading IA ne recalcule rien : il lit le
résultat JSON normalisé et l'affiche avec le lecteur universel.

CONTRAT MINIMAL
---------------
{
  "schema": "iatb.indicator.v1",
  "id": "mon_indicateur",
  "name": "Mon indicateur",
  "version": "1.0",
  "category": "custom",
  "inputs": {
    "source": {"type":"series","default":"close","allowed":["open","high","low","close"]},
    "period": {"type":"integer","default":14,"min":2,"max":500}
  },
  "engine": {"operation":"ema"},
  "outputs": {
    "value": {"type":"number","strategy":true,"chart":true,"render":"line"}
  },
  "display": {"pane":"separate"}
}

RENDU UNIVERSEL
---------------
display.pane:
- "price"    : superposition dans le graphique principal.
- "separate" : affichage dans la box Lecteur d'indicateurs JSON.

outputs.<nom>.render (optionnel):
- "line"
- "histogram" / "bars"
- "area"
- "points" / "markers"

Sans render explicite, le lecteur utilise "line". Une sortie nommée histogram/bars
est automatiquement reconnue comme histogramme.

display.render:
- "zones" : overlay de zones sur le graphique (réservé aux résultats compatibles).
- "line" ou "auto" : rendu standard.

SECURITE
--------
Un Custom doit :
- utiliser schema = iatb.indicator.v1 ;
- avoir un id unique ;
- utiliser une opération native / IR autorisée ;
- respecter les bornes de paramètres ;
- ne contenir ni JavaScript, eval, shell, accès réseau ou accès filesystem.

Les fichiers invalides sont déplacés automatiquement dans ../Quarantine/.

RECHARGEMENT
------------
Le bouton ƒx Indicateurs recharge maintenant le registre automatiquement à l'ouverture.
Le bouton Actualiser recharge aussi le registre avant de recalculer les indicateurs.
