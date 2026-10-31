#!/bin/sh
# IA-TB DEBUG forced SSH command: exactly one project-scoped operation.
# The SSH private key does not get a shell, Docker access or port forwarding.
set -eu
umask 077
OPERATOR=/usr/local/libexec/iatb-debug-operator
case "${SSH_ORIGINAL_COMMAND:-}" in
  ping)
    printf 'IA-TB_DEBUG_SSH_OK\n'
    ;;
  status|start|stop|restart)
    exec /usr/bin/sudo -n "$OPERATOR" "$SSH_ORIGINAL_COMMAND"
    ;;
  "deploy "*)
    sha="${SSH_ORIGINAL_COMMAND#deploy }"
    if printf '%s\n' "$sha" | /usr/bin/grep -Eq '^[0-9a-f]{40}$'; then
      exec /usr/bin/sudo -n "$OPERATOR" deploy "$sha"
    fi
    printf 'IA-TB DEBUG: invalid commit SHA\n' >&2
    exit 126
    ;;
  *)
    printf 'IA-TB DEBUG: command denied\n' >&2
    exit 126
    ;;
esac
