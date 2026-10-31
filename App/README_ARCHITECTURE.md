# Source exécutable IA-TB 2.4.2-R1

Ce dossier est le build source maintenu. `Core`, `MarketData`, `Fundamental`,
`Indicators`, `Liquidity`, `Portfolio`, `Strategy`, `Risk`, `Supervisor`, `Bank`,
`Frontend`, `UI` et `services/trading-engine` conservent leurs chemins et leurs
contrats ; aucun moteur n'est déplacé par le nettoyage.

Les suffixes v1/v2/v3 dans les noms correspondent à des générations d'interface
encore utilisées par la 2.4. Les imports, assets et manifestes sont vérifiés en
CI. Les historiques de builds sont conservés par Git, sans copie locale dans
la source courante. Les migrations, configurations initiales, exemples de
stratégies chargés et notices tierces restent disponibles.

Installer les dépendances avec Node 22 (`npm ci --omit=dev`) puis utiliser
`bash start_auth21_local_safe.command` pour la recette Auth21/TLS locale.
Le lanceur conserve les données privées externes et interdit le trading réel.
Les scripts NodeRuntime/macOS et les autres outils utilisés par les lanceurs
ne sont pas retirés simplement parce que leur nom est ancien.

Voir `../Documentation/Cleanup/2.4.2-R1/` pour l'inventaire et les décisions.
