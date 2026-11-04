# viable-harness serve in a container: agent files and course packages mounted at /agents, answered on
# port 8080 to callers with the token in VIABLE_HARNESS_TOKEN, on the model endpoint in OPENAI_BASE_URL
# and OPENAI_API_KEY (docs/self-hosting.md). Build it from this folder: docker build -t viable-harness .
FROM node:22-slim
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY bin ./bin
COPY src ./src
COPY schemas ./schemas
COPY conformance ./conformance
COPY examples ./examples
COPY LICENSE NOTICE ./
# A volume for --memory-dir /data/memory and --media-dir /data/media, writable by the user it runs as.
RUN mkdir /data && chown node:node /data
USER node
EXPOSE 8080
# What follows the image name in docker run is added: --model llama3.1, --knowledge kb_1=/knowledge, ...
ENTRYPOINT ["node", "/app/bin/viable-harness.mjs", "serve", "/agents", "--host", "0.0.0.0", "--port", "8080", "--token-env", "VIABLE_HARNESS_TOKEN"]
