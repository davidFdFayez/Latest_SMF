# syntax=docker/dockerfile:1
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.27-alpine AS final
# bot-rules.conf must land in conf.d (http context) — a `map` cannot live in a
# server block. The header snippet is included per-location, so it goes in
# snippets/ where it is not auto-loaded as a server of its own.
COPY bot-rules.conf /etc/nginx/conf.d/00-bot-rules.conf
COPY security-headers.conf /etc/nginx/snippets/smf-security-headers.conf
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
