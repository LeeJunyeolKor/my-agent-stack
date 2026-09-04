import { readFile, readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scanPublicSafety } from "../src/safety.js";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const ignored = new Set([".git", "node_modules", "coverage", ".my-agent-stack"]);
const files = [];

async function walk(current) {
  for (const entry of await readdir(current, { withFileTypes: true })) {
    if (entry.isDirectory() && ignored.has(entry.name)) continue;
    const absolute = path.join(current, entry.name);
    if (entry.isDirectory()) await walk(absolute);
    else if (entry.isFile()) files.push(absolute);
  }
}

await walk(root);

for (const file of files.filter((candidate) => candidate.endsWith(".json"))) {
  JSON.parse(await readFile(file, "utf8"));
}

for (const file of files.filter((candidate) => /\.(?:js|mjs)$/.test(candidate))) {
  const check = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (check.status !== 0) {
    process.stderr.write(check.stderr);
    process.exitCode = 1;
  }
}

const safetyFindings = await scanPublicSafety(root);
if (safetyFindings.length > 0) {
  console.error("Public-safety findings:");
  for (const finding of safetyFindings) console.error(`- ${finding.rule}: ${finding.file}:${finding.line}`);
  process.exitCode = 1;
}

if (!process.exitCode) console.log(`Checked ${files.length} repository files.`);
