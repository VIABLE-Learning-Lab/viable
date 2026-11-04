# viable-harness serve in a container: agent files and course packages mounted at /agents, answered on
# port 8080 to callers with the token in VIABLE_HARNESS_TOKEN, on the model endpoint in OPENAI_BASE_URL
# and OPENAI_API_KEY (docs/self-hosting.md). Build it from this folder: docker build -t viable-harness .
# The learner pages' browser files are built first, with the dev dependencies they need. They are the same
# files on every platform, so this runs on the builder's own: esbuild crashes under QEMU in a cross-build.
FROM --platform=$BUILDPLATFORM node:22-slim AS assets
WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY src ./src
COPY schemas ./schemas
COPY scripts/build-learner-assets.mjs ./scripts/build-learner-assets.mjs
RUN npm run build:assets

FROM node:22-slim
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY bin ./bin
COPY src ./src
COPY --from=assets /build/dist ./dist
COPY schemas ./schemas
COPY conformance ./conformance
COPY examples ./examples
COPY LICENSE NOTICE ./
# A volume for --data-dir /data, writable by the user it runs as; /agents, empty until you mount it.
RUN mkdir /agents /data && chown node:node /data
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD node -e "fetch('http://127.0.0.1:8080/health').then((r)=>process.exit(r.ok?0:1),()=>process.exit(1))"
# What follows the image name in docker run is added: --model llama3.1, --data-dir /data, --keep-days 180, ...
ENTRYPOINT ["node", "/app/bin/viable-harness.mjs", "serve", "/agents", "--host", "0.0.0.0", "--port", "8080", "--token-env", "VIABLE_HARNESS_TOKEN"]
