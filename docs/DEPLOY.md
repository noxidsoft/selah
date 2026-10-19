# Releasing Selah and serving the install line

Everything a reader touches comes from two places this repository controls: the GitHub releases of
`noxidsoft/selah` (the binaries and their `SHA256SUMS`) and the site at `selah.noxidsoft.stream`
(the install scripts and the copy of Doré's plates). The one-liner

```sh
curl -fsSL https://selah.noxidsoft.stream/install | sh
```

downloads `install.sh` from the site, which then downloads the binary for the reader's system from
the release and refuses it unless it matches the release's `SHA256SUMS`. Nothing points at any
other account.

The site is static: `bun site/build.ts` writes a directory of plain files, and `/install` is
`install.sh` copied in. It is served by nginx, behind Cloudflare's proxy — nothing dynamic runs.

## Once: the server

1. Point `selah.noxidsoft.stream` at the host in Cloudflare DNS (proxied), and with a real
   certificate on the origin set SSL/TLS mode to **Full (strict)**.
2. Make the webroot and give it to nginx (`/srv/selah` below), and get a certificate for the
   origin: `certbot --nginx -d selah.noxidsoft.stream`.
3. Three things nginx does not do by default, which the site needs:

   - **Extensionless pages.** The build writes `docs.html`, `keys.html`, `changelog.html`, and
     every link points at `/docs`, `/keys`, `/changelog`; `try_files` bridges the two.
   - **`/install` has no extension**, so nginx would serve it as `application/octet-stream`.
   - **`site/dist/_headers` is Cloudflare Pages' format** and nginx ignores it, so the cache and
     hardening headers it lists live in the server block instead.

   ```nginx
   server {
       listen 443 ssl;
       http2 on;
       server_name selah.noxidsoft.stream;

       ssl_certificate     /etc/letsencrypt/live/selah.noxidsoft.stream/fullchain.pem;
       ssl_certificate_key /etc/letsencrypt/live/selah.noxidsoft.stream/privkey.pem;

       root /srv/selah;
       index index.html;

       add_header X-Content-Type-Options nosniff always;
       add_header Referrer-Policy strict-origin-when-cross-origin always;
       add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;

       # /docs → docs.html
       location / {
           try_files $uri $uri.html $uri/index.html =404;
       }

       # the install line: text to read, not a file to download
       location ~ ^/install(\.sh|\.ps1)?$ {
           default_type text/plain;
           charset utf-8;
           add_header Cache-Control "public, max-age=300" always;
       }

       # the plates `selah install scenes` pulls, pinned by SHA-256 in the app
       location /scenes/     { add_header Cache-Control "public, max-age=31536000, immutable" always; }
       location /engravings/ { add_header Cache-Control "public, max-age=2592000" always; }
       location /media/      { add_header Cache-Control "public, max-age=604800" always; }

       error_page 404 /404.html;
   }

   server {
       listen 80;
       server_name selah.noxidsoft.stream;
       return 301 https://$host$request_uri;
   }
   ```

   `add_header` in a `location` replaces the server-level ones rather than adding to them, so the
   three hardening headers do not reach `/install` or `/scenes/` as written. Restate them in those
   blocks if you want them everywhere, or use the headers-more module's `more_set_headers`.

4. After the first deploy, check the line a stranger will run:

   ```sh
   curl -sI https://selah.noxidsoft.stream/install | grep -i content-type   # text/plain
   curl -sS -o /dev/null -w '%{http_code}\n' https://selah.noxidsoft.stream/docs   # 200, not 404
   ```

## Every release

The site's `/download` and `/changelog` pages are built from the GitHub API, and the build **fails
with `no published release on GitHub to offer on /download`** until this repository has one
published, non-prerelease release. So the release comes first.

1. Bump `version` in `package.json` (and `pkgver` in `packaging/aur/selah-bin/PKGBUILD`).
2. Build every target and the checksums:

   ```sh
   bun install --os='*' --cpu='*'      # every platform's OpenTUI core, for cross-compiling
   bun run release                     # dist/release/* and dist/release/SHA256SUMS
   ```

3. Publish the release on `noxidsoft/selah` with **every** file in `dist/release`, `SHA256SUMS`
   included — the installers fetch it by name from the same release:

   ```sh
   gh release create v0.3.3 dist/release/* --repo noxidsoft/selah --title v0.3.3 --notes-file NOTES.md
   ```

   Every asset name in `PLATFORM` (`site/pages.ts`) must be there: `/download` lists them all and
   `test/site.test.ts` fetches each link, so a release missing one build still builds a page but
   fails the tests.

4. Build the site, which copies `install.sh` to `/install` and `/install.sh`, `install.ps1` to
   `/install.ps1`, and the verified plates to `/scenes/`, then publish it:

   ```sh
   export GITHUB_TOKEN=$(gh auth token)
   bun site/build.ts
   rsync -az --delete --chmod=D755,F644 site/dist/ prodhub:/var/www/noxidsoft.stream/public_html/selah/
   ```

   The build reads this repository's releases from the GitHub API, which allows 60 requests an
   hour unauthenticated and then answers `403`, so give it a token. A build that has succeeded
   once can repeat without one: `site/.cache/releases.json` is the fallback.

   `--delete` is what keeps the webroot equal to the build; the first deploy replaces the empty
   `index.html` that is there now. Cloudflare is proxying, so purge its cache afterwards —
   **Caching → Configuration → Purge Everything** in the dashboard, or the zone's purge API.

5. Install it the way a reader would, into a directory you can throw away:

   ```sh
   SELAH_INSTALL_DIR=$(mktemp -d) sh -c 'curl -fsSL https://selah.noxidsoft.stream/install | sh'
   ```

6. For the AUR package, regenerate the checksums — a release's bytes are its own:

   ```sh
   cd packaging/aur/selah-bin && updpkgsums && makepkg --printsrcinfo > .SRCINFO
   ```

## What the site serves, and what depends on it

- `/install`, `/install.sh`, `/install.ps1` — copied from the repository root at build time, so the
  scripts in git are the scripts readers run.
- `/scenes/<plate>.jpg` — the 100 Doré plates, which `selah install scenes` tries before Project
  Gutenberg (`SCENES_MIRROR` in `src/data/scenes.ts`). Each plate is checked against its pinned
  SHA-256 whichever source answered, so serving them is a convenience, never a trust boundary.
  Until they are deployed, every plate falls back to Gutenberg after two tries, which makes
  `selah install scenes` noticeably slower but no less correct.
- `/engravings`, `/demo`, `/docs`, `/keys`, `/changelog`, `/download` — pages built from the app's
  own data. The demo videos under `docs/demo/` are recorded with `bun scripts/product-demo.tsx`;
  the recordings still show the old install line until they are recorded again.
- `site/dist/_headers` — unused by nginx. It is written for a Cloudflare Pages deploy, which this
  site no longer uses; the server block above carries the same rules.
