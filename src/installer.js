import { randomUUID } from "node:crypto";
import { cp, lstat, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { assertNoSymlinkEscape, collectFiles } from "./files.js";

export class InstallError extends Error {
  constructor(message) {
    super(message);
    this.name = "InstallError";
  }
}

async function exists(target) {
  try {
    return await lstat(target);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function directoryMatches(operation) {
  let installedFiles;
  try {
    installedFiles = await collectFiles(operation.destination);
  } catch {
    return false;
  }
  if (installedFiles.length !== operation.files.length) return false;
  return installedFiles.every((file, index) => {
    const expected = operation.files[index];
    return file.path === expected.path && file.sha256 === expected.sha256;
  });
}

async function operationState(operation) {
  const stats = await exists(operation.destination);
  if (!stats) return "create";
  if (stats.isSymbolicLink()) return "conflict";
  if (operation.type === "copy-directory") {
    return stats.isDirectory() && (await directoryMatches(operation)) ? "unchanged" : "conflict";
  }
  if (operation.type === "write-json") {
    if (!stats.isFile()) return "conflict";
    const expected = `${JSON.stringify(operation.content, null, 2)}\n`;
    return (await readFile(operation.destination, "utf8")) === expected ? "unchanged" : "conflict";
  }
  return "conflict";
}

async function verifyCopiedOperation(operation) {
  if (!(await directoryMatches(operation))) {
    throw new InstallError(`Checksum verification failed after installing ${operation.id}`);
  }
}

export async function inspectPlan(plan) {
  const states = [];
  for (const operation of plan.operations) {
    await assertNoSymlinkEscape(plan.targetRoot, operation.destination);
    states.push({ operation, state: await operationState(operation) });
  }
  return states;
}

export async function applyPlan(plan, { force = false } = {}) {
  const rootStats = await exists(plan.targetRoot);
  if (!rootStats?.isDirectory()) throw new InstallError(`Target root must already exist: ${plan.targetRoot}`);

  const states = await inspectPlan(plan);
  const conflicts = states.filter(({ state }) => state === "conflict");
  if (conflicts.length > 0 && !force) {
    throw new InstallError(`Installation would overwrite existing paths:\n${conflicts.map(({ operation }) => `- ${operation.relativeDestination}`).join("\n")}\nRun again with --force only after reviewing these paths.`);
  }

  const result = { created: [], replaced: [], unchanged: [] };
  const changedStates = states.filter(({ state }) => state !== "unchanged");
  for (const { operation } of states.filter(({ state }) => state === "unchanged")) {
    result.unchanged.push(operation.relativeDestination);
  }

  if (changedStates.length === 0) return result;

  const stagingRoot = path.join(plan.targetRoot, ".my-agent-stack", `.staging-${randomUUID()}`);
  await assertNoSymlinkEscape(plan.targetRoot, stagingRoot);
  await mkdir(stagingRoot, { recursive: true });
  const staged = [];

  try {
    for (let index = 0; index < changedStates.length; index += 1) {
      const { operation, state } = changedStates[index];
      const stagedPath = path.join(stagingRoot, String(index));
      if (operation.type === "copy-directory") {
        await cp(operation.source, stagedPath, { recursive: true, errorOnExist: true, force: false });
        await verifyCopiedOperation({ ...operation, destination: stagedPath });
      } else if (operation.type === "write-json") {
        await writeFile(stagedPath, `${JSON.stringify(operation.content, null, 2)}\n`, { flag: "wx" });
      } else {
        throw new InstallError(`Unsupported operation: ${operation.type}`);
      }
      staged.push({ operation, state, stagedPath });
    }

    for (const { operation, state, stagedPath } of staged) {
      await assertNoSymlinkEscape(plan.targetRoot, operation.destination);
      await mkdir(path.dirname(operation.destination), { recursive: true });
      if (state === "conflict") await rm(operation.destination, { recursive: true, force: true });
      await rename(stagedPath, operation.destination);
      if (state === "conflict") result.replaced.push(operation.relativeDestination);
      else result.created.push(operation.relativeDestination);
    }

    return result;
  } finally {
    await rm(stagingRoot, { recursive: true, force: true });
  }
}
