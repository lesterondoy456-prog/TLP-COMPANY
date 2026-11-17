FROM node:24-bookworm-slim
ENV NODE_ENV=production HOST=0.0.0.0 PORT=5188
WORKDIR /app/server
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY server.js db.js ./
COPY Api/ ./Api/
COPY migration/ ./migration/
COPY templates/ ./templates/
USER node
EXPOSE 5188
HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=3 CMD node -e "fetch('http://127.0.0.1:5188/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
