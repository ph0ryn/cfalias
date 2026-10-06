import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, expect, test } from "vitest";

const packageRoot = fileURLToPath(new URL("../", import.meta.url));
const cliPath = join(packageRoot, "dist", "cli.mjs");
const fixture = readFileSync(new URL("./fixtures/cf.mjs", import.meta.url), "utf8");
const directories: string[] = [];

interface Rule {
  id: string;
  enabled: boolean;
  matchers: { type: string; field?: string; value?: string }[];
  actions: { type: string; value?: string[] }[];
}

function rule(address: string, id: string): Rule {
  return {
    actions: [{ type: "worker", value: ["header-worker"] }],
    enabled: true,
    id,
    matchers: [{ field: "to", type: "literal", value: address }],
  };
}

function sandbox(rules: Rule[] = []) {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), "cfalias-test-")));
  const stateFile = join(directory, "state.json");
  const callFile = join(directory, "calls.jsonl");

  directories.push(directory);
  writeFileSync(join(directory, "cf"), fixture, { mode: 0o755 });
  writeFileSync(stateFile, JSON.stringify({ rules }));
  writeFileSync(callFile, "");

  const env = {
    ...process.env,
    CFALIAS_DOMAIN: "example.com",
    CFALIAS_TEST_CALLS: callFile,
    CFALIAS_TEST_FAILURE: "",
    CFALIAS_TEST_STATE: stateFile,
    CFALIAS_TO: "",
    CFALIAS_WORKER: "header-worker",
    CLOUDFLARE_API_TOKEN: "test-user-token",
    CLOUDFLARE_PROFILE: "test-user-profile",
    PATH: `${directory}${delimiter}${process.env["PATH"] ?? ""}`,
    XDG_CONFIG_HOME: directory,
  };

  return {
    calls(): { args: string[]; account?: string; cwd: string; token: string; profile: string }[] {
      const content = readFileSync(callFile, "utf8").trim();

      return content ? content.split("\n").map((line) => JSON.parse(line)) : [];
    },
    directory,
    env,
    rules(): Rule[] {
      return JSON.parse(readFileSync(stateFile, "utf8")).rules;
    },
    run(args: string[], extraEnv: NodeJS.ProcessEnv = {}, input?: string) {
      return spawnSync(process.execPath, [cliPath, ...args], {
        cwd: directory,
        encoding: "utf8",
        env: { ...env, ...extraEnv },
        input,
      });
    },
  };
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

test("add registers the exact address and reuses the user's cf environment", () => {
  const instance = sandbox();
  const result = instance.run(["add", "github"]);

  expect(result.status).toBe(0);
  expect(result.stdout).toBe("github@example.com\n");
  expect(result.stderr).toBe("Alias created (Worker: header-worker).\n");
  expect(instance.rules()).toEqual([rule("github@example.com", "created-rule")]);
  expect(instance.calls().every((call) => call.cwd === instance.directory)).toBe(true);
  expect(instance.calls().every((call) => call.token === "test-user-token")).toBe(true);
  expect(instance.calls().every((call) => call.profile === "test-user-profile")).toBe(true);
});

test("add without a name creates a temporary address", () => {
  const instance = sandbox();
  const result = instance.run(["add"]);
  const address = result.stdout.trim();

  expect(result.status).toBe(0);
  expect(address).toMatch(/^temp\.[a-f0-9]{12}@example\.com$/);
  expect(instance.rules()[0]?.matchers).toEqual([{ field: "to", type: "literal", value: address }]);
});

test.each([
  { args: ["add", "-r", "3", "github"], length: 3, prefix: "github" },
  { args: ["add", "--random", "5", "github"], length: 5, prefix: "github" },
  { args: ["add", "-r3", "github@example.com"], length: 3, prefix: "github" },
  { args: ["add", "-r", "3"], length: 3, prefix: "temp" },
  { args: ["add", "-r", "62", "a"], length: 62, prefix: "a" },
])("add appends the requested random suffix: $args", ({ args, prefix, length }) => {
  const instance = sandbox([rule(`${prefix}@example.com`, "existing")]);
  const result = instance.run(args);
  const address = result.stdout.trim();

  expect(result.status).toBe(0);
  expect(address).toMatch(new RegExp(`^${prefix}\\.[a-z0-9]{${length}}@example\\.com$`));
  expect(instance.rules()[1]).toEqual(rule(address, "created-rule"));
  expect(instance.run(["remove", address]).status).toBe(0);
  expect(instance.rules()).toEqual([rule(`${prefix}@example.com`, "existing")]);
});

test("random lengths must be positive integers that fit the local part", () => {
  const instance = sandbox();

  for (const length of ["0", "-1", "1.5", "1e3", "", "abc", "64", "999999999999999999999"]) {
    const result = instance.run(["add", "github", `--random=${length}`]);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("--random must be a positive integer");
  }

  const tooLong = instance.run(["add", "github", "-r", "58"]);

  expect(tooLong.status).not.toBe(0);
  expect(tooLong.stderr).toContain("64 characters");
  expect(instance.run(["add", "github", "-r"]).status).not.toBe(0);
  expect(instance.calls()).toEqual([]);
});

