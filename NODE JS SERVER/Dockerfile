FROM node:24-bookworm-slim
ENV NODE_ENV=production HOST=0.0.0.0 PORT=5189
WORKDIR /app/server
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --omit=optional --no-audit --no-fund
COPY server.js db.js ./
COPY Api/ ./Api/
COPY migration/ ./migration/
USER node
EXPOSE 5189
HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=3 CMD node -e "fetch('http://127.0.0.1:5189/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
