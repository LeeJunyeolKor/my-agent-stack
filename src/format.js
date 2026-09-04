export function formatCatalog(catalog) {
  const lines = [
    `${catalog.stack.name} ${catalog.stack.version}`,
    "",
    "Agents",
    ...catalog.agents.map((agent) => `  ${agent.id.padEnd(14)} ${agent.name}`),
    "",
    "Skills",
    ...catalog.skills.map((skill) => `  ${skill.id.padEnd(28)} ${skill.summary}`),
    "",
    "Automation recipes",
    ...catalog.automations.map((automation) => `  ${automation.id.padEnd(28)} ${automation.summary}`),
    "",
    "Providers"
  ];
  for (const group of catalog.providerGroups) {
    lines.push(`  ${group.id.padEnd(14)} none, ${group.providers.map((provider) => provider.id).join(", ")}`);
  }
  return lines.join("\n");
}

export function formatPlan(plan) {
  const lines = [
    `Install plan for ${plan.targetRoot}`,
    `Scope: ${plan.scope}`,
    "",
    "Components"
  ];
  for (const evaluation of plan.evaluations) {
    const suffix = evaluation.status === "skipped" ? ` — ${evaluation.reasons.join("; ")}` : "";
    lines.push(`  ${evaluation.status === "ready" ? "INSTALL" : "SKIP"} ${evaluation.component.kind}:${evaluation.component.id}${suffix}`);
  }
  lines.push("", "Writes");
  for (const operation of plan.operations) lines.push(`  ${operation.type === "copy-directory" ? "COPY" : "WRITE"} ${operation.relativeDestination}`);
  if (plan.warnings.length > 0) {
    lines.push("", "Warnings", ...plan.warnings.map((warning) => `  - ${warning}`));
  }
  lines.push("", "Automation recipes are copied disabled; this command does not create schedules or external connections.");
  return lines.join("\n");
}
