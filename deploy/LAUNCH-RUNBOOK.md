# SMF Launch Runbook — production cutover to `saudimuaythai.sa`

Covers **SEC-03 → SEC-06**. Staging (`smf.187-124-4-73.sslip.io`) is *not*
representative: it sits directly on the origin, outside the federation's
Cloudflare zone, so none of the edge protections below apply there. Every check
in this file has to be repeated on the production hostname after cutover.

---

## 1. What is already in the repo

| Item | Where | Effect |
|---|---|---|
| Security response headers, public site | `web/security-headers.conf`, included per-location by `web/nginx.conf` | CSP, X-Frame-Options, X-Content-Type-Options, HSTS, Referrer-Policy, Permissions-Policy |
| Security response headers, admin | `admin/nginx.conf` | as above, plus `X-Robots-Tag: noindex` |
| Security response headers, API | `backend/Smf.Api/Program.cs` (header middleware) | same six headers on every API response |
| `server_tokens off` | `web/nginx.conf`, `admin/nginx.conf` | no `nginx/<version>` banner |
| `AddServerHeader = false` | `backend/Smf.Api/Program.cs` | no `Server: Kestrel` banner |
| Real `robots.txt` | `web/public/robots.txt` (served by an exact-match location, so the SPA fallback cannot swallow it) | search engines allowed, AI/SEO bots disallowed, `/admin` and `/api/` disallowed |
| Bot blocking at server level | `web/bot-rules.conf` → `/etc/nginx/conf.d/00-bot-rules.conf` | 403 for SEO scrapers, harvesters, and AI crawlers that ignore robots.txt |
| Forwarded-header handling | `backend/Smf.Api/Program.cs` | the API rate limiter sees the real client IP through the proxy chain |

`curl` and every mainstream search engine are deliberately **not** blocked, so
the verification steps below work as written.

---

## 2. Cutover steps

### 2.1 DNS — proxied through the existing zone

In the Cloudflare dashboard for the `saudimuaythai.sa` zone:

1. Create/point `saudimuaythai.sa` and `www` at the origin IP.
2. Set the proxy status to **Proxied** (orange cloud). This is what makes the
   zone's WAF, rate limiting, Bot Fight Mode, and edge HSTS apply — a
   DNS-only record inherits none of them.
3. Do the same for the admin hostname, and keep it out of any public listing.
4. **Never** publish a hostname that resolves to the origin IP directly. The
   sslip.io staging name embeds the IP in the hostname itself and must not be
   carried over.

### 2.2 SSL/TLS

- Mode: **Full (Strict)**. Install a Cloudflare Origin Certificate on the
  origin nginx, or a publicly trusted certificate — Full (Strict) validates it.
- Enable **Always Use HTTPS** and **HSTS** at the zone (the origin already sends
  its own `Strict-Transport-Security`; the edge one is what protects the
  first request).
- Enable **Minimum TLS 1.2**.

### 2.3 Lock the origin firewall to Cloudflare

The edge is only a boundary if the origin refuses everyone else. Allow ports
80/443 **only** from Cloudflare's published ranges
(`https://www.cloudflare.com/ips-v4` and `.../ips-v6`) and drop the rest.

```bash
# Refresh the allowlist (re-run when Cloudflare publishes a change).
sudo iptables -N CF-ONLY 2>/dev/null || sudo iptables -F CF-ONLY
for ip in $(curl -s https://www.cloudflare.com/ips-v4); do
  sudo iptables -A CF-ONLY -s "$ip" -p tcp -m multiport --dports 80,443 -j ACCEPT
done
sudo iptables -A CF-ONLY -p tcp -m multiport --dports 80,443 -j DROP
sudo iptables -C INPUT -p tcp -m multiport --dports 80,443 -j CF-ONLY 2>/dev/null \
  || sudo iptables -I INPUT -p tcp -m multiport --dports 80,443 -j CF-ONLY
```

Repeat with `ip6tables` for `ips-v6`. Keep SSH restricted to the federation's
own addresses. If a host firewall is managed elsewhere (cloud security group),
apply the same allowlist there instead — the requirement is that a request
straight to the origin IP is refused, not the particular tool.

### 2.4 Application configuration

- `docker-compose.yml`: replace the placeholder `Jwt__Secret` with a generated
  secret before the first production start.
- Add the production origins to the API's CORS policy in
  `backend/Smf.Api/Program.cs` (`https://saudimuaythai.sa`, the admin host) and
  drop the sslip.io entries once staging is retired.
- Configure outbound mail so registration confirmations (REG-06) actually send:
  `Email__Host`, `Email__Port`, `Email__User`, `Email__Password`,
  `Email__From`. Without `Email__Host` the API writes each message to
  `Email__OutboxPath` (default `<contentRoot>/data/outbox`) and logs it — useful
  for staging, not acceptable for launch.

---

## 3. Verification — run against production, after cutover

### 3.1 Headers (SEC-03)

```bash
curl -sSI https://saudimuaythai.sa/ | grep -iE \
  'content-security-policy|x-frame-options|x-content-type-options|strict-transport-security|referrer-policy|permissions-policy'

curl -sSI https://saudimuaythai.sa/api/news | grep -iE \
  'content-security-policy|x-frame-options|x-content-type-options|strict-transport-security|referrer-policy|permissions-policy'
```

All six must appear on both.

### 3.2 No version banner (SEC-06)

```bash
curl -sSI https://saudimuaythai.sa/ | grep -i '^server:'
# Expect: "server: cloudflare" — never nginx/<version> or Kestrel.
```

### 3.3 robots.txt (SEC-04)

```bash
curl -sS https://saudimuaythai.sa/robots.txt | head -5
# Expect a real robots file, not "<!doctype html>".

curl -sS -o /dev/null -w '%{http_code}\n' -A 'AhrefsBot/7.0' https://saudimuaythai.sa/
# Expect 403.
```

### 3.4 Behind Cloudflare (SEC-05)

```bash
curl -sSI https://saudimuaythai.sa/ | grep -iE 'server:|cf-ray'
# Expect both "server: cloudflare" and a CF-RAY value.

curl -sS --max-time 10 http://<ORIGIN-IP>/ -H 'Host: saudimuaythai.sa'
# Expect a timeout or connection refused — never the site.
```

### 3.5 Server-side validation (SEC-01 / SEC-02)

```bash
for path in /api/registrations /api/contact /api/whistleblower; do
  printf '%s -> ' "$path"
  curl -sS -o /dev/null -w '%{http_code}\n' -X POST "https://saudimuaythai.sa$path" \
    -H 'Content-Type: application/json' -d '{}'
done
# Expect 400 on all three, never 500.

curl -sS -X POST https://saudimuaythai.sa/api/registrations \
  -H 'Content-Type: application/json' \
  -d '{"type":"athlete","payload":{"consent":true,"email":"a@b.co","phone":"+966500000000"}}'
# Expect 400 with an "errors" object keyed by field name.
```

### 3.6 Registration regression (REG-01)

With the site open in Arabic **and** again in English, from
`/registration/athlete` use the top menu to open Club, Coach, and Official in
turn. Each must load and stay loaded — no URL flicker back to the previous
form — and the AR↔EN toggle must keep working on every page without clearing
the cache.

---

## 4. After launch

- Re-run every check in section 3 whenever nginx, the API middleware, or the
  Cloudflare zone settings change.
- Refresh the origin firewall allowlist when Cloudflare publishes new ranges.
- Once the admin dashboard has a public hostname, confirm it is proxied,
  disallowed in `robots.txt`, and ideally behind Cloudflare Access.
