import assert from "node:assert/strict";
import { cp, mkdtemp, mkdir, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { Script } from "node:vm";
import { loadCatalog, repositoryRoot } from "../src/catalog.js";
import { createPlan } from "../src/planner.js";
import { applyPlan } from "../src/installer.js";
import { buildPlugin, createPluginPlan, verifyPlugin, validatePackageReferences } from "../src/plugin.js";

async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), "stack-plugin-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const name of ["catalog", "skills", "automations", "schemas", "LICENSE"]) {
    await cp(path.join(repositoryRoot, name), path.join(root, name), { recursive: true });
  }
  return root;
}

test("complete package is reproducible, reference-complete and isolated from runtime connectors", async (t) => {
  const catalog = await loadCatalog(await fixture(t));
  const first = await createPluginPlan(catalog);
  const second = await createPluginPlan(catalog);
  assert.deepEqual(first.files, second.files);
  assert.equal(first.version, second.version);
  assert.equal(first.files.filter((file) => file.path.endsWith("/SKILL.md")).length, catalog.skills.length);
  assert.ok(first.files.every((file) => !/(?:hooks|automations|\.mcp|\.app|\.env)/.test(file.path)));
  const result = await buildPlugin(first);
  assert.deepEqual(result.created, ["dist/codex"]);
  assert.equal((await verifyPlugin(first)).ok, true);
  assert.deepEqual((await buildPlugin(first)).unchanged, ["dist/codex"]);
});

test("explanation asset installs with its shared instructions and packages identical bytes", async (t) => {
  const root = await fixture(t);
  const catalog = await loadCatalog(root);
  const plan = await createPlan(catalog, {
    agents: ["codex"], skills: ["code-explainer"], automations: [],
    providers: { scm: "local-git", issues: "none" }, targetRoot: root
  });
  assert.deepEqual([...plan.profile.selection.skills].sort(), ["code-explainer", "technical-writing"]);
  await applyPlan(plan);
  const source = await readFile(path.join(root, "skills/code-explainer/assets/explainer.html"), "utf8");
  assert.equal(await readFile(path.join(root, ".agents/skills/code-explainer/assets/explainer.html"), "utf8"), source);
  const plugin = await createPluginPlan(catalog);
  assert.equal(plugin.contents.get("plugins/my-agent-stack/skills/code-explainer/assets/explainer.html"), source);
  const scripts = [...source.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length, 1);
  new Script(scripts[0][1]); // Syntax only; browser and model behavior are separate checks.
  await writeFile(path.join(root, "skills/code-explainer/assets/unexpected.js"), "void 0");
  await assert.rejects(createPluginPlan(catalog), /allowlist/);
});

test("HTML references reject missing anchors, absent assets and package escapes", () => {
  const file = "plugins/my-agent-stack/skills/code-explainer/assets/explainer.html";
  validatePackageReferences(new Map([[file, '<a href="#flow">flow</a><section id="flow"></section>']]));
  for (const html of ['<a href="#missing">bad</a>', '<img src="missing.svg">', '<a href="../../../../../outside.html">bad</a>']) {
    assert.throws(() => validatePackageReferences(new Map([[file, html]])), /reference/);
  }
});

test("source changes change cache identity and replacement requires explicit force", async (t) => {
  const root = await fixture(t);
  const catalog = await loadCatalog(root);
  const first = await createPluginPlan(catalog);
  await buildPlugin(first);
  await mkdir(path.join(root, "skills/commit/references"));
  await writeFile(path.join(root, "skills/commit/references/example.md"), "text");
  const next = await createPluginPlan(catalog);
  assert.notEqual(next.version, first.version);
  await assert.rejects(verifyPlugin(next), /differs/);
  await assert.rejects(buildPlugin(next), /overwrite/);
  await buildPlugin(next, { force: true });
  assert.equal((await verifyPlugin(next)).ok, true);
  await writeFile(path.join(next.destination, "unexpected.txt"), "extra");
  await assert.rejects(verifyPlugin(next), /differs/);
});

test("package rejects missing references, escaping references and unexpected skill payloads", async (t) => {
  const root = await fixture(t);
  const catalog = await loadCatalog(root);
  for (const link of ["missing.md", "../../../../secret.md", "/secret.md"]) {
    assert.throws(() => validatePackageReferences(new Map([["plugins/my-agent-stack/skills/commit/SKILL.md", `[bad](${link})`]])), /reference/);
  }
  await writeFile(path.join(root, "skills/commit/.env"), "not-a-secret");
  await assert.rejects(createPluginPlan(catalog), /allowlist/);
});

