import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { loadCatalog, repositoryRoot } from "../src/catalog.js";

test("catalog loads validated components and documented agents", async () => {
  const catalog = await loadCatalog();

  assert.equal(catalog.stack.version, "0.1.0");
  assert.deepEqual(catalog.skills.map((skill) => skill.id), [
    "commit",
    "environment-onboarding",
    "evidence-first-delivery",
    "fallback-guide",
    "portable-stack-audit",
    "pull-request",
    "review-comment",
    "terminology-review",
    "ticket-status"
  ]);
  assert.deepEqual(catalog.automations.map((automation) => automation.id), [
    "daily-work-summary",
    "issue-status-sync",
    "post-merge-verification"
  ]);
  assert.ok(catalog.agents.some((agent) => agent.id === "codex"));
  assert.ok(catalog.agents.some((agent) => agent.id === "antigravity-cli"));
});

test("every automation is disabled and guarded by default", async () => {
  const catalog = await loadCatalog();
  for (const automation of catalog.automations) {
    assert.equal(automation.activation.defaultEnabled, false);
    assert.equal(automation.activation.requiresConfirmation, true);
    if (automation.permissions.mutations.length > 0) {
      assert.equal(automation.safeguards.approvalBeforeMutation, true);
      assert.equal(automation.safeguards.verificationAfterMutation, true);
    }
  }
});

test("README catalog names every component", async () => {
  const catalog = await loadCatalog();
  const readme = await readFile(new URL("../README.md", import.meta.url), "utf8");
  for (const component of [...catalog.skills, ...catalog.automations]) {
    assert.match(readme, new RegExp(`\\b${component.id}\\b`), `${component.id} is missing from README.md`);
  }
  assert.equal(repositoryRoot.endsWith("my-agent-stack"), true);
});
