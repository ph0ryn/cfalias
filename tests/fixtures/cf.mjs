#!/usr/bin/env node

import { appendFileSync, readFileSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const stateFile = process.env.CFALIAS_TEST_STATE;
const callFile = process.env.CFALIAS_TEST_CALLS;
const option = (name) => args[args.indexOf(name) + 1];
const state = JSON.parse(readFileSync(stateFile, "utf8"));

appendFileSync(
  callFile,
  `${JSON.stringify({
    account: process.env.CLOUDFLARE_ACCOUNT_ID,
    args,
    cwd: process.cwd(),
    profile: process.env.CLOUDFLARE_PROFILE,
    token: process.env.CLOUDFLARE_API_TOKEN,
  })}\n`,
);

if (process.env.CFALIAS_TEST_FAILURE) {
  console.error("Cloudflare request failed.");
  process.exit(7);
}

const page = Number(option("--page"));
const count = Number(option("--per-page"));

if (args[0] === "zones" && args[1] === "list") {
  const zones = [
    { account: { id: "example-account" }, name: "example.com" },
    { account: { id: "other-account" }, name: "other.example.net" },
  ];

  console.log(JSON.stringify(zones.slice((page - 1) * count, page * count)));
  process.exit(0);
}

if (args[0] === "workers" && args[1] === "scripts" && args[2] === "search") {
  const workers = [{ script_name: "header-worker" }, { script_name: "other-worker" }];

  console.log(JSON.stringify(workers.slice((page - 1) * count, page * count)));
  process.exit(0);
}

if (args[0] === "email-routing" && args[1] === "addresses" && args[2] === "list") {
  if (option("--verified") !== "true") {
    throw new Error("Destination selection must request verified addresses.");
  }

  console.log(
    JSON.stringify([{ email: "destination@example.net", verified: "2026-01-01T00:00:00Z" }]),
  );

  process.exit(0);
}

if (args[0] !== "email-routing" || args[1] !== "rules") {
  throw new Error("Unexpected command group.");
}

switch (args[2]) {
  case "list-account": {
    const page = Number(option("--page"));
    const count = Number(option("--per-page"));

    console.log(JSON.stringify(state.rules.slice((page - 1) * count, page * count)));
    break;
  }

  case "create": {
    const body = JSON.parse(option("--body"));
    const rule = { id: "created-rule", ...body };

    state.rules.push(rule);
    writeFileSync(stateFile, JSON.stringify(state));
    console.log(JSON.stringify(rule));
    break;
  }

  case "delete": {
    if (!args.includes("--force")) {
      console.log("Aborted.");
      break;
    }

    state.rules = state.rules.filter((rule) => rule.id !== args[3]);
    writeFileSync(stateFile, JSON.stringify(state));
    console.log(JSON.stringify({ id: args[3] }));
    break;
  }

  default:
    throw new Error("Unexpected command.");
}
