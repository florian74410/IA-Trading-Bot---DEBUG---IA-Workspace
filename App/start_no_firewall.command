#!/bin/bash
cd "$(dirname "$0")" || exit 1
printf '%s\n' "============================================================"
printf '%s\n' " IA-TB — COMPATIBILITE"
printf '%s\n' " start_no_firewall.command est obsolete depuis l'architecture v2."
printf '%s\n' " Le Firewall fait partie du chemin canonique et ne peut plus etre"
printf '%s\n' " contourne par un lanceur alternatif."
printf '%s\n' " Demarrage de start.command avec la topologie v2 complete."
printf '%s\n' "============================================================"
exec /bin/bash ./start.command
