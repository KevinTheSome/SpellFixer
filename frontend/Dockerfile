FROM oven/bun:1 AS build
WORKDIR /app
COPY package.json bun.lock* tsconfig*.json vite.config.ts index.html ./
COPY public ./public
COPY src ./src
ARG VITE_API_URL=http://localhost:3000
ENV VITE_API_URL=$VITE_API_URL
RUN bun install --frozen-lockfile || bun install
RUN bunx vite build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
RUN printf 'server { listen 80; root /usr/share/nginx/html; index index.html; location / { try_files $uri $uri/ /index.html; } }\n' > /etc/nginx/conf.d/default.conf
EXPOSE 80
