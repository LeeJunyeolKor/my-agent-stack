import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { scanPublicSafety } from "../src/safety.js";

test("public-safety scan reports secret-like material without echoing it", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "my-agent-stack-safety-"));
  try {
    const syntheticToken = ["ghp", "x".repeat(24)].join("_");
    await writeFile(path.join(root, "unsafe.txt"), `token=${syntheticToken}\n`);
    const findings = await scanPublicSafety(root);
    assert.deepEqual(findings, [{ rule: "github-token", file: "unsafe.txt", line: 1 }]);
    assert.equal(JSON.stringify(findings).includes(syntheticToken), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("local denylist markers are supported without committing a mapping", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "my-agent-stack-denylist-"));
  try {
    const marker = ["private", "project", "name"].join("-");
    await writeFile(path.join(root, "sample.md"), `Do not publish ${marker}.\n`);
    const findings = await scanPublicSafety(root, [marker]);
    assert.equal(findings[0].rule, "local-denylist");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
