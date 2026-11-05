import { validate, type Workspace, type WorkspaceGroup } from "./model";
export function emptyWorkspace(): Workspace {
  return {
    datasets: [],
    activeId: "",
    positions: {},
    workspaces: [{ id: "default", name: "Default Workspace" }],
    activeWorkspaceId: "default",
    datasetWorkspaces: {},
  };
}
export function normalizeWorkspace(input: any): Workspace {
  if (!input || !Array.isArray(input.datasets))
    throw Error("Invalid workspace backup.");
  input.datasets.forEach(validate);
  if (
    new Set(input.datasets.map((d: any) => d.id)).size !== input.datasets.length
  )
    throw Error("Duplicate dataset IDs in backup.");
  const groups: WorkspaceGroup[] =
    Array.isArray(input.workspaces) && input.workspaces.length
      ? input.workspaces
      : emptyWorkspace().workspaces;
  if (
    groups.some(
      (g) =>
        !g ||
        typeof g.id !== "string" ||
        !g.id.trim() ||
        ["__proto__", "constructor", "prototype"].includes(g.id) ||
        typeof g.name !== "string" ||
        !g.name.trim(),
    ) ||
    new Set(groups.map((g) => g.id)).size !== groups.length
  )
    throw Error("Invalid workspace names or IDs.");
  const activeWorkspaceId = groups.some((g) => g.id === input.activeWorkspaceId)
    ? input.activeWorkspaceId
    : groups[0].id;
  const positions: Record<string, number> = {},
    datasetWorkspaces: Record<string, string> = {};
  for (const d of input.datasets) {
    const pos = input.positions?.[d.id];
    positions[d.id] = Number.isInteger(pos)
      ? Math.max(0, Math.min(pos, d.items.length - 1))
      : 0;
    const group = input.datasetWorkspaces?.[d.id];
    datasetWorkspaces[d.id] = groups.some((g) => g.id === group)
      ? group
      : groups[0].id;
  }
  return {
    datasets: input.datasets,
    activeId: input.datasets.some((d: any) => d.id === input.activeId)
      ? input.activeId
      : "",
    positions,
    workspaces: groups,
    activeWorkspaceId,
    datasetWorkspaces,
  };
}
export function mergeBackup(
  current: Workspace,
  input: any,
  targetWorkspaceId: string,
  keepBackupWorkspaces = Array.isArray(input.workspaces),
): Workspace {
  const backup = normalizeWorkspace(input),
    groups = [...current.workspaces],
    groupMap: Record<string, string> = {};
  if (!keepBackupWorkspaces) {
    for (const group of backup.workspaces)
      groupMap[group.id] = targetWorkspaceId;
  } else
    for (const group of backup.workspaces) {
      const existing = groups.find((g) => g.id === group.id);
      if (existing && existing.name === group.name)
        groupMap[group.id] = existing.id;
      else {
        const id = existing ? `workspace-${crypto.randomUUID()}` : group.id;
        groupMap[group.id] = id;
        groups.push({ ...group, id });
      }
    }
  const used = new Set(current.datasets.map((d) => d.id));
  const positions = { ...current.positions },
    mapping = { ...current.datasetWorkspaces };
  const datasets = backup.datasets.map((d) => {
    const copy = structuredClone(d);
    if (used.has(copy.id)) {
      copy.id += `-copy-${crypto.randomUUID()}`;
      copy.name += " (copy)";
    }
    used.add(copy.id);
    positions[copy.id] = backup.positions[d.id];
    mapping[copy.id] = groupMap[backup.datasetWorkspaces[d.id]];
    return copy;
  });
  return {
    ...current,
    workspaces: groups,
    datasets: [...current.datasets, ...datasets],
    positions,
    datasetWorkspaces: mapping,
    activeId: datasets[0]?.id || current.activeId,
    activeWorkspaceId: datasets[0]
      ? mapping[datasets[0].id]
      : groupMap[backup.activeWorkspaceId] || targetWorkspaceId,
  };
}
export function moveDataset(
  state: Workspace,
  id: string,
  target: string,
): Workspace {
  if (!state.workspaces.some((g) => g.id === target))
    throw Error("Choose a destination workspace.");
  return {
    ...state,
    datasetWorkspaces: { ...state.datasetWorkspaces, [id]: target },
  };
}
export function deleteDataset(state: Workspace, id: string): Workspace {
  const positions = { ...state.positions },
    mapping = { ...state.datasetWorkspaces };
  delete positions[id];
  delete mapping[id];
  return {
    ...state,
    datasets: state.datasets.filter((d) => d.id !== id),
    positions,
    datasetWorkspaces: mapping,
    activeId: state.activeId === id ? "" : state.activeId,
  };
}
export function deleteWorkspace(
  state: Workspace,
  id: string,
  target: string,
): Workspace {
  if (state.workspaces.length === 1)
    throw Error("Keep at least one workspace.");
  if (id === target || !state.workspaces.some((g) => g.id === target))
    throw Error("Choose a destination workspace.");
  return {
    ...state,
    workspaces: state.workspaces.filter((g) => g.id !== id),
    activeWorkspaceId:
      state.activeWorkspaceId === id ? target : state.activeWorkspaceId,
    datasetWorkspaces: Object.fromEntries(
      Object.entries(state.datasetWorkspaces).map(([dataset, group]) => [
        dataset,
        group === id ? target : group,
      ]),
    ),
  };
}
