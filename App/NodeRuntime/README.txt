IA-TB Node Runtime
==================

Ce dossier contient l'archive officielle Node.js utilisee par IA-TB sur macOS Intel / High Sierra.

Runtime attendu : Node.js v16.20.2 Intel x64
Archive attendue : node-v16.20.2-darwin-x64.tar.gz
SHA-256 : d7a46eaf2b57ffddeda16ece0d887feb2e31a91ad33f8774da553da0249dc4a6

Important :
- NodeRuntime/ contient l'environnement d'execution Node telechargeable.
- .runtime/ contient les donnees generees par l'instance IA-TB (logs, etats, bases runtime, cache, PID, etc.).
- .runtime/ est ignore par Git.

install_runtime.command migre automatiquement l'ancienne archive depuis Runtime/ vers NodeRuntime/ si elle existe encore localement.
