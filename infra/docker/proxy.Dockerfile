# syntax=docker/dockerfile:1
# Caddy reverse proxy image (Phase 7). Build context = repo root:
#   bash scripts/stack.sh build
# The official binary carries the file capability cap_net_bind_service=+ep.
# Under compose's cap_drop: [ALL] the kernel then refuses to exec it (EPERM).
# Caddy listens on 8443/8080 only, so drop the file capability instead of
# granting NET_BIND_SERVICE to the container.
ARG CADDY_IMAGE=caddy:2-alpine@sha256:6aeddd44c3078b0f9a35206472a11420648a79c184603ef95957d0a20044cb2b

FROM ${CADDY_IMAGE}
RUN setcap -r /usr/bin/caddy && test -z "$(getcap /usr/bin/caddy)"