test("package rejects linked source roots and linked output ancestors", async (t) => {
  const root = await fixture(t);
  const catalog = await loadCatalog(root);
  const plan = await createPluginPlan(catalog);
  const outside = await mkdtemp(path.join(tmpdir(), "stack-outside-"));
  t.after(() => rm(outside, { recursive: true, force: true }));
  await symlink(outside, path.join(root, "dist"));
  await assert.rejects(buildPlugin(plan), /Symbolic link/);
  await rm(path.join(root, "skills/commit"), { recursive: true });
  await symlink(path.join(repositoryRoot, "skills/commit"), path.join(root, "skills/commit"));
  await assert.rejects(createPluginPlan(catalog), /symbolic link/);
});

test("blocked content cannot replace an existing build", async (t) => {
  const root = await fixture(t);
  const catalog = await loadCatalog(root);
  const good = await createPluginPlan(catalog);
  await buildPlugin(good);
  await mkdir(path.join(root, "skills/commit/references"));
  await writeFile(path.join(root, "skills/commit/references/unsafe.md"), ["/", "Users", "/", "someone", "/", "private"].join(""));
  await assert.rejects(buildPlugin(await createPluginPlan(catalog), { force: true }), /safety scan/);
  assert.equal((await verifyPlugin(good)).ok, true);
});

test("legacy profile skill alias resolves once and shared instructions install without an issue provider", async (t) => {
  const root = await fixture(t);
  const catalog = await loadCatalog(root);
  const plan = await createPlan(catalog, {
    agents: ["codex"], skills: ["terminology-review", "technical-writing", "report-writing", "code-review"],
    automations: [], providers: { scm: "local-git", issues: "none" }, targetRoot: root
  });
  assert.equal(plan.receipt.skipped.length, 0);
  assert.equal(plan.profile.selection.skills.filter((id) => id === "technical-writing").length, 1);
  assert.ok(plan.profile.selection.skills.includes("evidence-first-delivery"));
  assert.ok(plan.warnings.some((warning) => warning.includes("was renamed")));
  await applyPlan(plan);
  const installed = await readFile(path.join(root, ".agents/skills/report-writing/SKILL.md"), "utf8");
  for (const match of installed.matchAll(/\]\((\.\.\/[^)]+)\)/g)) {
    await readFile(path.resolve(root, ".agents/skills/report-writing", match[1]));
  }
});

test("catalog rejects missing and cyclic shared instruction dependencies", async (t) => {
  const root = await fixture(t);
  const file = path.join(root, "skills/technical-writing/manifest.json");
  const manifest = JSON.parse(await readFile(file, "utf8"));
  manifest.dependencies = ["missing"];
  await writeFile(file, JSON.stringify(manifest));
  await assert.rejects(loadCatalog(root), /unknown dependency/);
  manifest.dependencies = ["report-writing"];
  await writeFile(file, JSON.stringify(manifest));
  await assert.rejects(loadCatalog(root), /Cyclic/);
});


test("CLI dry-run writes nothing and ignores neither selection nor target overrides", async (t) => {
  const root = await fixture(t);
  for (const name of ["src", "bin", "package.json"]) {
    await cp(path.join(repositoryRoot, name), path.join(root, name), { recursive: true });
  }
  const cli = path.join(root, "bin/my-agent-stack.js");
  const preview = spawnSync(process.execPath, [cli, "plugin-build", "--yes", "--dry-run", "--json"], { encoding: "utf8" });
  assert.equal(preview.status, 0, preview.stderr);
  assert.equal(JSON.parse(preview.stdout).applied, false);
  await assert.rejects(stat(path.join(root, "dist")), { code: "ENOENT" });
  const invalid = spawnSync(process.execPath, [cli, "plugin-build", "--yes", "--skills", "commit"], { encoding: "utf8" });
  assert.equal(invalid.status, 1);
  const redirected = spawnSync(process.execPath, [cli, "plugin-build", "--yes", "--target", root], { encoding: "utf8" });
  assert.equal(redirected.status, 1);
  await assert.rejects(stat(path.join(root, "dist")), { code: "ENOENT" });
});
