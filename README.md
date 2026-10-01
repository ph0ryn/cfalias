# cfalias

Manage Cloudflare Email Routing aliases through your existing `cf` CLI.

Requires Node.js 22.18+ and the [official Cloudflare CLI](https://developers.cloudflare.com/cf/) on `PATH`. Authenticate with `cf` as usual. `cfalias` does not install `cf` or store credentials. Tested with `cf` 1.0.0-beta.6.

```sh
npm install -g cfalias

export CFALIAS_DOMAIN=example.com
export CFALIAS_WORKER=header-worker

cfalias add github       # Register github@example.com
cfalias add              # Register a random temp-...@example.com address
cfalias list             # Print every page of rules as JSON
cfalias remove github    # Remove the exact alias; a full address also works
```

`add` prints the registered address, so `cfalias add | pbcopy` copies it on macOS.

Use `--domain` and `--worker` to override the environment. For direct forwarding, use `--to verified@example.com` or `CFALIAS_TO` instead of a Worker. Destinations must already be configured in Cloudflare.

Each alias uses an exact Email Routing rule. Keep catch-all disabled to stop receiving mail at removed or unregistered addresses. Rules are managed in Cloudflare; there is no local alias database.

## Development

```sh
vp install
vp check
vp run test
npm pack
```
