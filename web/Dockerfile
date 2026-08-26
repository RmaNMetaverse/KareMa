FROM node:22-alpine AS build
ARG BASE_PATH=/
ENV BASE_PATH=$BASE_PATH
WORKDIR /app
COPY package.json ./
RUN npm install --no-audit --no-fund
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
ARG BASE_PATH=/
COPY --from=build /app/dist /tmp/dist
COPY nginx.conf.template /tmp/nginx.conf.template
# Serve the bundle from the sub-path it was built for, and rewrite the
# nginx locations to match. BASE keeps a leading slash but drops the trailing one.
RUN set -eux; \
    BASE="/$(echo "$BASE_PATH" | sed 's#^/*##; s#/*$##')"; \
    if [ "$BASE" = "/" ]; then BASE=""; fi; \
    rm -rf /usr/share/nginx/html/*; \
    mkdir -p "/usr/share/nginx/html$BASE"; \
    cp -r /tmp/dist/. "/usr/share/nginx/html$BASE/"; \
    sed "s|__BASE__|$BASE|g" /tmp/nginx.conf.template > /etc/nginx/conf.d/default.conf; \
    if [ -z "$BASE" ]; then sed -i '/#base-redirect/d' /etc/nginx/conf.d/default.conf; fi; \
    rm -rf /tmp/dist /tmp/nginx.conf.template
EXPOSE 80
