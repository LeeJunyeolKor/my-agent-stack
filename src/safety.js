import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const DEFAULT_PATTERNS = [
  { id: "private-key", pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { id: "github-token", pattern: /\bgh[oprsu]_[A-Za-z0-9_]{20,}\b/ },
  { id: "generic-secret", pattern: /\b(?:api[_-]?key|access[_-]?token|client[_-]?secret)\s*[:=]\s*["'][^"']{8,}["']/i },
  { id: "absolute-user-path", pattern: /\/(?:Users|home)\/[A-Za-z0-9._-]+\// },
  { id: "internal-domain", pattern: /https?:\/\/[^\s"')]+\.(?:internal|corp)(?:[/:]|$)/i },
  { id: "ticket-identifier", pattern: /\b(?!(?:SHA|RFC)-\d)[A-Z][A-Z0-9]{1,9}-\d{2,}\b/ }
];

const IGNORED_DIRECTORIES = new Set([".git", "node_modules", "coverage", ".my-agent-stack"]);
const IGNORED_FILES = new Set([".my-agent-stack-denylist"]);

async function filesUnder(root) {
  const files = [];
  async function walk(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      if (entry.isDirectory() && IGNORED_DIRECTORIES.has(entry.name)) continue;
      if (entry.isFile() && IGNORED_FILES.has(entry.name)) continue;
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(absolute);
      else if (entry.isFile()) files.push(absolute);
    }
  }
  await walk(root);
  return files.sort();
}

export async function scanPublicSafety(root, extraMarkers = []) {
  const findings = [];
  const patterns = [
    ...DEFAULT_PATTERNS,
    ...extraMarkers.filter(Boolean).map((marker) => ({ id: "local-denylist", pattern: new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") }))
  ];

  for (const file of await filesUnder(root)) {
    let content;
    try {
      content = await readFile(file, "utf8");
    } catch {
      continue;
    }
    const lines = content.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      for (const candidate of patterns) {
        if (candidate.pattern.test(lines[index])) {
          findings.push({
            rule: candidate.id,
            file: path.relative(root, file).split(path.sep).join("/"),
            line: index + 1
          });
        }
      }
    }
  }
  return findings;
}
