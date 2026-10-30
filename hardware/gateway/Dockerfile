# Published upstream multi-architecture manifest, verified 2026-10-29.
FROM xoseperez/basicstation:v2.8.6@sha256:cb67945c657012c67145dccdd756baf9a16ba095142cd458db2a5ef9ba97ca10
ARG VCS_REF=unknown
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-websockets \
    && rm -rf /var/lib/apt/lists/*
LABEL org.opencontainers.image.source="https://github.com/erik-metz/hack-the-ried" \
      org.opencontainers.image.title="HackTheRied RAK2287 gateway" \
      org.opencontainers.image.revision="${VCS_REF}"
COPY --chmod=755 scripts/gateway-start scripts/gateway-healthcheck /usr/local/bin/
COPY bridge/ /app/gateway-bridge/
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 CMD ["gateway-healthcheck"]
CMD ["gateway-start"]
