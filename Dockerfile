FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
COPY --chown=node:node server.mjs package.json ./
COPY --chown=node:node public ./public
RUN mkdir -p data/uploads && chown -R node:node data
USER node
EXPOSE 3000
CMD ["node", "server.mjs"]
