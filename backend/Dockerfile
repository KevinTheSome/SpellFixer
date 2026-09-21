FROM oven/bun:1-alpine
WORKDIR /app
COPY package.json bun.lock* tsconfig.json ./
COPY src ./src
COPY content ./content
RUN bun install --frozen-lockfile || bun install
ENV PORT=3000
EXPOSE 3000
CMD ["bun", "src/index.ts"]
