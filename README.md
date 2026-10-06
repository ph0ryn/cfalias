# cfalias

Manage Cloudflare Email Routing aliases through your existing `cf` CLI.

Requires Node.js 22.18+ and the [official Cloudflare CLI](https://developers.cloudflare.com/cf/) on `PATH`. Authenticate with `cf` as usual. `cfalias` does not install `cf` or store credentials. Tested with `cf` 1.0.0-beta.6.

```sh
pnpm add -g cfalias

cfalias add github       # Choose your domain and destination on first use
cfalias add -r 5 github  # Register github.<5 random characters>@your-domain
cfalias add              # Register a random temp.<12 hex characters> address
cfalias list             # Print every page of rules as JSON
cfalias remove github    # Remove the exact alias; a full address also works
```

On first use in a terminal, select an active domain from Cloudflare, then an Email Worker or a verified Destination address. Your selection is saved in `~/.config/cfalias/config.json` (or `$XDG_CONFIG_HOME/cfalias/config.json`), so no environment setup is needed. Run `cfalias --configure` to change it.

`add` prints the registered address, so `cfalias add | pbcopy` copies it on macOS.

Use `add -r <length> [name]` (or `--random <length>`) to append a dot and the requested number of random lowercase letters and digits. The length is required and must be a positive integer; `-r5` also works. Without a name, the prefix is `temp`. The name, dot, and suffix must fit within 64 characters before `@`. Without `-r`, `add` with no name generates `temp.` followed by 12 hexadecimal characters.

Use `--domain` with `--worker` or `--to` to override saved settings for one invocation. `CFALIAS_DOMAIN`, `CFALIAS_WORKER`, and `CFALIAS_TO` also work; priority is options, environment, then saved settings. Destinations must already be configured in Cloudflare. For noninteractive setup, use `cfalias --configure --domain example.com --worker header-worker`.

Each alias uses an exact Email Routing rule. Keep catch-all disabled to stop receiving mail at removed or unregistered addresses. Rules are managed in Cloudflare; there is no local alias database.

## Development

```sh
vp install
vp check
vp run test
pnpm pack
```
