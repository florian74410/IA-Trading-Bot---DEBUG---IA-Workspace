# Audit Engine v0.2

Journal SQLite **distinct** de la mémoire de travail et de la file des demandes.
La base, ses fichiers temporaires et les preuves d'approbation doivent résider
hors Git, dans un répertoire protégé, non accessible en écriture à l'agent.

L'outil `audit.py` ajoute des événements structurés et refuse les modifications
ou suppressions SQL (triggers). Cela ne constitue **pas** une preuve infalsifiable
contre l'administrateur du disque : prévoir centralisation distante ou stockage WORM,
contrôle d'accès OS, sauvegarde, intégrité et rétention avant production.

N'enregistrer ni jetons ni secrets. Aucun audit ne prouve une exécution tant qu'un
contrôleur technique n'a pas fourni son résultat vérifié.
