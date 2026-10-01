import { randomBytes } from "node:crypto";
import { parseArgs } from "node:util";

import packageInfo from "../package.json" with { type: "json" };
import { listRules, matchesAddress, runCf } from "./cfClient.ts";

const help = `Usage: ${packageInfo.name} <command> [options]

Commands:
  add [name]       Register an alias; omit the name for a random temp-* address
  list             Print all routing rules as JSON
  remove <address> Remove the exact alias (a local name also works)

Options:
  --domain <domain> Domain to manage (CFALIAS_DOMAIN)
  --worker <value>  Route new aliases to a Worker (CFALIAS_WORKER)
  --to <email>      Forward new aliases to a verified address (CFALIAS_TO)
  -h, --help       Show help
  -v, --version    Show version

Requires the official cf CLI on PATH. Authentication uses your existing cf setup.
`;

function getDomain(value: string | undefined): string {
  if (!value) {
    throw new Error("Set --domain or CFALIAS_DOMAIN.");
  }

  const domain = value.toLowerCase();
  const labels = domain.split(".");

  if (
    labels.length < 2 ||
    !labels.every((label) => /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/u.test(label))
  ) {
    throw new Error("--domain must be a domain name.");
  }

  return domain;
}

function getAddress(value: string, domain: string): string {
  const parts = value.split("@");
  const local = parts[0];

  if (
    !local ||
    !/^[a-zA-Z0-9_+-]+(?:\.[a-zA-Z0-9_+-]+)*$/u.test(local) ||
    parts.length > 2 ||
    (parts.length === 2 && parts[1]?.toLowerCase() !== domain)
  ) {
    throw new Error("Use a local name or an address belonging to the configured domain.");
  }

  return `${local}@${domain}`;
}

export function main(args: string[]): void {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    args,
    options: {
      domain: { type: "string" },
      help: { short: "h", type: "boolean" },
      to: { type: "string" },
      version: { short: "v", type: "boolean" },
      worker: { type: "string" },
    },
  });

  if (values.help || args.length === 0) {
    process.stdout.write(help);

    return;
  }

  if (values.version) {
    console.log(packageInfo.version);

    return;
  }

  const [command, name] = positionals;

  if (
    !["add", "list", "remove"].includes(command ?? "") ||
    positionals.length > 2 ||
    (command === "list" && name !== undefined) ||
    (command === "remove" && name === undefined)
  ) {
    throw new Error("Use add [name], list, or remove <address>. See --help.");
  }

  if (command !== "add" && (values.worker !== undefined || values.to !== undefined)) {
    throw new Error("--worker and --to are only used with add.");
  }

  const domain = getDomain(values.domain ?? process.env["CFALIAS_DOMAIN"]);

  if (command === "list") {
    console.log(JSON.stringify(listRules(domain), null, 2));

    return;
  }

  const address = getAddress(name ?? `temp-${randomBytes(6).toString("hex")}`, domain);

  if (command === "remove") {
    const matches = listRules(domain).filter((rule) => matchesAddress(rule, address));

    if (matches.length > 1) {
      throw new Error(`Multiple routing rules match ${address}; resolve them with cf first.`);
    }

    const rule = matches[0];

    if (!rule) {
      throw new Error(`No routing rule exists for ${address}.`);
    }

    runCf(["delete", rule.id, "--zone", domain, "--force"]);
    console.log(address);

    return;
  }

  const worker =
    values.worker ?? (values.to === undefined ? process.env["CFALIAS_WORKER"] : undefined);
  const to = values.to ?? (values.worker === undefined ? process.env["CFALIAS_TO"] : undefined);

  if (Boolean(worker) === Boolean(to)) {
    throw new Error("Set exactly one of --worker / CFALIAS_WORKER or --to / CFALIAS_TO.");
  }

  if (listRules(domain).some((rule) => matchesAddress(rule, address))) {
    throw new Error(`A routing rule already exists for ${address}.`);
  }

  runCf([
    "create",
    "--zone",
    domain,
    "--body",
    JSON.stringify({
      actions: [{ type: worker ? "worker" : "forward", value: [worker || to] }],
      enabled: true,
      matchers: [{ field: "to", type: "literal", value: address }],
    }),
  ]);

  console.log(address);
}
