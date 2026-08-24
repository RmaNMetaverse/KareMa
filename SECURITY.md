# Security

## Reporting a vulnerability

Please report security problems privately, through GitHub's
[private vulnerability reporting](https://github.com/RmaNMetaverse/KareMa/security/advisories/new),
rather than in a public issue. Include what you found, how to reproduce it, and what
an attacker could do with it. You will get a reply as soon as reasonably possible.

## What KareMa assumes about where it runs

KareMa is built for a trusted local network — a studio LAN, a home lab, a VPN. The
defaults reflect that:

- **It serves plain HTTP.** The session cookie is therefore not marked `Secure`. If you
  expose KareMa beyond a trusted network, put a reverse proxy with TLS in front of it
  (Caddy, nginx, Traefik) and set `secure: true` on the cookie in
  `server/src/lib/auth.ts`.
- **There is no rate limiting on sign-in.** On a public network you want one, either in
  your reverse proxy or in front of `/api/auth/login`.
- **Uploaded files are served to any signed-in user** who knows the URL. Attachment
  URLs are unguessable, but they are not scoped per board.
- **Anyone with the `JWT_SECRET` can mint a session.** Keep `.env` off version control —
  it is in `.gitignore` — and generate a real secret rather than using the placeholder.
  `start.bat` and `karema.sh` do this for you on first run.

## What it does do

- Passwords are hashed with bcrypt; they are never stored or logged in the clear.
- Sessions are JWTs delivered in an `httpOnly` cookie, so page scripts cannot read them.
- Every board, list, card, comment and attachment route re-checks the caller's access
  server-side. The frontend hiding a button is never the thing that protects data.
- The admin API refuses to demote, deactivate or delete the last active administrator,
  so an instance cannot be locked out of its own admin panel.
- File uploads are size-limited (`MAX_UPLOAD_MB`), stored under generated names rather
  than user-supplied ones, and avatars are restricted to image content types.
