# The server has no dependencies, so there is nothing to install and no
# build step — copying the source is the whole image.
FROM node:22-alpine

WORKDIR /app
COPY package.json ./
COPY src ./src

# Runs as a non-root user; the server only reads stdin and makes outbound
# HTTPS calls, so it needs nothing else.
USER node

ENTRYPOINT ["node", "src/index.js"]
