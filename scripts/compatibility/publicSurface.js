function projectPublicSurface(pkg) {
  const contributes = pkg.contributes ?? {};

  return {
    activationEvents: [...(pkg.activationEvents ?? [])].sort(),
    commands: [...(contributes.commands ?? [])].sort(byCommand),
    menus: sortObject(contributes.menus ?? {}),
    keybindings: [...(contributes.keybindings ?? [])].sort(byCommand),
    configuration: sortObject(contributes.configuration?.properties ?? {})
  };
}

function byCommand(left, right) {
  return String(left.command).localeCompare(String(right.command));
}

function sortObject(value) {
  if (Array.isArray(value)) {
    return value
      .map(sortObject)
      .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  }
  if (!value || typeof value !== 'object') {
    return value;
  }

  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sortObject(value[key])])
  );
}

module.exports = { projectPublicSurface };
