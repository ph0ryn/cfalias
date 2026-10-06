import { randomBytes, randomInt } from "node:crypto";
import { parseArgs } from "node:util";

import packageInfo from "../package.json" with { type: "json" };
import { listRules, matchesAddress, runCf } from "./cfClient.ts";
import { type AliasConfig, configure, loadConfig, saveConfig } from "./config.ts";

const help = `Usage: ${packageInfo.name} <command> [options]

Commands:
  add [name]       Register an alias; omit the name for a random temp.* address
  list             Print all routing rules as JSON
  remove <address> Remove the exact alias (a local name also works)

Options:
  --configure      Choose and save your domain and destination
  --domain <domain> Domain to manage (CFALIAS_DOMAIN)
  --worker <value>  Route new aliases to a Worker (CFALIAS_WORKER)
  --to <email>      Forward new aliases to a verified address (CFALIAS_TO)
  -r, --random <length> Append a random suffix of the specified length (add only)
  -h, --help       Show help
  -v, --version    Show version

On first use, choose your domain and destination. Your selection is saved.
Requires the official cf CLI on PATH. Authentication uses your existing cf setup.
`;

function getDomain(value: string | undefined): string {
  if (!value) {
    throw new Error("Run cfalias --configure, or set --domain / CFALIAS_DOMAIN.");
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

function getAddress(value: string, domain: string, randomLength?: number): string {
  const parts = value.split("@");
  let local = parts[0];

  if (
    !local ||
    !/^[a-zA-Z0-9_+-]+(?:\.[a-zA-Z0-9_+-]+)*$/u.test(local) ||
    parts.length > 2 ||
    (parts.length === 2 && parts[1]?.toLowerCase() !== domain)
  ) {
    throw new Error("Use a local name or an address belonging to the configured domain.");
  }

  if (randomLength !== undefined) {
    if (local.length + 1 + randomLength > 64) {
      throw new Error("The name and random suffix must fit within 64 characters before @.");
    }

    local += `.${Array.from({ length: randomLength }, () => randomInt(36).toString(36)).join("")}`;
  }

  return `${local}@${domain}`;
}

export async function main(args: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    args,
    options: {
      configure: { type: "boolean" },
      domain: { type: "string" },
      help: { short: "h", type: "boolean" },
      random: { short: "r", type: "string" },
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

  let randomLength: number | undefined = undefined;

  if (values.random !== undefined) {
    if (positionals[0] !== "add") {
      throw new Error("--random is only used with add.");
    }

    randomLength = Number(values.random);

    if (!/^[1-9]\d*$/u.test(values.random) || randomLength > 62) {
      throw new Error("--random must be a positive integer from 1 to 62.");
    }
  }

  if (values.configure) {
    if (positionals.length > 0) {
      throw new Error("Use cfalias --configure without a command.");
    }

    const config = await configure({
      domain: values.domain === undefined ? undefined : getDomain(values.domain),
      to: values.to,
      worker: values.worker,
    });

    saveConfig(config);

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

  const saved = loadConfig();
  const environment = {
    to: process.env["CFALIAS_TO"] || undefined,
    worker: process.env["CFALIAS_WORKER"] || undefined,
  };
  const explicitDestination = values.worker !== undefined || values.to !== undefined;
  let destination: Partial<AliasConfig> = saved;

  if (explicitDestination) {
    destination = { to: values.to, worker: values.worker };
  } else if (environment.worker || environment.to) {
    destination = environment;
  }

  let settings: Partial<AliasConfig> = {
    domain: values.domain ?? (process.env["CFALIAS_DOMAIN"] || saved.domain),
    to: destination.to,
    worker: destination.worker,
  };

  if (settings.domain !== undefined) {
    settings.domain = getDomain(settings.domain);
  }

  if (
    !settings.domain ||
    (command === "add" && settings.worker === undefined && settings.to === undefined)
  ) {
    if (process.stdin.isTTY) {
      const config = await configure(settings);

      saveConfig(config);
      settings = config;
    }
  }

  const domain = getDomain(settings.domain);

  if (command === "list") {
    console.log(JSON.stringify(listRules(domain), null, 2));

    return;
  }

  const address = getAddress(
    name ?? (randomLength === undefined ? `temp.${randomBytes(6).toString("hex")}` : "temp"),
    domain,
    randomLength,
  );

  if (command === "remove") {
    const matches = listRules(domain).filter((rule) => matchesAddress(rule, address));

    if (matches.length > 1) {
      throw new Error(`Multiple routing rules match ${address}; resolve them with cf first.`);
    }

    const rule = matches[0];

    if (!rule) {
      throw new Error(`No routing rule exists for ${address}.`);
    }

    runCf(["email-routing", "rules", "delete", rule.id, "--zone", domain, "--force"]);
    console.error("Alias removed.");
    console.log(address);

    return;
  }

  const { worker, to } = settings;

  if (Boolean(worker) === Boolean(to)) {
    throw new Error("Run cfalias --configure, or set exactly one of --worker or --to.");
  }

  if (listRules(domain).some((rule) => matchesAddress(rule, address))) {
    throw new Error(`A routing rule already exists for ${address}.`);
  }

  runCf([
    "email-routing",
    "rules",
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

  console.error(`Alias created (${worker ? `Worker: ${worker}` : `Forward to: ${to}`}).`);
  console.log(address);
}
