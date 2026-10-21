#!/bin/sh
# Entrypoint for nginx container - create runtime dirs
mkdir -p /run/nginx /var/cache/nginx /var/log/nginx
chown -R nginx:nginx /run/nginx /var/cache/nginx /var/log/nginx /usr/share/nginx/html /etc/nginx/conf.d

# Execute the original nginx entrypoint
exec /docker-entrypoint.sh "$@"