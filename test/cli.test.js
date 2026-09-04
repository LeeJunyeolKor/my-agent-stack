import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { run } from "../src/cli.js";

function capture() {
  const lines = [];
  return { lines, io: { log: (value) => lines.push(value) } };
}

test("profiles reject unknown fields instead of silently accepting secrets", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "my-agent-stack-cli-"));
  try {
    const profilePath = path.join(root, "profile.json");
    await writeFile(profilePath, JSON.stringify({
      schemaVersion: 1,
      stackVersion: "0.1.0",
      scope: "project",
      agents: ["codex"],
      providers: { scm: "local-git" },
      selection: { skills: ["evidence-first-delivery"], automations: [] },
      credentials: { token: "not-a-real-secret" }
    }));

    await assert.rejects(run(["plan", "--profile", profilePath, "--target", root], capture().io), /Invalid profile keys/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("JSON install emits one parseable document containing plan and result", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "my-agent-stack-cli-json-"));
  try {
    const output = capture();
    const code = await run([
      "install",
      "--agents", "codex",
      "--skills", "evidence-first-delivery",
      "--providers", "scm=local-git,issues=none,messaging=none",
      "--target", root,
      "--yes",
      "--json"
    ], output.io);

    assert.equal(code, 0);
    assert.equal(output.lines.length, 1);
    const document = JSON.parse(output.lines[0]);
    assert.equal(document.plan.profile.agents[0], "codex");
    assert.ok(document.result.created.includes(".agents/skills/evidence-first-delivery"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
