# {{title}} in a container. Build: docker build -t {{name}} .
FROM node:22-slim
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8080 VIABLE_HARNESS_DATA_DIR=/data
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev && npm cache clean --force
COPY server.js{{#store}} records.js{{/store}} models.json ./
COPY package ./package
COPY vendor ./vendor
# A volume for what it keeps, writable by the user it runs as.
RUN mkdir /data && chown node:node /data
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/health').then((r)=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "server.js"]
