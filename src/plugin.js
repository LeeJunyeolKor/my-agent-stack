import { createHash } from "node:crypto";
import { lstat, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { collectFiles, resolveInside, assertNoSymlinkEscape } from "./files.js";
import { applyPlan } from "./installer.js";
import { scanPublicSafety } from "./safety.js";

const PLUGIN = "plugins/my-agent-stack";
const OUTPUT = "dist/codex";
const digest = (content) => createHash("sha256").update(content).digest("hex");
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;

async function regularSource(root, relative) {
  const file = resolveInside(root, relative);
  // Reject links at every level, including the root of a component.
  let current = root;
  for (const segment of relative.split("/")) {
    current = path.join(current, segment);
    if ((await lstat(current)).isSymbolicLink()) throw new Error(`Plugin source contains a symbolic link: ${relative}`);
  }
  if (!(await lstat(file)).isFile()) throw new Error(`Plugin source is not a regular file: ${relative}`);
  return readFile(file, "utf8");
}

export function validatePackageReferences(contents) {
  for (const [file, content] of contents) {
    const references = [];
    if (file.endsWith(".md")) {
      for (const match of content.matchAll(/\[[^\]]*\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g)) references.push(match[1]);
    }
    if (file.endsWith("manifest.json")) {
      const manifest = JSON.parse(content);
      if (manifest.$schema) references.push(manifest.$schema);
      if (manifest.entrypoint) references.push(manifest.entrypoint);
    }
    if (file.endsWith(".html")) {
      for (const match of content.matchAll(/\b(?:href|src)\s*=\s*["']([^"']+)["']/gi)) references.push(match[1]);
    }
    for (const reference of references) {
      if (file.endsWith(".html") && reference === "data:,") continue;
      if (file.endsWith(".html") && reference.startsWith("#")) {
        const ids = [...content.matchAll(/\bid\s*=\s*["']([^"']+)["']/gi)].map((match) => match[1]);
        if (!ids.includes(decodeURIComponent(reference.slice(1)))) throw new Error(`Broken HTML anchor reference: ${file} -> ${reference}`);
        continue;
      }
      if (/^(?:https?:|mailto:|#)/.test(reference)) continue;
      const target = decodeURIComponent(reference.split("#")[0]);
      const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(file), target));
      if (target.startsWith("/") || !resolved.startsWith(`${PLUGIN}/`) || !contents.has(resolved)) {
        throw new Error(`Broken or escaping package reference: ${file} -> ${reference}`);
      }
    }
  }
}

export async function createPluginPlan(catalog) {
  const contents = new Map();
  for (const skill of catalog.skills) {
    if (skill.targets.codex === "unsupported") throw new Error(`Skill is unsupported by Codex: ${skill.id}`);
    for (const file of await collectFiles(skill.sourceDirectory)) {
      const explanationAsset = skill.id === "code-explainer" && file.path === "assets/explainer.html";
      if (!explanationAsset && !/^(?:SKILL\.md|manifest\.json|references\/[a-zA-Z0-9_./-]+\.md)$/.test(file.path)) {
        throw new Error(`File is not in the skills-only package allowlist: ${skill.id}/${file.path}`);
      }
      contents.set(`${PLUGIN}/skills/${skill.id}/${file.path}`, await regularSource(catalog.root, `skills/${skill.id}/${file.path}`));
    }
  }
  for (const relative of ["LICENSE", "schemas/component.schema.json"]) {
    contents.set(`${PLUGIN}/${relative}`, await regularSource(catalog.root, relative));
  }
  const manifest = JSON.parse(await regularSource(catalog.root, "catalog/codex-plugin.json"));
  const marketplace = JSON.parse(await regularSource(catalog.root, "catalog/codex-marketplace.json"));
  if (manifest.name !== "my-agent-stack" || manifest.skills !== "./skills/" || !/^\d+\.\d+\.\d+$/.test(manifest.version)) {
    throw new Error("Invalid Codex plugin identity, skill path or base version");
  }
  const allowed = new Set(["name", "version", "description", "author", "license", "skills", "interface"]);
  if (Object.keys(manifest).some((key) => !allowed.has(key))) throw new Error("Unsupported field in skills-only plugin manifest");
  const entry = marketplace.plugins?.[0];
  if (!/^[a-z0-9-]+$/.test(marketplace.name) || marketplace.plugins.length !== 1 || entry.name !== manifest.name ||
      entry.source?.source !== "local" || entry.source.path !== `./${PLUGIN}` ||
      entry.policy?.installation !== "AVAILABLE" || entry.policy?.authentication !== "ON_INSTALL" || entry.category !== "Productivity") {
    throw new Error("Invalid single-plugin local marketplace");
  }
  // Stable content identity refreshes Codex's cache when source changes, without hand-edited copies.
  const identity = digest(json([...contents]) + json(manifest) + json(marketplace)).slice(0, 16);
  manifest.version += `+content.${identity}`;
  contents.set(`${PLUGIN}/.codex-plugin/plugin.json`, json(manifest));
  contents.set(".agents/plugins/marketplace.json", json(marketplace));
  validatePackageReferences(contents);
  const files = [...contents].map(([file, content]) => ({ path: file, sha256: digest(content) })).sort((a, b) => a.path.localeCompare(b.path));
  return {
    targetRoot: catalog.root,
    destination: path.join(catalog.root, OUTPUT),
    relativeDestination: OUTPUT,
    marketplace: marketplace.name,
    plugin: manifest.name,
    version: manifest.version,
    files,
    contents
  };
}

export function publicPluginPlan(plan) {
  const { contents: _contents, ...result } = plan;
  return result;
}

export async function buildPlugin(plan, { force = false } = {}) {
  const staging = await mkdtemp(path.join(tmpdir(), "my-agent-stack-plugin-"));
  try {
    for (const [relative, content] of plan.contents) {
      const file = resolveInside(staging, relative);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, content, { flag: "wx" });
    }
    const findings = await scanPublicSafety(staging);
    if (findings.length) throw new Error(`Plugin safety scan failed: ${json(findings)}`);
    return await applyPlan({ targetRoot: plan.targetRoot, operations: [{
      type: "copy-directory", id: plan.plugin, source: staging, destination: plan.destination,
      relativeDestination: plan.relativeDestination, files: plan.files
    }] }, { force });
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

export async function verifyPlugin(plan) {
  await assertNoSymlinkEscape(plan.targetRoot, plan.destination);
  if ((await lstat(plan.destination)).isSymbolicLink()) throw new Error("Plugin output must not be a symbolic link");
  const actual = await collectFiles(plan.destination);
  if (json(actual) !== json(plan.files)) throw new Error("Plugin output differs from current source; rebuild after reviewing plugin-build --dry-run");
  const findings = await scanPublicSafety(plan.destination);
  if (findings.length) throw new Error(`Plugin safety scan failed: ${json(findings)}`);
  return { ok: true, files: actual.length, version: plan.version };
}
