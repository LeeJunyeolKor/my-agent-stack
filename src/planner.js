import path from "node:path";
import { collectFiles, resolveInside } from "./files.js";

export class PlanError extends Error {
  constructor(message) {
    super(message);
    this.name = "PlanError";
  }
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function byId(items, id, label) {
  const match = items.find((item) => item.id === id);
  if (!match) throw new PlanError(`Unknown ${label}: ${id}`);
  return match;
}

function selectProviders(catalog, requested = {}) {
  const selections = {};
  const capabilities = new Set();
  const warnings = [];

  for (const group of catalog.providerGroups) {
    const selectedId = requested[group.id] ?? "none";
    selections[group.id] = selectedId;
    if (selectedId === "none") continue;
    const provider = group.providers.find((candidate) => candidate.id === selectedId);
    if (!provider) throw new PlanError(`Unknown ${group.id} provider: ${selectedId}`);
    for (const capability of provider.capabilities) capabilities.add(capability);
    if (provider.implementation === "profile-only") {
      warnings.push(`${provider.name} is recorded as a provider choice; this MVP does not install or authenticate an external connector.`);
    }
  }

  for (const requestedGroup of Object.keys(requested)) {
    if (!catalog.providerGroups.some((group) => group.id === requestedGroup)) {
      throw new PlanError(`Unknown provider group: ${requestedGroup}`);
    }
  }

  return { selections, capabilities, warnings };
}

function evaluateComponent(component, agents, capabilities) {
  const missingRequired = component.capabilities.required.filter((capability) => !capabilities.has(capability));
  const missingOptional = component.capabilities.optional.filter((capability) => !capabilities.has(capability));
  const supportedAgents = agents.filter((agent) => component.targets[agent.id] !== "unsupported");
  const unverifiedAgents = supportedAgents.filter((agent) => component.targets[agent.id] !== "verified");
  const reasons = [];

  if (missingRequired.length > 0) reasons.push(`missing required capabilities: ${missingRequired.join(", ")}`);
  if (supportedAgents.length === 0) reasons.push("unsupported by every selected agent");

  return {
    component,
    status: reasons.length > 0 ? "skipped" : "ready",
    reasons,
    missingRequired,
    missingOptional,
    supportedAgents,
    unverifiedAgents
  };
}

function relativeDestination(targetRoot, destination) {
  return path.relative(targetRoot, destination).split(path.sep).join("/");
}

export async function createPlan(catalog, input) {
  const targetRoot = path.resolve(input.targetRoot ?? process.cwd());
  const scope = input.scope ?? "project";
  if (!new Set(["project", "user"]).has(scope)) throw new PlanError(`Unknown install scope: ${scope}`);

  const agentIds = unique(input.agents);
  if (agentIds.length === 0) throw new PlanError("Select at least one agent");
  const agents = agentIds.map((id) => byId(catalog.agents, id, "agent"));
  const skills = unique(input.skills).map((id) => byId(catalog.skills, id, "skill"));
  const automations = unique(input.automations).map((id) => byId(catalog.automations, id, "automation"));
  if (skills.length === 0 && automations.length === 0) throw new PlanError("Select at least one skill or automation");

  const providerResolution = selectProviders(catalog, input.providers);
  const evaluatedSkills = skills.map((component) => evaluateComponent(component, agents, providerResolution.capabilities));
  const evaluatedAutomations = automations.map((component) => evaluateComponent(component, agents, providerResolution.capabilities));
  const evaluations = [...evaluatedSkills, ...evaluatedAutomations];
  const operationsByDestination = new Map();
  const warnings = [...providerResolution.warnings];

  for (const evaluation of evaluations) {
    if (evaluation.status === "skipped") continue;
    if (evaluation.missingOptional.length > 0) {
      warnings.push(`${evaluation.component.id} will run with reduced context; unavailable optional capabilities: ${evaluation.missingOptional.join(", ")}.`);
    }
    if (evaluation.unverifiedAgents.length > 0) {
      warnings.push(`${evaluation.component.id} has not been behaviorally verified for: ${evaluation.unverifiedAgents.map((agent) => agent.id).join(", ")}.`);
    }
    if (evaluation.component.permissions.mutations.length > 0) {
      warnings.push(`${evaluation.component.id} can guide runtime mutations (${evaluation.component.permissions.mutations.join(", ")}); installation grants no provider permission and each mutation still requires user authorization.`);
    }

    const files = await collectFiles(evaluation.component.sourceDirectory);
    if (evaluation.component.kind === "skill") {
      for (const agent of evaluation.supportedAgents) {
        const destination = resolveInside(targetRoot, path.join(agent.skillPaths[scope], evaluation.component.id));
        const existing = operationsByDestination.get(destination);
        if (existing) {
          if (existing.source !== evaluation.component.sourceDirectory) {
            throw new PlanError(`Two components resolve to the same destination: ${destination}`);
          }
          existing.agents = unique([...existing.agents, agent.id]);
          continue;
        }
        operationsByDestination.set(destination, {
          type: "copy-directory",
          kind: "skill",
          id: evaluation.component.id,
          version: evaluation.component.version,
          source: evaluation.component.sourceDirectory,
          destination,
          relativeDestination: relativeDestination(targetRoot, destination),
          agents: [agent.id],
          files
        });
      }
    } else {
      const destination = resolveInside(targetRoot, path.join(".my-agent-stack", "automations", evaluation.component.id));
      operationsByDestination.set(destination, {
        type: "copy-directory",
        kind: "automation",
        id: evaluation.component.id,
        version: evaluation.component.version,
        source: evaluation.component.sourceDirectory,
        destination,
        relativeDestination: relativeDestination(targetRoot, destination),
        agents: evaluation.supportedAgents.map((agent) => agent.id),
        files
      });
    }
  }

  const copyOperations = [...operationsByDestination.values()].sort((a, b) => a.relativeDestination.localeCompare(b.relativeDestination));
  const skipped = evaluations
    .filter((evaluation) => evaluation.status === "skipped")
    .map((evaluation) => ({ kind: evaluation.component.kind, id: evaluation.component.id, reasons: evaluation.reasons }));
  const profile = {
    schemaVersion: 1,
    stackVersion: catalog.stack.version,
    scope,
    agents: agentIds,
    providers: providerResolution.selections,
    selection: {
      skills: skills.map((skill) => skill.id),
      automations: automations.map((automation) => automation.id)
    }
  };
  const receipt = {
    schemaVersion: 1,
    stackVersion: catalog.stack.version,
    installed: copyOperations.map((operation) => ({
      kind: operation.kind,
      id: operation.id,
      version: operation.version,
      agents: operation.agents,
      destination: operation.relativeDestination,
      files: operation.files
    })),
    skipped
  };
  const profileDestination = resolveInside(targetRoot, path.join(".my-agent-stack", "profile.json"));
  const receiptDestination = resolveInside(targetRoot, path.join(".my-agent-stack", "receipt.json"));
  const operations = [
    ...copyOperations,
    {
      type: "write-json",
      id: "profile",
      destination: profileDestination,
      relativeDestination: relativeDestination(targetRoot, profileDestination),
      content: profile
    },
    {
      type: "write-json",
      id: "receipt",
      destination: receiptDestination,
      relativeDestination: relativeDestination(targetRoot, receiptDestination),
      content: receipt
    }
  ];

  return {
    targetRoot,
    scope,
    profile,
    receipt,
    evaluations,
    operations,
    warnings: unique(warnings)
  };
}
