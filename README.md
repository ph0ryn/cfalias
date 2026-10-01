# cfalias

Manage Cloudflare Email Routing aliases through your existing `cf` CLI.

Requires Node.js 22.18+ and the [official Cloudflare CLI](https://developers.cloudflare.com/cf/) on `PATH`. Authenticate with `cf` as usual. `cfalias` does not install `cf` or store credentials. Tested with `cf` 1.0.0-beta.6.

```sh
npm install -g cfalias

cfalias add github       # Choose your domain and destination on first use
cfalias add              # Register a random temp-... address
cfalias list             # Print every page of rules as JSON
cfalias remove github    # Remove the exact alias; a full address also works
```

On first use in a terminal, select an active domain from Cloudflare, then an Email Worker or a verified Destination address. Your selection is saved in `~/.config/cfalias/config.json` (or `$XDG_CONFIG_HOME/cfalias/config.json`), so no environment setup is needed. Run `cfalias --configure` to change it.

`add` prints the registered address, so `cfalias add | pbcopy` copies it on macOS.

Use `--domain` with `--worker` or `--to` to override saved settings for one invocation. `CFALIAS_DOMAIN`, `CFALIAS_WORKER`, and `CFALIAS_TO` also work; priority is options, environment, then saved settings. Destinations must already be configured in Cloudflare. For noninteractive setup, use `cfalias --configure --domain example.com --worker header-worker`.

Each alias uses an exact Email Routing rule. Keep catch-all disabled to stop receiving mail at removed or unregistered addresses. Rules are managed in Cloudflare; there is no local alias database.

## Development

```sh
vp install
vp check
vp run test
npm pack
```

## Publishing

GitHub Actions checks branches and pull requests. Tags matching `v<package.json version>` publish through npm Trusted Publishing; the existing `prepublishOnly` script runs checks, tests, and the build before publishing.

Publish the first version with your npm login, then register `ph0ryn/cfalias` and `publish.yml` as the Trusted Publisher (npm 11.15+):

```sh
npm login
npm publish --access public
npm trust github cfalias --repo ph0ryn/cfalias --file publish.yml --allow-publish
```

The first version must exist before you can register the publisher. Later releases use GitHub Actions OIDC without an npm token. See the [npm trusted publishing requirements](https://docs.npmjs.com/trusted-publishers/).

After configuring the publisher, release a new version with:

```sh
npm version patch -m "chore(release): %s"
git push origin main --follow-tags
```
