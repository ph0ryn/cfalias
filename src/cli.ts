#!/usr/bin/env node

import { CfCommandError } from "./cfClient.ts";
import { main } from "./commands.ts";

try {
  main(process.argv.slice(2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = error instanceof CfCommandError ? error.exitCode : 1;
}
