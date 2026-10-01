import { spawnSync } from "node:child_process";

export interface RoutingRule {
  id: string;
  matchers: { type: string; field?: string; value?: string }[];
}

export class CfCommandError extends Error {
  readonly exitCode: number;

  constructor(message: string, exitCode: number) {
    super(message);
    this.exitCode = exitCode;
  }
}

export function runCf(args: string[], accountId?: string): string {
  const result = spawnSync("cf", args, {
    encoding: "utf8",
    env: accountId ? { ...process.env, CLOUDFLARE_ACCOUNT_ID: accountId } : process.env,
    stdio: ["inherit", "pipe", "inherit"],
  });

  if (result.error) {
    if ("code" in result.error && result.error.code === "ENOENT") {
      throw new Error("The official Cloudflare CLI (cf) is required on PATH.");
    }

    throw result.error;
  }

  if (result.status !== 0) {
    throw new CfCommandError(
      result.signal ? `cf stopped with ${result.signal}.` : `cf exited with code ${result.status}.`,
      result.status ?? 1,
    );
  }

  return result.stdout;
}

export function listCf(args: string[], accountId?: string): Record<string, unknown>[] {
  const items: Record<string, unknown>[] = [];
  const pageSize = 50;

  for (let page = 1; ; page += 1) {
    const output: unknown = JSON.parse(
      runCf([...args, "--page", String(page), "--per-page", String(pageSize)], accountId),
    );

    if (
      !Array.isArray(output) ||
      !output.every((rule: unknown) => typeof rule === "object" && rule !== null)
    ) {
      throw new Error("cf returned an unexpected list response.");
    }

    items.push(...(output as Record<string, unknown>[]));

    if (output.length < pageSize) {
      return items;
    }
  }
}

export function listRules(domain: string): RoutingRule[] {
  const rules = listCf(["email-routing", "rules", "list-account", "--zone", domain]);

  if (!rules.every((rule) => typeof rule["id"] === "string" && Array.isArray(rule["matchers"]))) {
    throw new Error("cf returned an unexpected routing rule list.");
  }

  return rules as unknown as RoutingRule[];
}

export function matchesAddress(rule: RoutingRule, address: string): boolean {
  return rule.matchers.some(
    (matcher) => matcher.type === "literal" && matcher.field === "to" && matcher.value === address,
  );
}
