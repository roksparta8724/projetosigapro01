FROM node:22-alpine
WORKDIR /app
COPY --chown=node:node gateway.mjs ./gateway.mjs
USER node
EXPOSE 8080
CMD ["node", "gateway.mjs"]
