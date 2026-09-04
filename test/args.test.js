import assert from "node:assert/strict";
import test from "node:test";
import { commaList, parseArgs, providerMap } from "../src/args.js";

test("CLI arguments support comma-separated selective installation", () => {
  const parsed = parseArgs([
    "plan",
    "--agents",
    "codex,cursor",
    "--providers=scm=github,issues=none",
    "--dry-run"
  ]);
  assert.equal(parsed.command, "plan");
  assert.deepEqual(commaList(parsed.options.agents), ["codex", "cursor"]);
  assert.deepEqual(providerMap(parsed.options.providers), { scm: "github", issues: "none" });
  assert.equal(parsed.options["dry-run"], true);
});

test("boolean flags reject assigned values instead of becoming truthy strings", () => {
  assert.throws(() => parseArgs(["install", "--yes=false"]), /does not accept a value/);
  assert.throws(() => parseArgs(["install", "--force=true"]), /does not accept a value/);
});
