# The edge proxy

## What this is, and why it was missing

The `web` and `admin` containers listen on plain HTTP and publish to the host
as `:8080` and `:8081`. The site answers on HTTPS. Something in front of them
has always been terminating TLS and choosing which hostname goes where — and
that something lived only on the server. There was no copy in this
repository, so the site could not be rebuilt from git alone. If the machine
were lost, the containers would come back and the way in would not.

This directory is that piece, written down.

You can see the gap from outside without logging in anywhere:

```bash
curl -sSI https://smf.187-124-4-73.sslip.io/ | grep -i '^server'
# Server: nginx/1.29.8
```

Both `web/nginx.conf` and `admin/nginx.conf` set `server_tokens off`, so
neither of them produced that line. Whatever did is not in this repository.

## What it does

Very little, deliberately. The containers already set their own security
headers, serve their own `robots.txt`, refuse scrapers, and proxy `/api` to
the API over the internal network. Repeating any of that here would give two
places to change, and one of them would go stale.

The edge does only what a container cannot do for itself:

- holds the certificates and terminates TLS;
- sends plain HTTP to HTTPS, except the ACME challenge path;
- routes `smf.…` to `:8080` and `admin.…` to `:8081`;
- adds `Strict-Transport-Security`, which is only meaningful on a connection
  that is already TLS;
- passes `X-Forwarded-Proto`, without which the application believes it is on
  plain HTTP and builds links that are;
- answers a request for any other hostname with `444` rather than handing it
  whichever server block comes first;
- reports no nginx version.

## Adopting it

The server is already serving traffic through a proxy that is not this one.
Switching over is a few minutes of downtime at most, and is reversible.

**1. Find what is running now, and keep it.**

```bash
systemctl is-active nginx          # a host nginx?
docker ps --filter publish=443     # or a container?
cp -a /etc/nginx /root/nginx-backup-$(date +%F)
```

**2. Check where the certificates are.** The compose file expects
`/etc/letsencrypt/live/<hostname>/`. If they are somewhere else, change the
two `ssl_certificate` pairs in `nginx.conf` rather than moving the files.

If there are none yet:

```bash
apt install certbot
certbot certonly --standalone -d smf.187-124-4-73.sslip.io
certbot certonly --standalone -d admin.187-124-4-73.sslip.io
```

**3. Check the config parses, before anything is switched off.** It has not
been run through `nginx -t` here, only read:

```bash
cd <repo> && docker run --rm \
  -v "$PWD/deploy/edge/nginx.conf:/etc/nginx/nginx.conf:ro" \
  -v "$PWD/deploy/edge/smf-proxy.conf:/etc/nginx/snippets/smf-proxy.conf:ro" \
  -v /etc/letsencrypt:/etc/letsencrypt:ro \
  nginx:1.27-alpine nginx -t
# Expect: syntax is ok / test is successful
```

**4. Stop the old proxy and start this one.**

```bash
systemctl stop nginx && systemctl disable nginx   # if it was the host's
cd <repo> && docker compose \
  -f docker-compose.yml -f deploy/edge/docker-compose.edge.yml up -d
```

**5. Check it, from your own machine rather than the server.**

```bash
curl -sSI https://smf.187-124-4-73.sslip.io/ | grep -iE '^(server|strict-transport)'
# Expect: Server: nginx   (no version)
#         Strict-Transport-Security: max-age=31536000; includeSubDomains

curl -sS -o /dev/null -w '%{http_code}\n' http://smf.187-124-4-73.sslip.io/
# Expect: 301

curl -sSI https://admin.187-124-4-73.sslip.io/login | grep -i x-frame-options
# Expect: DENY — proof the console's own headers still come through.
```

**To go back**, stop the `smf-edge` container and start the old proxy again.
Nothing else in the stack changed.

## Before production

The hostnames here are the staging ones. At cutover to `saudimuaythai.sa`
they change in three places that must agree, or links will point at staging:

- the two `server_name` lines and the certificate paths in `nginx.conf`;
- `Admin__BaseUrl` and `Site__BaseUrl` in `docker-compose.yml`;
- the DNS and firewall steps in [`../LAUNCH-RUNBOOK.md`](../LAUNCH-RUNBOOK.md).

Behind Cloudflare the `Server` header becomes `cloudflare` and HSTS can be
set at the edge there instead. Keeping both is harmless.
