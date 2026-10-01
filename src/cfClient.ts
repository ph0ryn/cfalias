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

export function runCf(args: string[]): string {
  const result = spawnSync("cf", ["email-routing", "rules", ...args], {
    encoding: "utf8",
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

export function listRules(domain: string): RoutingRule[] {
  const rules: RoutingRule[] = [];
  const pageSize = 50;

  for (let page = 1; ; page += 1) {
    const output: unknown = JSON.parse(
      runCf([
        "list-account",
        "--zone",
        domain,
        "--page",
        String(page),
        "--per-page",
        String(pageSize),
      ]),
    );

    if (
      !Array.isArray(output) ||
      !output.every(
        (rule: unknown) =>
          typeof rule === "object" &&
          rule !== null &&
          "id" in rule &&
          typeof rule.id === "string" &&
          "matchers" in rule &&
          Array.isArray(rule.matchers),
      )
    ) {
      throw new Error("cf returned an unexpected routing rule list.");
    }

    rules.push(...(output as RoutingRule[]));

    if (output.length < pageSize) {
      return rules;
    }
  }
}

export function matchesAddress(rule: RoutingRule, address: string): boolean {
  return rule.matchers.some(
    (matcher) => matcher.type === "literal" && matcher.field === "to" && matcher.value === address,
  );
}
