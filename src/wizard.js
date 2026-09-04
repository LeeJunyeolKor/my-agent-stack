import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { createPlan } from "./planner.js";
import { formatPlan } from "./format.js";
import { applyPlan } from "./installer.js";

function parseSelection(answer, choices, defaults) {
  const requested = answer.trim() ? answer.split(",").map((value) => value.trim()) : defaults;
  const allowed = new Set(choices.map((choice) => choice.id));
  for (const id of requested) {
    if (!allowed.has(id)) throw new Error(`Unknown selection: ${id}`);
  }
  return [...new Set(requested)];
}

function choiceLine(items) {
  return items.map((item) => item.id).join(", ");
}

export async function runWizard(catalog, { cwd = process.cwd(), inputStream = input, outputStream = output } = {}) {
  const rl = createInterface({ input: inputStream, output: outputStream });
  try {
    outputStream.write("My Agent Stack setup\n\n");
    const agentAnswer = await rl.question(`Agents (${choiceLine(catalog.agents)}) [codex]: `);
    const agents = parseSelection(agentAnswer, catalog.agents, ["codex"]);
    const skillAnswer = await rl.question(`Skills (${choiceLine(catalog.skills)}) [all]: `);
    const skills = parseSelection(skillAnswer, catalog.skills, catalog.skills.map((skill) => skill.id));
    const automationAnswer = await rl.question(`Automation recipes (${choiceLine(catalog.automations)}) [none]: `);
    const automations = parseSelection(automationAnswer, catalog.automations, []);

    const providers = {};
    for (const group of catalog.providerGroups) {
      const answer = await rl.question(`${group.name} provider (none, ${choiceLine(group.providers)}) [none]: `);
      providers[group.id] = answer.trim() || "none";
    }
    const targetRoot = (await rl.question(`Target directory [${cwd}]: `)).trim() || cwd;
    const scope = (await rl.question("Install scope (project, user) [project]: ")).trim() || "project";
    const plan = await createPlan(catalog, { agents, skills, automations, providers, targetRoot, scope });
    outputStream.write(`\n${formatPlan(plan)}\n\n`);
    const confirmed = (await rl.question("Apply this plan? [y/N]: ")).trim().toLowerCase();
    if (!new Set(["y", "yes"]).has(confirmed)) return { applied: false, plan };
    const result = await applyPlan(plan);
    return { applied: true, plan, result };
  } finally {
    rl.close();
  }
}
