export function parseArgs(argv) {
  const booleanFlags = new Set(["json", "yes", "force", "dry-run", "help"]);
  const result = { command: null, options: {}, positionals: [] };
  const args = [...argv];
  result.command = args.shift() ?? "help";

  while (args.length > 0) {
    const value = args.shift();
    if (!value.startsWith("--")) {
      result.positionals.push(value);
      continue;
    }

    const equalIndex = value.indexOf("=");
    const key = value.slice(2, equalIndex === -1 ? undefined : equalIndex);
    if (equalIndex !== -1) {
      if (booleanFlags.has(key)) throw new Error(`Boolean flag --${key} does not accept a value`);
      result.options[key] = value.slice(equalIndex + 1);
      continue;
    }
    if (booleanFlags.has(key)) {
      result.options[key] = true;
      continue;
    }
    const next = args.shift();
    if (next === undefined || next.startsWith("--")) throw new Error(`Missing value for --${key}`);
    result.options[key] = next;
  }

  return result;
}

export function commaList(value) {
  if (!value) return [];
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

export function providerMap(value) {
  const result = {};
  for (const entry of commaList(value)) {
    const separator = entry.indexOf("=");
    if (separator === -1) throw new Error(`Provider selection must use group=provider: ${entry}`);
    result[entry.slice(0, separator).trim()] = entry.slice(separator + 1).trim();
  }
  return result;
}
