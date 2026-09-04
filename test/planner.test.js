import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { loadCatalog } from "../src/catalog.js";
import { createPlan } from "../src/planner.js";

async function withTarget(run) {
  const target = await mkdtemp(path.join(tmpdir(), "my-agent-stack-plan-"));
  try {
    await run(target);
  } finally {
    await rm(target, { recursive: true, force: true });
  }
}

test("no issue provider explicitly skips an issue-dependent automation", async () => {
  await withTarget(async (targetRoot) => {
    const catalog = await loadCatalog();
    const plan = await createPlan(catalog, {
      targetRoot,
      scope: "project",
      agents: ["codex", "cursor"],
      providers: { scm: "github", issues: "none", messaging: "none" },
      skills: ["evidence-first-delivery", "environment-onboarding"],
      automations: ["daily-work-summary", "issue-status-sync"]
    });

    const issueSync = plan.evaluations.find((item) => item.component.id === "issue-status-sync");
    assert.equal(issueSync.status, "skipped");
    assert.deepEqual(issueSync.missingRequired, ["issue.read", "issue.status.write"]);
    assert.deepEqual(plan.receipt.skipped.map((item) => item.id), ["issue-status-sync"]);

    const evidenceCopies = plan.operations.filter((operation) => operation.id === "evidence-first-delivery");
    assert.equal(evidenceCopies.length, 1, "agents sharing .agents/skills should produce one copy");
    assert.deepEqual(evidenceCopies[0].agents, ["codex", "cursor"]);
  });
});

test("planning is deterministic and includes SHA-256 receipts", async () => {
  await withTarget(async (targetRoot) => {
    const catalog = await loadCatalog();
    const input = {
      targetRoot,
      agents: ["codex"],
      providers: { scm: "local-git", issues: "none", messaging: "none" },
      skills: ["portable-stack-audit"],
      automations: ["daily-work-summary"]
    };
    const first = await createPlan(catalog, input);
    const second = await createPlan(catalog, input);

    assert.deepEqual(first.receipt, second.receipt);
    assert.ok(first.receipt.installed.every((entry) => entry.files.every((file) => /^[a-f0-9]{64}$/.test(file.sha256))));
  });
});

test("user scope respects agent-specific documented paths", async () => {
  await withTarget(async (targetRoot) => {
    const catalog = await loadCatalog();
    const plan = await createPlan(catalog, {
      targetRoot,
      scope: "user",
      agents: ["codex", "antigravity", "antigravity-cli"],
      providers: { scm: "none", issues: "none", messaging: "none" },
      skills: ["evidence-first-delivery"],
      automations: []
    });
    const destinations = plan.receipt.installed.map((entry) => entry.destination).sort();
    assert.deepEqual(destinations, [
      ".agents/skills/evidence-first-delivery",
      ".gemini/antigravity-cli/skills/evidence-first-delivery",
      ".gemini/config/skills/evidence-first-delivery"
    ]);
  });
});

test("unknown provider selections fail before creating a plan", async () => {
  await withTarget(async (targetRoot) => {
    const catalog = await loadCatalog();
    await assert.rejects(
      createPlan(catalog, {
        targetRoot,
        agents: ["codex"],
        providers: { scm: "unknown" },
        skills: ["evidence-first-delivery"],
        automations: []
      }),
      /Unknown scm provider/
    );
  });
});
