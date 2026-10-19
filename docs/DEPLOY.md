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

## Once: the Cloudflare Pages project and the domain

1. `bun add -g wrangler` (or `bunx wrangler`), then `wrangler login`.
2. Create the project on the first deploy: `wrangler pages deploy site/dist --project-name selah`.
   Direct upload needs no build configuration on Cloudflare's side — the site is built here.
3. In the Cloudflare dashboard, **Workers & Pages → selah → Custom domains → Set up a domain**, and
   add `selah.noxidsoft.stream`. With `noxidsoft.stream` on the same account the DNS record is made
   for you; otherwise add a `CNAME` for `selah` pointing at `selah.pages.dev` and finish the check.
4. Confirm the installers are served as text, not downloaded as files:

   ```sh
   curl -sI https://selah.noxidsoft.stream/install | grep -i content-type   # text/plain
   ```

   `site/build.ts` writes the `_headers` file that does this; Pages applies it on deploy.

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

4. Build and deploy the site, which copies `install.sh` to `/install` and `/install.sh`,
   `install.ps1` to `/install.ps1`, and the verified plates to `/scenes/`:

   ```sh
   bun site/build.ts
   wrangler pages deploy site/dist --project-name selah
   ```

5. Check the line a stranger will run:

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
  Until the domain resolves, every plate falls back to Gutenberg after two tries, which makes
  `selah install scenes` noticeably slower but no less correct.
- `/engravings`, `/demo`, `/docs`, `/keys`, `/changelog`, `/download` — pages built from the app's
  own data. The demo videos under `docs/demo/` are recorded with `bun scripts/product-demo.tsx`;
  the recordings still show the old install line until they are recorded again.
