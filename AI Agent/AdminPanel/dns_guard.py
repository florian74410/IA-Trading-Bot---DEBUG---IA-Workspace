#!/usr/bin/env python3
"""Fail-closed public DNS preflight for IA-TB Admin Phase 3.

Unlike glibc 'getent ahostsv6', the AF_INET6 lookup uses flags=0, not
AI_V4MAPPED: IPv4-mapped results must not be mistaken for real AAAA records.
The comparison is exact and forbids native IPv6 until the GEN-1 address,
firewall and TLS reachability have been independently reviewed.
"""
from __future__ import annotations

import ipaddress
import socket
import sys


class DNSPreflightError(RuntimeError):
    pass


def verify_public_dns(host: str, expected_v4: str) -> tuple[list[str], list[str]]:
    expected = ipaddress.IPv4Address(expected_v4)
    try:
        rows4 = socket.getaddrinfo(host, None, socket.AF_INET, socket.SOCK_STREAM, 0, 0)
    except socket.gaierror as exc:
        raise DNSPreflightError(f"IPv4 DNS resolution failed: {exc}") from exc

    addresses4 = {ipaddress.IPv4Address(row[4][0]) for row in rows4}
    if addresses4 != {expected}:
        raise DNSPreflightError(
            "Unexpected DNS IPv4 addresses: "
            + ", ".join(map(str, sorted(addresses4)))
            + f"; expected only {expected}"
        )

    try:
        rows6 = socket.getaddrinfo(host, None, socket.AF_INET6, socket.SOCK_STREAM, 0, 0)
    except socket.gaierror as exc:
        # A valid A-only hostname normally returns EAI_NONAME for AF_INET6.
        if exc.errno in {socket.EAI_NONAME, getattr(socket, "EAI_NODATA", socket.EAI_NONAME)}:
            rows6 = []
        else:
            raise DNSPreflightError(f"IPv6 DNS resolution failed; cannot safely proceed: {exc}") from exc

    native6 = set()
    mapped4 = set()
    for row in rows6:
        addr = ipaddress.IPv6Address(row[4][0])
        if addr.ipv4_mapped is not None:
            mapped4.add(addr.ipv4_mapped)
        else:
            native6.add(addr)

    if mapped4 and mapped4 != {expected}:
        raise DNSPreflightError("Unexpected IPv4-mapped IPv6 addresses")
    if native6:
        raise DNSPreflightError(
            "Real IPv6 AAAA/NSS records detected: "
            + ", ".join(map(str, sorted(native6)))
            + "; verify GEN-1 IPv6 assignment and firewall before publication"
        )
    return [str(expected)], []


def main() -> int:
    if len(sys.argv) != 3:
        print("usage: dns_guard.py HOST EXPECTED_IPV4", file=sys.stderr)
        return 2
    try:
        a, aaaa = verify_public_dns(sys.argv[1], sys.argv[2])
    except (DNSPreflightError, ValueError, OSError) as exc:
        print(f"PHASE3_UPGRADE_ABORT: DNS validation: {exc}", file=sys.stderr)
        return 1
    print("DNS_A_OK:", ", ".join(a))
    print("DNS_NATIVE_AAAA_NONE: IPv4-mapped results are not real AAAA records")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
