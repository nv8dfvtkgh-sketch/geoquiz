# Image de production : construit les données Natural Earth et le code, puis ne garde que l'essentiel.
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run data && npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000
COPY package*.json ./
RUN npm install --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/public ./public
COPY --from=build /app/data/build ./data/build
EXPOSE 3000
CMD ["node", "dist/server.js"]
