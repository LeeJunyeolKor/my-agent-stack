import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const repositoryRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));

const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SEMVER_PATTERN = /^\d+\.\d+\.\d+$/;
const TARGET_STATES = new Set(["verified", "unverified", "unsupported"]);
const COMPONENT_KINDS = new Set(["skill", "automation"]);
const MATURITY_STATES = new Set(["prototype", "recipe", "used", "verified"]);
const ORIGIN_STATES = new Set(["original", "third-party", "generalized"]);

export class CatalogError extends Error {
  constructor(message) {
    super(message);
    this.name = "CatalogError";
  }
}

async function readJson(file) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    throw new CatalogError(`Cannot read valid JSON from ${file}: ${error.message}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new CatalogError(message);
}

function assertId(id, label) {
  assert(typeof id === "string" && ID_PATTERN.test(id), `${label} must use lower-case hyphen-case: ${id}`);
}

function assertRelativePath(value, label) {
  assert(typeof value === "string" && value.length > 0, `${label} must be a non-empty relative path`);
  assert(!path.isAbsolute(value), `${label} must not be absolute: ${value}`);
  const normalized = path.normalize(value);
  assert(normalized !== ".." && !normalized.startsWith(`..${path.sep}`), `${label} must not escape its root: ${value}`);
}

async function loadComponents(root, folder, expectedKind) {
  const base = path.join(root, folder);
  const entries = await readdir(base, { withFileTypes: true });
  const components = [];

  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory()) continue;
    const sourceDirectory = path.join(base, entry.name);
    const manifest = await readJson(path.join(sourceDirectory, "manifest.json"));
    validateComponent(manifest, expectedKind, entry.name);
    const entrypoint = path.join(sourceDirectory, manifest.entrypoint);
    await access(entrypoint).catch(() => {
      throw new CatalogError(`${manifest.id} entrypoint does not exist: ${manifest.entrypoint}`);
    });

    if (expectedKind === "skill") {
      const skillText = await readFile(entrypoint, "utf8");
      const frontmatterName = skillText.match(/^---[\s\S]*?^name:\s*([^\n]+)$/m)?.[1]?.trim();
      assert(frontmatterName === manifest.id, `${manifest.id} SKILL.md frontmatter name must match its manifest id`);
    }

    components.push({ ...manifest, sourceDirectory });
  }

  return components;
}

function validateComponent(component, expectedKind, folderName) {
  assert(component.schemaVersion === 1, `${folderName} must use component schemaVersion 1`);
  assert(COMPONENT_KINDS.has(component.kind), `${folderName} has invalid component kind`);
  assert(component.kind === expectedKind, `${folderName} must have kind ${expectedKind}`);
  assertId(component.id, `${expectedKind} id`);
  assert(component.id === folderName, `${component.id} folder name must match its id`);
  assert(typeof component.name === "string" && component.name.length > 0, `${component.id} needs a name`);
  assert(SEMVER_PATTERN.test(component.version), `${component.id} needs a semantic version`);
  assert(typeof component.summary === "string" && component.summary.length > 0, `${component.id} needs a summary`);
  assert(MATURITY_STATES.has(component.maturity), `${component.id} has invalid maturity: ${component.maturity}`);
  assert(component.visibility === "public", `${component.id} is not eligible for the public install catalog`);
  assertRelativePath(component.entrypoint, `${component.id} entrypoint`);
  assert(ORIGIN_STATES.has(component.provenance?.origin), `${component.id} has invalid provenance origin`);
  assert(typeof component.provenance?.license === "string" && component.provenance.license.length > 0, `${component.id} needs provenance and a license`);
  assert(component.provenance?.sanitized === true, `${component.id} must be explicitly sanitized before public installation`);
  assert(Array.isArray(component.capabilities?.required), `${component.id} needs required capabilities`);
  assert(Array.isArray(component.capabilities?.optional), `${component.id} needs optional capabilities`);
  assert(new Set(component.capabilities.required).size === component.capabilities.required.length, `${component.id} has duplicate required capabilities`);
  assert(new Set(component.capabilities.optional).size === component.capabilities.optional.length, `${component.id} has duplicate optional capabilities`);
  for (const capability of component.capabilities.required) {
    assert(!component.capabilities.optional.includes(capability), `${component.id} capability cannot be both required and optional: ${capability}`);
  }
  for (const permission of ["filesystem", "network", "secrets", "mutations"]) {
    assert(Array.isArray(component.permissions?.[permission]), `${component.id} needs ${permission} permission metadata`);
  }
  assert(component.targets && typeof component.targets === "object", `${component.id} needs target compatibility metadata`);
  assert(typeof component.portfolio?.problem === "string" && component.portfolio.problem.length > 0, `${component.id} needs a portfolio problem`);
  assert(Array.isArray(component.portfolio?.demonstrates) && component.portfolio.demonstrates.length > 0, `${component.id} needs portfolio demonstrations`);
  for (const [target, state] of Object.entries(component.targets)) {
    assert(TARGET_STATES.has(state), `${component.id} has invalid target state for ${target}: ${state}`);
  }

  if (expectedKind === "automation") {
    assert(component.activation?.defaultEnabled === false, `${component.id} automation must be disabled by default`);
    assert(component.activation?.requiresConfirmation === true, `${component.id} automation must require confirmation`);
    if (component.permissions.mutations.length > 0) {
      assert(component.safeguards?.approvalBeforeMutation === true, `${component.id} mutation needs approval`);
      assert(component.safeguards?.verificationAfterMutation === true, `${component.id} mutation needs verification`);
    }
  }
}

function validateUnique(items, label) {
  const seen = new Set();
  for (const item of items) {
    assertId(item.id, `${label} id`);
    assert(!seen.has(item.id), `Duplicate ${label} id: ${item.id}`);
    seen.add(item.id);
  }
}

export async function loadCatalog(root = repositoryRoot) {
  const stack = await readJson(path.join(root, "catalog", "stack.json"));
  const agentData = await readJson(path.join(root, "catalog", "agents.json"));
  const providerData = await readJson(path.join(root, "catalog", "providers.json"));
  const skills = await loadComponents(root, "skills", "skill");
  const automations = await loadComponents(root, "automations", "automation");

  assert(stack.schemaVersion === 1 && SEMVER_PATTERN.test(stack.version), "Stack metadata is invalid");
  validateUnique(agentData.agents, "agent");
  validateUnique(providerData.groups, "provider group");
  validateUnique(skills, "skill");
  validateUnique(automations, "automation");

  for (const agent of agentData.agents) {
    assertRelativePath(agent.skillPaths?.project, `${agent.id} project skill path`);
    assertRelativePath(agent.skillPaths?.user, `${agent.id} user skill path`);
  }

  const knownAgents = new Set(agentData.agents.map((agent) => agent.id));
  const providedCapabilities = new Set();
  for (const group of providerData.groups) {
    validateUnique(group.providers, `${group.id} provider`);
    for (const provider of group.providers) {
      for (const capability of provider.capabilities ?? []) providedCapabilities.add(capability);
    }
  }

  for (const component of [...skills, ...automations]) {
    for (const agentId of knownAgents) {
      assert(Object.hasOwn(component.targets, agentId), `${component.id} must declare a target state for ${agentId}`);
    }
    for (const agentId of Object.keys(component.targets)) {
      assert(knownAgents.has(agentId), `${component.id} references unknown agent: ${agentId}`);
    }
    for (const capability of [...component.capabilities.required, ...component.capabilities.optional]) {
      assert(providedCapabilities.has(capability), `${component.id} requires unknown capability: ${capability}`);
    }
  }

  return {
    root,
    stack,
    agents: agentData.agents,
    providerGroups: providerData.groups,
    skills,
    automations
  };
}

export function publicCatalog(catalog) {
  const cleanComponent = ({ sourceDirectory: _sourceDirectory, ...component }) => component;
  return {
    stack: catalog.stack,
    agents: catalog.agents,
    providerGroups: catalog.providerGroups,
    skills: catalog.skills.map(cleanComponent),
    automations: catalog.automations.map(cleanComponent)
  };
}
