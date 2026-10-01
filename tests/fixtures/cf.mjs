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
