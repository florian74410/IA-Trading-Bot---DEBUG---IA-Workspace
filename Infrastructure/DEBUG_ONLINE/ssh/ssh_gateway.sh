#!/bin/sh
# IA-TB DEBUG CI SSH gateway v1: no shell, no port forwarding, no Docker.
set -eu
umask 077
case "${SSH_ORIGINAL_COMMAND:-}" in
  ping)
    printf 'IA-TB_DEBUG_SSH_OK\n'
    ;;
  *)
    printf 'IA-TB DEBUG SSH: operation denied (gateway v1, ping only)\n' >&2
    exit 126
    ;;
esac
