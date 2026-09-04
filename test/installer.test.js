import assert from "node:assert/strict";
import { access, mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { loadCatalog } from "../src/catalog.js";
import { sha256 } from "../src/files.js";
import { applyPlan } from "../src/installer.js";
import { createPlan } from "../src/planner.js";

async function withTarget(run) {
  const target = await mkdtemp(path.join(tmpdir(), "my-agent-stack-install-"));
  try {
    await run(target);
  } finally {
    await rm(target, { recursive: true, force: true });
  }
}

function baseInput(targetRoot) {
  return {
    targetRoot,
    scope: "project",
    agents: ["codex"],
    providers: { scm: "local-git", issues: "none", messaging: "none" },
    skills: ["evidence-first-delivery"],
    automations: ["daily-work-summary"]
  };
}

test("installer copies only selected components and verifies receipt hashes", async () => {
  await withTarget(async (targetRoot) => {
    const plan = await createPlan(await loadCatalog(), baseInput(targetRoot));
    const result = await applyPlan(plan);

    assert.ok(result.created.includes(".agents/skills/evidence-first-delivery"));
    await access(path.join(targetRoot, ".agents/skills/evidence-first-delivery/SKILL.md"));
    await access(path.join(targetRoot, ".my-agent-stack/automations/daily-work-summary/AUTOMATION.md"));
    await assert.rejects(access(path.join(targetRoot, ".agents/skills/environment-onboarding/SKILL.md")));

    const receipt = JSON.parse(await readFile(path.join(targetRoot, ".my-agent-stack/receipt.json"), "utf8"));
    for (const component of receipt.installed) {
      for (const file of component.files) {
        const installedFile = path.join(targetRoot, component.destination, ...file.path.split("/"));
        assert.equal(await sha256(installedFile), file.sha256);
      }
    }
  });
});

test("an identical reinstall is an idempotent no-op", async () => {
  await withTarget(async (targetRoot) => {
    const catalog = await loadCatalog();
    const firstPlan = await createPlan(catalog, baseInput(targetRoot));
    await applyPlan(firstPlan);
    const secondPlan = await createPlan(catalog, baseInput(targetRoot));
    const result = await applyPlan(secondPlan);

    assert.equal(result.created.length, 0);
    assert.equal(result.replaced.length, 0);
    assert.equal(result.unchanged.length, secondPlan.operations.length);
  });
});

test("differing existing content aborts before overwrite", async () => {
  await withTarget(async (targetRoot) => {
    const catalog = await loadCatalog();
    const plan = await createPlan(catalog, baseInput(targetRoot));
    await applyPlan(plan);
    const installedSkill = path.join(targetRoot, ".agents/skills/evidence-first-delivery/SKILL.md");
    await writeFile(installedSkill, "local edit\n");

    await assert.rejects(applyPlan(await createPlan(catalog, baseInput(targetRoot))), /would overwrite existing paths/);
    assert.equal(await readFile(installedSkill, "utf8"), "local edit\n");
  });
});

test("a destination parent symbolic link may not escape the target", async () => {
  const outside = await mkdtemp(path.join(tmpdir(), "my-agent-stack-outside-"));
  try {
    await withTarget(async (targetRoot) => {
      await mkdir(path.join(outside, "skills"), { recursive: true });
      await symlink(outside, path.join(targetRoot, ".agents"));
      const plan = await createPlan(await loadCatalog(), baseInput(targetRoot));
      await assert.rejects(applyPlan(plan), /Symbolic link escapes the target root/);
    });
  } finally {
    await rm(outside, { recursive: true, force: true });
  }
});

test("source changes after planning are rejected before destination replacement", async () => {
  const sourceRoot = await mkdtemp(path.join(tmpdir(), "my-agent-stack-source-"));
  try {
    await withTarget(async (targetRoot) => {
      const sourceFile = path.join(sourceRoot, "SKILL.md");
      const destination = path.join(targetRoot, ".agents/skills/example");
      await writeFile(sourceFile, "planned\n");
      await mkdir(destination, { recursive: true });
      await writeFile(path.join(destination, "SKILL.md"), "existing\n");
      const plan = {
        targetRoot,
        operations: [
          {
            type: "copy-directory",
            id: "example",
            source: sourceRoot,
            destination,
            relativeDestination: ".agents/skills/example",
            files: [{ path: "SKILL.md", sha256: await sha256(sourceFile) }]
          }
        ]
      };
      await writeFile(sourceFile, "changed after planning\n");

      await assert.rejects(applyPlan(plan, { force: true }), /Checksum verification failed/);
      assert.equal(await readFile(path.join(destination, "SKILL.md"), "utf8"), "existing\n");
    });
  } finally {
    await rm(sourceRoot, { recursive: true, force: true });
  }
});
