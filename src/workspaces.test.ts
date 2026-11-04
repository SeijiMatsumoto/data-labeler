import { describe, it, expect } from "vitest";
import { sample } from "./model";
import {
  emptyWorkspace,
  normalizeWorkspace,
  mergeBackup,
  deleteWorkspace,
  deleteDataset,
} from "./workspaces";
describe("workspace data management", () => {
  it("migrates legacy data into Default Workspace without losing labels or position", () => {
    const dataset = structuredClone(sample);
    dataset.annotations = {
      "answer-001": { values: { correct: false, helpfulness: 4 } },
    };
    const state = normalizeWorkspace({
      datasets: [dataset],
      activeId: dataset.id,
      positions: { [dataset.id]: 2 },
    });
    expect(state.workspaces).toEqual([
      { id: "default", name: "Default Workspace" },
    ]);
    expect(state.datasetWorkspaces[dataset.id]).toBe("default");
    expect(state.datasets[0].annotations).toEqual(dataset.annotations);
    expect(state.positions[dataset.id]).toBe(2);
  });
  it("deletes a workspace by reassigning its datasets and preserving annotations", () => {
    const state = normalizeWorkspace({
      datasets: [sample],
      workspaces: [
        { id: "a", name: "A" },
        { id: "b", name: "B" },
      ],
      datasetWorkspaces: { [sample.id]: "a" },
      activeWorkspaceId: "a",
    });
    const next = deleteWorkspace(state, "a", "b");
    expect(next.workspaces).toEqual([{ id: "b", name: "B" }]);
    expect(next.datasetWorkspaces[sample.id]).toBe("b");
    expect(next.datasets).toEqual(state.datasets);
    expect(next.activeWorkspaceId).toBe("b");
    expect(() => deleteWorkspace(next, "b", "a")).toThrow("at least one");
  });
  it("deletes only the selected dataset, mapping, and position", () => {
    const state = normalizeWorkspace({
      datasets: [sample, { ...sample, id: "other" }],
      positions: { [sample.id]: 2, other: 1 },
      activeId: sample.id,
    });
    const next = deleteDataset(state, sample.id);
    expect(next.datasets.map((d) => d.id)).toEqual(["other"]);
    expect(next.positions).toEqual({ other: 1 });
    expect(next.datasetWorkspaces).toEqual({ other: "default" });
    expect(next.activeId).toBe("");
  });
  it("restores named workspace membership and copies conflicting datasets", () => {
    const current = normalizeWorkspace({ datasets: [sample], positions: {} });
    const backup = {
      datasets: [sample],
      positions: { [sample.id]: 2 },
      workspaces: [{ id: "review", name: "Review" }],
      activeWorkspaceId: "review",
      datasetWorkspaces: { [sample.id]: "review" },
    };
    const next = mergeBackup(current, backup, "default");
    const restored = next.datasets[1];
    expect(restored.id).not.toBe(sample.id);
    expect(next.datasetWorkspaces[restored.id]).toBe("review");
    expect(next.positions[restored.id]).toBe(2);
    expect(next.workspaces.some((w) => w.name === "Review")).toBe(true);
  });
  it("assigns legacy backups to the selected workspace and restores empty groups", () => {
    const state = emptyWorkspace();
    state.workspaces.push({ id: "b", name: "B" });
    const restored = mergeBackup(state, { datasets: [sample] }, "b");
    expect(restored.datasetWorkspaces[sample.id]).toBe("b");
    const empty = mergeBackup(
      state,
      { datasets: [], workspaces: [{ id: "empty", name: "Empty" }] },
      "default",
    );
    expect(empty.workspaces.some((g) => g.id === "empty")).toBe(true);
  });
});
