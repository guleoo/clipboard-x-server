FROM oven/bun:1.3.14 AS build
WORKDIR /src
COPY package.json bun.lock bunfig.toml tsconfig.json tsconfig.base.json build.ts README.md README_CN.md LICENSE.md ./
COPY scripts ./scripts
COPY docs ./docs
COPY web ./web
COPY server ./server
RUN bun install --frozen-lockfile
RUN bun run compile

FROM debian:bookworm-slim AS runtime
RUN groupadd --system --gid 10001 clipboard-x \
  && useradd --system --uid 10001 --gid clipboard-x --home-dir /app clipboard-x \
  && mkdir -p /app/config /app/data /app/tls /app/web /app/server/drizzle \
  && chown -R clipboard-x:clipboard-x /app
WORKDIR /app
COPY --from=build --chown=clipboard-x:clipboard-x /src/dist/clipboard-x-server ./clipboard-x-server
COPY --from=build --chown=clipboard-x:clipboard-x /src/dist/web ./web
COPY --from=build --chown=clipboard-x:clipboard-x /src/dist/server/drizzle ./server/drizzle
COPY --chown=clipboard-x:clipboard-x docker/config.yaml ./config/config.yaml
USER 10001:10001
VOLUME ["/app/config", "/app/data"]
EXPOSE 28787
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 CMD ["/app/clipboard-x-server", "--config", "/app/config/config.yaml", "--healthcheck"]
ENTRYPOINT ["/app/clipboard-x-server"]
CMD ["--config", "/app/config/config.yaml", "--migrate", "--serve"]
