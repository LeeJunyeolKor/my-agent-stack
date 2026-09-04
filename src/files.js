import { createHash } from "node:crypto";
import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import path from "node:path";

export async function sha256(file) {
  return createHash("sha256").update(await readFile(file)).digest("hex");
}

export async function collectFiles(directory) {
  const result = [];

  async function walk(current, relativeBase) {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name === ".DS_Store") continue;
      const absolute = path.join(current, entry.name);
      const relative = path.join(relativeBase, entry.name);
      if (entry.isSymbolicLink()) {
        throw new Error(`Component sources may not contain symbolic links: ${absolute}`);
      }
      if (entry.isDirectory()) await walk(absolute, relative);
      if (entry.isFile()) result.push({ path: relative.split(path.sep).join("/"), sha256: await sha256(absolute) });
    }
  }

  await walk(directory, "");
  return result;
}

export function resolveInside(root, relative) {
  if (path.isAbsolute(relative)) throw new Error(`Install path must be relative: ${relative}`);
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, relative);
  if (resolved !== resolvedRoot && !resolved.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error(`Install path escapes the target root: ${relative}`);
  }
  return resolved;
}

export async function assertNoSymlinkEscape(root, destination) {
  const resolvedRoot = path.resolve(root);
  const relative = path.relative(resolvedRoot, destination);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Destination escapes the target root: ${destination}`);
  }

  let current = resolvedRoot;
  for (const segment of relative.split(path.sep).slice(0, -1)) {
    if (!segment) continue;
    current = path.join(current, segment);
    let stats;
    try {
      stats = await lstat(current);
    } catch (error) {
      if (error.code === "ENOENT") continue;
      throw error;
    }
    if (!stats.isSymbolicLink()) continue;
    const target = await realpath(current);
    if (target !== resolvedRoot && !target.startsWith(`${resolvedRoot}${path.sep}`)) {
      throw new Error(`Symbolic link escapes the target root: ${current}`);
    }
  }
}
