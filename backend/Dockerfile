FROM oven/bun:1-alpine AS build
WORKDIR /app
COPY package.json ./
RUN bun install
COPY tsconfig.json ./
COPY src ./src
RUN bun run build

FROM oven/bun:1-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json ./
RUN bun install --production
COPY --from=build /app/dist ./dist
EXPOSE 8080
CMD ["bun", "run", "start"]
