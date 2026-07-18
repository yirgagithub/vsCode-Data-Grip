function projectPublicSurface(pkg) {
  const contributes = pkg.contributes ?? {};

  return {
    activationEvents: [...(pkg.activationEvents ?? [])].sort(compareCodeUnits),
    commands: [...(contributes.commands ?? [])]
      .map(canonicalizeObjectKeys)
      .sort(byCommand),
    menus: canonicalizeObjectKeys(contributes.menus ?? {}),
    keybindings: canonicalizeObjectKeys(contributes.keybindings ?? []),
    configuration: canonicalizeObjectKeys(contributes.configuration?.properties ?? {})
  };
}

function byCommand(left, right) {
  return compareCodeUnits(String(left.command), String(right.command));
}

function compareCodeUnits(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function canonicalizeObjectKeys(value) {
  if (Array.isArray(value)) {
    return value.map(canonicalizeObjectKeys);
  }
  if (!value || typeof value !== 'object') {
    return value;
  }

  return Object.fromEntries(
    Object.keys(value)
      .sort(compareCodeUnits)
      .map((key) => [key, canonicalizeObjectKeys(value[key])])
  );
}

module.exports = { projectPublicSurface };