test("random suffixes are only used with add and preserve address validation", () => {
  const instance = sandbox();

  for (const args of [["list"], ["remove", "github"], ["--configure"]]) {
    const result = instance.run([...args, "-r", "3"]);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("--random is only used with add");
  }

  for (const name of ["", ".", "github.", "github@other.example"]) {
    const result = instance.run(["add", name, "-r", "3"]);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Use a local name or an address");
  }

  expect(instance.calls()).toEqual([]);
});

test("saved settings allow add, list, and remove without environment setup", () => {
  const instance = sandbox();
  const configDirectory = join(instance.directory, "cfalias");
  const env = { CFALIAS_DOMAIN: "", CFALIAS_TO: "", CFALIAS_WORKER: "" };

  mkdirSync(configDirectory);

  writeFileSync(
    join(configDirectory, "config.json"),
    JSON.stringify({ domain: "example.com", worker: "header-worker" }),
  );

  expect(instance.run(["add", "saved"], env).stdout).toBe("saved@example.com\n");
  expect(JSON.parse(instance.run(["list"], env).stdout)).toHaveLength(1);
  expect(instance.run(["remove", "saved"], env).status).toBe(0);
  expect(instance.rules()).toEqual([]);
});

test("explicit options override saved settings without changing the file", () => {
  const instance = sandbox();
  const configDirectory = join(instance.directory, "cfalias");
  const configFile = join(configDirectory, "config.json");
  const config = JSON.stringify({ domain: "example.com", worker: "saved-worker" });

  mkdirSync(configDirectory);
  writeFileSync(configFile, config);

  const result = instance.run(["add", "shop", "--to", "destination@example.net"], {
    CFALIAS_WORKER: "",
  });

  expect(result.status).toBe(0);
  expect(result.stderr).toBe("Alias created (Forward to: destination@example.net).\n");

  expect(instance.rules()[0]?.actions).toEqual([
    { type: "forward", value: ["destination@example.net"] },
  ]);

  expect(readFileSync(configFile, "utf8")).toBe(config);
});

test("invalid saved settings fail before cf runs", () => {
  const instance = sandbox();
  const configDirectory = join(instance.directory, "cfalias");

  mkdirSync(configDirectory);
  writeFileSync(join(configDirectory, "config.json"), "{broken");

  const result = instance.run(["add", "github"]);

  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain("config.json");
  expect(instance.calls()).toEqual([]);
  expect(instance.run(["--help"]).status).toBe(0);
});

test("configure selects a domain and Worker once, then reuses the saved settings", () => {
  const instance = sandbox();
  const env = { CFALIAS_DOMAIN: "", CFALIAS_TO: "", CFALIAS_WORKER: "" };
  const configured = instance.run(["--configure"], env, "2\n1\n2\n");
  const configFile = join(instance.directory, "cfalias", "config.json");

  expect(configured.status).toBe(0);
  expect(configured.stdout).toBe("");

  expect(JSON.parse(readFileSync(configFile, "utf8"))).toEqual({
    domain: "other.example.net",
    worker: "other-worker",
  });

  expect(instance.calls().find((call) => call.args[0] === "workers")?.account).toBe(
    "other-account",
  );

  expect(instance.calls().every((call) => !["create", "delete"].includes(call.args[2] ?? ""))).toBe(
    true,
  );

  expect(instance.run(["add", "shop"], env).stdout).toBe("shop@other.example.net\n");
});

test("configure can select a verified forwarding address", () => {
  const instance = sandbox();
  const env = { CFALIAS_DOMAIN: "", CFALIAS_TO: "", CFALIAS_WORKER: "" };
  const result = instance.run(["--configure"], env, "1\n2\n1\n");

  expect(result.status).toBe(0);

  expect(
    JSON.parse(readFileSync(join(instance.directory, "cfalias", "config.json"), "utf8")),
  ).toEqual({
    domain: "example.com",
    to: "destination@example.net",
  });

  expect(instance.run(["add", "shop"], env).status).toBe(0);

  expect(instance.calls().find((call) => call.args[1] === "addresses")?.account).toBe(
    "example-account",
  );

  expect(instance.rules()[0]?.actions).toEqual([
    { type: "forward", value: ["destination@example.net"] },
  ]);
});

test("cancelled setup does not save settings or change routing rules", () => {
  const instance = sandbox();
  const env = { CFALIAS_DOMAIN: "", CFALIAS_TO: "", CFALIAS_WORKER: "" };
  const result = instance.run(["--configure"], env, "1\n");

  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain("cancelled");
  expect(existsSync(join(instance.directory, "cfalias", "config.json"))).toBe(false);
  expect(instance.rules()).toEqual([]);
  expect(instance.calls().every((call) => call.args[0] === "zones")).toBe(true);
});

