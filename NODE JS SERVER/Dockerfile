FROM node:24-bookworm-slim AS frontend
WORKDIR /build/SalesSystem
COPY ["SalesSystem/package.json", "SalesSystem/package-lock.json", "./"]
RUN npm ci --no-audit --no-fund
COPY SalesSystem/ ./
COPY PurchasingSystem/ /build/PurchasingSystem/
COPY WarehouseSystem/ /build/WarehouseSystem/
COPY ConfigurationSystem/ /build/ConfigurationSystem/
RUN npm run build

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=5189
WORKDIR /app/server
COPY ["NODE JS SERVER/package.json", "NODE JS SERVER/package-lock.json", "./"]
RUN npm ci --omit=dev --omit=optional --no-audit --no-fund
COPY ["NODE JS SERVER/server.js", "NODE JS SERVER/database.js", "NODE JS SERVER/services.js", "NODE JS SERVER/customers.js", "NODE JS SERVER/schema.sql", "./"]
COPY ["NODE JS SERVER/products.js", "NODE JS SERVER/purchasing-masters.js", "NODE JS SERVER/purchasing.js", "NODE JS SERVER/receiving.js", "NODE JS SERVER/inventory.js", "NODE JS SERVER/audit.js", "NODE JS SERVER/configuration.js", "NODE JS SERVER/configuration-schema.sql", "NODE JS SERVER/erp-schema.sql", "./"]
COPY ["NODE JS SERVER/components/", "./components/"]
COPY ["NODE JS SERVER/Api/", "./Api/"]
COPY --from=frontend /build/SalesSystem/dist /app/SalesSystem/dist
USER node
EXPOSE 5189
HEALTHCHECK --interval=20s --timeout=5s --start-period=30s --retries=3 CMD node -e "fetch('http://127.0.0.1:5189/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js", "--production"]
