import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";

import { listCf } from "./cfClient.ts";

export interface AliasConfig {
  domain: string;
  worker?: string;
  to?: string;
}

function configPath(): string {
  return join(
    process.env["XDG_CONFIG_HOME"] || join(homedir(), ".config"),
    "cfalias",
    "config.json",
  );
}

export function loadConfig(): Partial<AliasConfig> {
  const file = configPath();
  const invalidSettings = `Invalid settings in ${file}. Run cfalias --configure to replace them.`;

  try {
    const config: unknown = JSON.parse(readFileSync(file, "utf8"));

    if (
      typeof config !== "object" ||
      config === null ||
      !("domain" in config) ||
      typeof config.domain !== "string" ||
      !config.domain ||
      ("worker" in config && (typeof config.worker !== "string" || !config.worker)) ||
      ("to" in config && (typeof config.to !== "string" || !config.to)) ||
      "worker" in config === "to" in config
    ) {
      throw new Error(invalidSettings);
    }

    return config as AliasConfig;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return {};
    }

    if (error instanceof SyntaxError) {
      throw new Error(invalidSettings);
    }

    throw error;
  }
}

export function saveConfig(config: AliasConfig): void {
  const file = configPath();

  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  console.error(`Settings saved to ${file}.`);
}

export async function configure(initial: Partial<AliasConfig> = {}): Promise<AliasConfig> {
  if (
    (initial.worker !== undefined || initial.to !== undefined) &&
    Boolean(initial.worker) === Boolean(initial.to)
  ) {
    throw new Error("Choose exactly one destination: --worker or --to.");
  }

  const reader = createInterface({ input: process.stdin, output: process.stderr });
  const lines = reader[Symbol.asyncIterator]();

  async function select<T>(label: string, choices: { label: string; value: T }[]): Promise<T> {
    if (choices.length === 0) {
      throw new Error(`No ${label.toLowerCase()} choices are available in Cloudflare.`);
    }

    console.error(`\n${label}`);

    for (const [index, choice] of choices.entries()) {
      console.error(`  ${index + 1}. ${choice.label}`);
    }

    for (;;) {
      reader.setPrompt("Select a number [1]: ");
      reader.prompt();

      const line = await lines.next();

      if (line.done) {
        throw new Error("Setup cancelled. Settings were not saved.");
      }

      const number = Number(line.value.trim() || "1");
      const choice = choices[number - 1];

      if (Number.isInteger(number) && choice) {
        return choice.value;
      }

      console.error(`Choose a number from 1 to ${choices.length}.`);
    }
  }

  try {
    let domain = initial.domain;
    let accountId: string | undefined = undefined;

    if (!domain || (!initial.worker && !initial.to)) {
      const zones = listCf(["zones", "list", "--status", "active", "--type", "full"]).map(
        (zone) => {
          const account = zone["account"];

          if (
            typeof zone["name"] !== "string" ||
            typeof account !== "object" ||
            account === null ||
            !("id" in account) ||
            typeof account.id !== "string"
          ) {
            throw new Error("cf returned an unexpected domain list.");
          }

          return { accountId: account.id, domain: zone["name"] };
        },
      );
      const zone = domain
        ? zones.find((entry) => entry.domain === domain)
        : await select(
            "Domain",
            zones.map((entry) => ({ label: entry.domain, value: entry })),
          );

      if (!zone) {
        throw new Error(`No active Cloudflare domain matches ${domain}.`);
      }

      domain = zone.domain;
      accountId = zone.accountId;
    }

    if (initial.worker || initial.to) {
      return { ...initial, domain };
    }

    const type = await select("Destination", [
      { label: "Email Worker", value: "worker" },
      { label: "Forward to a verified email address", value: "to" },
    ]);
    const args =
      type === "worker"
        ? ["workers", "scripts", "search", "--order-by", "name"]
        : ["email-routing", "addresses", "list", "--verified", "true"];
    const field = type === "worker" ? "script_name" : "email";
    const choices = listCf(args, accountId).map((item) => {
      const value = item[field];

      if (typeof value !== "string" || !value) {
        throw new Error("cf returned an unexpected destination list.");
      }

      return { label: value, value };
    });
    const destination = await select(type === "worker" ? "Worker" : "Forwarding address", choices);

    return { domain, [type]: destination };
  } finally {
    reader.close();
  }
}