test("an explicit forwarding destination overrides the default Worker", () => {
  const instance = sandbox();
  const result = instance.run(["add", "shop", "--to", "destination@gmail.com"]);

  expect(result.status).toBe(0);

  expect(instance.rules()[0]?.actions).toEqual([
    { type: "forward", value: ["destination@gmail.com"] },
  ]);
});

test("a forwarding destination in the environment works without a Worker", () => {
  const instance = sandbox();
  const result = instance.run(["add", "shop"], {
    CFALIAS_TO: "destination@example.net",
    CFALIAS_WORKER: "",
  });

  expect(result.status).toBe(0);

  expect(instance.rules()[0]?.actions).toEqual([
    { type: "forward", value: ["destination@example.net"] },
  ]);
});

test("list includes every page, and remove deletes only the exact requested alias", () => {
  const initialRules = Array.from({ length: 51 }, (_, index) =>
    rule(`service-${index}@example.com`, `rule-${index}`),
  );
  const instance = sandbox(initialRules);
  const listed = instance.run(["list"]);

  expect(listed.status).toBe(0);
  expect(JSON.parse(listed.stdout)).toEqual(initialRules);

  const removed = instance.run(["remove", "service-50@example.com"]);

  expect(removed.status).toBe(0);
  expect(removed.stdout).toBe("service-50@example.com\n");
  expect(removed.stderr).toBe("Alias removed.\n");
  expect(instance.rules()).toEqual(initialRules.slice(0, 50));

  expect(instance.calls().filter((call) => call.args[2] === "delete")).toEqual([
    expect.objectContaining({
      args: ["email-routing", "rules", "delete", "rule-50", "--zone", "example.com", "--force"],
    }),
  ]);
});

test("duplicate and unknown aliases do not mutate routing rules", () => {
  const initialRules = [rule("github@example.com", "existing")];
  const instance = sandbox(initialRules);

  expect(instance.run(["add", "github"]).status).not.toBe(0);
  expect(instance.run(["remove", "unknown"]).status).not.toBe(0);
  expect(instance.rules()).toEqual(initialRules);
  expect(instance.calls().every((call) => call.args[2] === "list-account")).toBe(true);
});

test("ambiguous alias matches do not delete a rule", () => {
  const instance = sandbox([
    rule("github@example.com", "first"),
    rule("github@example.com", "second"),
  ]);

  expect(instance.run(["remove", "github"]).status).not.toBe(0);
  expect(instance.calls().every((call) => call.args[2] === "list-account")).toBe(true);
});

test("cf failure preserves its exit status and stderr", () => {
  const instance = sandbox();
  const result = instance.run(["add", "github"], { CFALIAS_TEST_FAILURE: "1" });

  expect(result.status).toBe(7);
  expect(result.stderr).toContain("Cloudflare request failed.");
  expect(result.stderr).not.toContain("Alias created");
  expect(result.stdout).toBe("");
  expect(instance.rules()).toEqual([]);
});

test("failed alias mutations do not report success", () => {
  const instance = sandbox();
  const created = instance.run(["add", "github"], { CFALIAS_TEST_FAILURE: "create" });

  expect(created.status).toBe(7);
  expect(created.stderr).toContain("Cloudflare request failed.");
  expect(created.stderr).not.toContain("Alias created");
  expect(created.stdout).toBe("");
  expect(instance.rules()).toEqual([]);

  expect(instance.run(["add", "github"]).status).toBe(0);

  const removed = instance.run(["remove", "github"], { CFALIAS_TEST_FAILURE: "delete" });

  expect(removed.status).toBe(7);
  expect(removed.stderr).toContain("Cloudflare request failed.");
  expect(removed.stderr).not.toContain("Alias removed");
  expect(removed.stdout).toBe("");
  expect(instance.rules()).toEqual([rule("github@example.com", "created-rule")]);
});

test("help is available without cf or configuration, while add requires cf", () => {
  const instance = sandbox();
  const env = { CFALIAS_DOMAIN: "", CFALIAS_WORKER: "", PATH: instance.directory };

  expect(instance.run(["--help"], env).status).toBe(0);
  rmSync(join(instance.directory, "cf"));

  const result = instance.run(["add", "github"], { PATH: instance.directory });

  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain("cf");
  expect(result.stderr).toContain("PATH");
});

test("invalid commands, configuration, and cross-domain addresses fail before cf runs", () => {
  const instance = sandbox();

  expect(instance.run(["update", "github"]).status).not.toBe(0);
  expect(instance.run(["list", "unexpected"]).status).not.toBe(0);
  expect(instance.run(["add", "github@other.dev"]).status).not.toBe(0);

  expect(
    instance.run(["add", "github", "--worker", "worker", "--to", "x@gmail.com"]).status,
  ).not.toBe(0);

  expect(instance.run(["add", "github"], { CFALIAS_TO: "", CFALIAS_WORKER: "" }).status).not.toBe(
    0,
  );

  expect(instance.run(["list"], { CFALIAS_DOMAIN: "" }).status).not.toBe(0);
  expect(instance.calls()).toEqual([]);
});
