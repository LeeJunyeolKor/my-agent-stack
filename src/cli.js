import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs, commaList, providerMap } from "./args.js";
import { loadCatalog, publicCatalog, repositoryRoot } from "./catalog.js";
import { formatCatalog, formatPlan } from "./format.js";
import { applyPlan } from "./installer.js";
import { createPlan } from "./planner.js";
import { scanPublicSafety } from "./safety.js";
import { runWizard } from "./wizard.js";

const HELP = `My Agent Stack

Usage:
  my-agent-stack list [--json]
  my-agent-stack init
  my-agent-stack plan --profile <profile.json> [--target <directory>]
  my-agent-stack plan --agents <ids> --skills <ids> [options]
  my-agent-stack install --profile <profile.json> [--target <directory>] [--yes]
  my-agent-stack install --agents <ids> --skills <ids> [options] [--yes]
  my-agent-stack validate
  my-agent-stack doctor

Options:
  --agents codex,claude-code
  --skills evidence-first-delivery,environment-onboarding
  --automations daily-work-summary,post-merge-verification
  --providers scm=github,issues=none,messaging=none
  --profile <profile.json>
  --scope project|user
  --target <existing-directory>
  --yes       Apply a non-interactive install
  --force     Replace reviewed conflicting destinations
  --dry-run   Print an install plan without writing
  --json      Print machine-readable output
`;

async function localDenylist(root) {
  const file = path.join(root, ".my-agent-stack-denylist");
  try {
    return (await readFile(file, "utf8")).split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith("#"));
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

function assertProfileShape(profile, profilePath, catalog) {
  const allowedKeys = new Set(["$schema", "schemaVersion", "stackVersion", "scope", "agents", "providers", "selection"]);
  const unknownKeys = Object.keys(profile).filter((key) => !allowedKeys.has(key));
  if (unknownKeys.length > 0) throw new Error(`Invalid profile keys in ${profilePath}: ${unknownKeys.join(", ")}`);
  if (profile.schemaVersion !== 1 || profile.stackVersion !== catalog.stack.version) {
    throw new Error(`Profile version does not match stack ${catalog.stack.version}: ${profilePath}`);
  }
  if (!new Set(["project", "user"]).has(profile.scope) || !Array.isArray(profile.agents) || profile.agents.length === 0) {
    throw new Error(`Invalid profile scope or agents: ${profilePath}`);
  }
  if (!profile.providers || typeof profile.providers !== "object" || Array.isArray(profile.providers)) {
    throw new Error(`Invalid profile providers: ${profilePath}`);
  }
  if (!profile.selection || !Array.isArray(profile.selection.skills) || !Array.isArray(profile.selection.automations)) {
    throw new Error(`Invalid profile selection: ${profilePath}`);
  }
  for (const values of [profile.agents, profile.selection.skills, profile.selection.automations, Object.values(profile.providers)]) {
    if (values.some((value) => typeof value !== "string" || value.length === 0)) {
      throw new Error(`Profile selections must be non-empty strings: ${profilePath}`);
    }
  }
}

async function selectionFromOptions(options, catalog) {
  if (options.profile) {
    const profilePath = path.resolve(options.profile);
    const profile = JSON.parse(await readFile(profilePath, "utf8"));
    assertProfileShape(profile, profilePath, catalog);
    return {
      agents: profile.agents,
      skills: profile.selection.skills ?? [],
      automations: profile.selection.automations ?? [],
      providers: profile.providers ?? {},
      scope: options.scope ?? profile.scope ?? "project",
      targetRoot: options.target ?? process.cwd()
    };
  }
  return {
    agents: commaList(options.agents),
    skills: commaList(options.skills),
    automations: commaList(options.automations),
    providers: providerMap(options.providers),
    scope: options.scope ?? "project",
    targetRoot: options.target ?? process.cwd()
  };
}

function serializablePlan(plan) {
  return {
    targetRoot: plan.targetRoot,
    profile: plan.profile,
    receipt: plan.receipt,
    warnings: plan.warnings,
    operations: plan.operations.map(({ source: _source, content: _content, files: _files, ...operation }) => operation)
  };
}

export async function run(argv, io = console) {
  const parsed = parseArgs(argv);
  const catalog = await loadCatalog();
  const write = (value) => io.log(typeof value === "string" ? value : JSON.stringify(value, null, 2));

  if (parsed.options.help || new Set(["help", "--help", "-h"]).has(parsed.command)) {
    write(HELP.trimEnd());
    return 0;
  }

  if (parsed.command === "list") {
    write(parsed.options.json ? publicCatalog(catalog) : formatCatalog(catalog));
    return 0;
  }

  if (parsed.command === "init") {
    if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error("init requires an interactive terminal; use plan/install flags for non-interactive use");
    const outcome = await runWizard(catalog);
    write(outcome.applied ? `Installed ${outcome.result.created.length} new paths.` : "No files were changed.");
    return 0;
  }

  if (new Set(["plan", "install"]).has(parsed.command)) {
    const plan = await createPlan(catalog, await selectionFromOptions(parsed.options, catalog));
    if (parsed.command === "plan" || parsed.options["dry-run"] || !parsed.options.json) {
      write(parsed.options.json ? serializablePlan(plan) : formatPlan(plan));
    }

    if (parsed.command === "plan" || parsed.options["dry-run"]) return 0;
    if (parsed.options.yes !== true) throw new Error("Install requires --yes after reviewing the plan, or use the interactive init command");
    const result = await applyPlan(plan, { force: parsed.options.force === true });
    write(parsed.options.json ? { plan: serializablePlan(plan), result } : `Installed: ${result.created.length}, replaced: ${result.replaced.length}, unchanged: ${result.unchanged.length}`);
    return 0;
  }

  if (parsed.command === "validate") {
    write(`Valid catalog: ${catalog.skills.length} skills, ${catalog.automations.length} automation recipes, ${catalog.agents.length} agents.`);
    return 0;
  }

  if (parsed.command === "doctor") {
    const findings = await scanPublicSafety(repositoryRoot, await localDenylist(repositoryRoot));
    if (findings.length > 0) {
      write({ ok: false, findings });
      return 1;
    }
    write(`Healthy: catalog is valid and the public-safety scan found no blocked patterns.`);
    return 0;
  }

  throw new Error(`Unknown command: ${parsed.command}\n\n${HELP}`);
}
