// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import {
  render,
  screen,
  cleanup,
  fireEvent,
  act,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";
import { sample, validate } from "./model";
import { IDLE_MS } from "./session";
const key = "labeldesk.workspace.v1";
beforeEach(() => {
  localStorage.clear();
  window.history.replaceState(null, "", "/");
  Element.prototype.scrollTo = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
const seedWorkspace = (dataset = sample) =>
  localStorage.setItem(
    key,
    JSON.stringify({
      datasets: [dataset],
      activeId: dataset.id,
      positions: { [dataset.id]: 0 },
      workspaces: [
        { id: "default", name: "Default Workspace" },
        { id: "review", name: "Review" },
      ],
      activeWorkspaceId: "default",
      datasetWorkspaces: { [dataset.id]: "default" },
    }),
  );
const openSample = () => {
  seedWorkspace();
  window.history.replaceState(null, "", `/datasets/${sample.id}`);
  return render(<App />);
};
const stored = () => JSON.parse(localStorage.getItem(key)!);
describe("labeling sessions", () => {
  const start = async () => {
    const user = userEvent.setup();
    const view = openSample();
    await user.click(screen.getByRole("button", { name: /Start session/ }));
    return { user, view };
  };
  const setHidden = (hidden: boolean) => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: hidden,
    });
    fireEvent(document, new Event("visibilitychange"));
  };
  afterEach(() => {
    delete (document as any).hidden;
    vi.useRealTimers();
  });
  it("focuses the page and shows progress in the tab title", async () => {
    await start();
    expect(document.querySelector(".app")!.className).toContain(
      "focus-session",
    );
    expect(screen.getByRole("timer").textContent).toBe("00:00");
    expect(document.title).toBe(`0/${sample.items.length} · Labeldesk`);
  });
  it("pauses when the tab is hidden and resumes on any key", async () => {
    await start();
    act(() => setHidden(true));
    expect(document.title).toContain("paused");
    act(() => setHidden(false));
    expect(screen.getByRole("dialog", { name: "Welcome back" })).toBeTruthy();
    fireEvent.keyDown(document.body, { key: "x" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.title).not.toContain("paused");
  });
  it("takes idle time back off the clock", () => {
    vi.useFakeTimers();
    openSample();
    fireEvent.click(screen.getByRole("button", { name: /Start session/ }));
    act(() => void vi.advanceTimersByTime(5000));
    fireEvent.pointerMove(window);
    act(() => void vi.advanceTimersByTime(IDLE_MS + 2000));
    expect(screen.getByRole("dialog", { name: "Still there?" })).toBeTruthy();
    expect(screen.getByRole("timer", { hidden: true }).textContent).toBe(
      "00:05",
    );
  });
  it("offers to resume after the tab closes", async () => {
    const { view } = await start();
    view.unmount();
    window.history.replaceState(null, "", "/");
    render(<App />);
    expect(screen.getByText("Unfinished session")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Resume/ }));
    expect(document.querySelector(".focus-session")).toBeTruthy();
  });
  it("explains why a finished dataset has no session to start", () => {
    seedWorkspace({
      ...sample,
      annotations: Object.fromEntries(
        sample.items.map((item) => [
          item.id,
          { values: { correct: true, helpfulness: 4 } },
        ]),
      ),
    });
    window.history.replaceState(null, "", `/datasets/${sample.id}`);
    render(<App />);
    expect(
      (
        screen.getByRole("button", {
          name: "All examples completed",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(screen.queryByRole("button", { name: /Start session/ })).toBeNull();
  });
  it("limits a session to the chosen goal", async () => {
    const big = {
      ...sample,
      items: Array.from({ length: 12 }, (_, i) => ({
        ...sample.items[0],
        id: `item-${i}`,
      })),
    };
    seedWorkspace(big);
    window.history.replaceState(null, "", `/datasets/${sample.id}`);
    const user = userEvent.setup();
    render(<App />);
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Session goal" }),
      "10",
    );
    await user.click(screen.getByRole("button", { name: /Start session/ }));
    expect(document.title).toBe("0/10 · Labeldesk");
  });
  it("finishes with a summary, then reviews skipped examples", async () => {
    await start();
    sample.items.forEach(() => fireEvent.keyDown(document.body, { key: "s" }));
    expect(
      await screen.findByRole("dialog", { name: "Session complete" }),
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", {
        name: `Review skipped (${sample.items.length})`,
      }),
    );
    expect(document.querySelector(".focus-session")).toBeTruthy();
    expect(document.title).toBe(`0/${sample.items.length} · Labeldesk`);
  });
  it("moves on with Enter only when the example is finished", async () => {
    await start();
    const first = sample.items[0].id;
    fireEvent.keyDown(document.body, { key: "Enter" });
    expect(screen.getByRole("heading", { name: first })).toBeTruthy();
    fireEvent.keyDown(document.body, { key: "1" });
    fireEvent.keyDown(document.body, { key: "ArrowDown" });
    fireEvent.keyDown(document.body, { key: "4" });
    fireEvent.keyDown(document.body, { key: "Enter" });
    expect(
      await screen.findByRole("heading", { name: sample.items[1].id }),
    ).toBeTruthy();
  });
});
describe("export", () => {
  it("recommends annotated JSON and names files by format", async () => {
    const user = userEvent.setup();
    const names: string[] = [];
    URL.createObjectURL = vi.fn(() => "blob:test");
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      names.push(this.download);
    });
    openSample();
    await user.click(screen.getByRole("button", { name: "Export" }));
    for (const name of [
      /Annotated JSON \(Recommended\)/,
      /Labels-only JSON/,
      /^CSV/,
    ])
      await user.click(screen.getByRole("button", { name }));
    expect(names).toEqual([
      `${sample.id}-annotated.json`,
      `${sample.id}-labels-only.json`,
      `${sample.id}-labels-only.csv`,
    ]);
  });
});
describe("moving and restoring datasets", () => {
  it("moves a dataset to another workspace", async () => {
    const user = userEvent.setup();
    openSample();
    await user.click(
      screen.getByRole("button", { name: `Move dataset ${sample.name}` }),
    );
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Move dataset to" }),
      "review",
    );
    await user.click(screen.getByRole("button", { name: "Move dataset" }));
    await waitFor(() =>
      expect(stored().datasetWorkspaces[sample.id]).toBe("review"),
    );
  });
  it("honors a workspace chosen before loading a named backup", async () => {
    const user = userEvent.setup();
    seedWorkspace({ ...sample, id: "existing" });
    window.history.replaceState(null, "", "/?panel=import");
    render(<App />);
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Import workspace" }),
      "review",
    );
    const backup = {
      format: "labeldesk-workspace/1",
      datasets: [sample],
      positions: {},
      workspaces: [{ id: "default", name: "Default Workspace" }],
      datasetWorkspaces: { [sample.id]: "default" },
    };
    fireEvent.change(screen.getByLabelText("Dataset JSON"), {
      target: { value: JSON.stringify(backup) },
    });
    await user.click(
      screen.getByRole("button", {
        name: /Preview dataset/,
      }),
    );
    expect(
      (
        screen.getByRole("combobox", {
          name: "Import workspace",
        }) as HTMLSelectElement
      ).value,
    ).toBe("review");
    await user.click(screen.getByRole("button", { name: "Restore backup" }));
    await waitFor(() =>
      expect(stored().datasetWorkspaces[sample.id]).toBe("review"),
    );
  });
});
describe("labeling workflow", () => {
  it("saves binary No and scale values, resumes after remount, and clears answers", async () => {
    const user = userEvent.setup();
    const first = render(<App />);
    await user.click(
      screen.getByRole("button", { name: /Try sample dataset/ }),
    );
    await user.click(screen.getByRole("button", { name: "No" }));
    await user.click(screen.getByRole("button", { name: "4" }));
    await waitFor(() =>
      expect(
        JSON.parse(localStorage.getItem(key)!).datasets[0].annotations[
          "answer-001"
        ].values,
      ).toEqual({ correct: false, helpfulness: 4 }),
    );
    expect(
      screen.getByText("completed", { selector: ".status-pill" }),
    ).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Next" }));
    first.unmount();
    render(<App />);
    expect(screen.getByRole("heading", { name: "answer-002" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Previous" }));
    expect(screen.getByRole("button", { name: "No" }).className).toContain(
      "chosen",
    );
    await user.click(screen.getAllByRole("button", { name: "Clear" })[0]);
    expect(
      screen.getByText("in progress", { selector: ".status-pill" }),
    ).toBeTruthy();
  });
  it("copies a generation prompt with schema and no prefilled judgments", async () => {
    const user = userEvent.setup();
    const write = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue();
    render(<App />);
    await user.click(
      screen.getAllByRole("button", { name: "Copy dataset prompt" })[0],
    );
    expect(write).toHaveBeenCalledWith(
      expect.stringContaining("schemaVersion"),
    );
    expect(write).toHaveBeenCalledWith(
      expect.stringContaining("Never prefill human judgments"),
    );
  });
  it("validates imported files and imports annotated datasets", async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);
    const d = structuredClone(sample);
    d.annotations = {
      "answer-001": {
        values: { correct: false, helpfulness: 5, comment: null },
      },
    };
    const f = new File([JSON.stringify(d)], "dataset.json", {
      type: "application/json",
    });
    Object.defineProperty(f, "text", { value: async () => JSON.stringify(d) });
    fireEvent.change(container.querySelector("input[type=file]")!, {
      target: { files: [f] },
    });
    await user.click(
      await screen.findByRole("button", { name: /Start labeling/ }),
    );
    expect(screen.getByRole("button", { name: "No" }).className).toContain(
      "chosen",
    );
    expect(
      validate(JSON.parse(localStorage.getItem(key)!).datasets[0]).id,
    ).toBe(d.id);
  });
  it("keeps changes available when browser storage fails", async () => {
    const user = userEvent.setup();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw Error("quota");
    });
    render(<App />);
    await user.click(
      screen.getByRole("button", { name: /Try sample dataset/ }),
    );
    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      expect.stringContaining("storage is full"),
    );
    expect(screen.getByRole("heading", { name: "answer-001" })).toBeTruthy();
  });
  it("supports keyboard scoring after clicking a scoring button", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(
      screen.getByRole("button", { name: /Try sample dataset/ }),
    );
    await user.click(screen.getByRole("button", { name: "No" }));
    await user.keyboard("{ArrowDown}3");
    expect(
      JSON.parse(localStorage.getItem(key)!).datasets[0].annotations[
        "answer-001"
      ].values,
    ).toEqual({ correct: false, helpfulness: 3 });
    await user.keyboard("n");
    expect(screen.getByRole("heading", { name: "answer-002" })).toBeTruthy();
  });
  it("configures choice options without editing JSON", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(
      screen.getByRole("button", { name: /Try sample dataset/ }),
    );
    await user.click(screen.getByRole("button", { name: "Rubric" }));
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Add scoring field" }),
      "single-select",
    );
    const options = screen.getByRole("textbox", {
      name: "Choices for New field",
    });
    await user.clear(options);
    await user.type(options, "Good\nNeeds work");
    await user.click(screen.getByRole("button", { name: "Save rubric" }));
    await user.click(screen.getByRole("button", { name: "Needs work" }));
    const d = validate(JSON.parse(localStorage.getItem(key)!).datasets[0]);
    expect(d.annotations!["answer-001"].values[d.rubric.at(-1)!.id]).toBe(
      "Needs work",
    );
  });
});

describe("URL navigation", () => {
  it("navigates home, examples, and panels with browser Back and Forward", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(
      screen.getByRole("button", { name: /Try sample dataset/ }),
    );
    expect(window.location.pathname).toBe(
      "/datasets/demo-answer-quality/examples/answer-001",
    );
    await user.click(screen.getByRole("button", { name: "No" }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(window.location.pathname).toContain("/answer-002");
    await act(async () => {
      window.history.back();
    });
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "answer-001" })).toBeTruthy(),
    );
    expect(
      screen.getByRole("button", { name: "No" }).getAttribute("aria-pressed"),
    ).toBe("true");
    await act(async () => {
      window.history.back();
    });
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /Try sample dataset/ }),
      ).toBeTruthy(),
    );
    expect(window.location.pathname).toBe("/");
    await act(async () => {
      window.history.forward();
    });
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "answer-001" })).toBeTruthy(),
    );
    await user.click(screen.getByRole("button", { name: "Rubric" }));
    expect(window.location.search).toBe("?panel=rubric");
    await act(async () => {
      window.history.back();
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await act(async () => {
      window.history.forward();
    });
    await waitFor(() =>
      expect(screen.getByRole("dialog", { name: "rubric" })).toBeTruthy(),
    );
    expect(
      screen
        .getAllByRole("textbox", { name: "Field label" })[0]
        .getAttribute("value"),
    ).toBe("Factually correct");
  });
  it("opens a bookmarked example directly and preserves its URL on reload", () => {
    localStorage.setItem(
      key,
      JSON.stringify({ datasets: [sample], activeId: "", positions: {} }),
    );
    window.history.replaceState(
      null,
      "",
      "/datasets/demo-answer-quality/examples/answer-003?panel=rubric",
    );
    const first = render(<App />);
    expect(screen.getByRole("heading", { name: "answer-003" })).toBeTruthy();
    expect(
      screen
        .getAllByRole("textbox", { name: "Field label" })[0]
        .getAttribute("value"),
    ).toBe("Factually correct");
    first.unmount();
    render(<App />);
    expect(screen.getByRole("heading", { name: "answer-003" })).toBeTruthy();
    expect(window.location.pathname).toContain("answer-003");
  });
  it("shows a recoverable message for missing local datasets", () => {
    window.history.replaceState(null, "", "/datasets/missing/examples/example");
    render(<App />);
    expect(screen.getByRole("alert").textContent).toContain(
      "not available in this browser",
    );
    expect(
      screen
        .getByRole("link", { name: "Return to workspace" })
        .getAttribute("href"),
    ).toBe("/");
  });
});

describe("JSON import options", () => {
  it("validates pasted JSON, permits correction, and imports after confirmation", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(
      screen.getAllByRole("button", { name: "Import dataset" })[0],
    );
    expect(window.location.search).toBe("?panel=import");
    const input = screen.getByRole("textbox", { name: "Dataset JSON" });
    expect(
      (
        screen.getByRole("button", {
          name: "Preview dataset",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    fireEvent.change(input, { target: { value: "not json" } });
    await user.click(screen.getByRole("button", { name: "Preview dataset" }));
    expect(screen.getByRole("alert")).toBeTruthy();
    fireEvent.change(input, { target: { value: JSON.stringify(sample) } });
    await user.click(screen.getByRole("button", { name: "Preview dataset" }));
    expect(localStorage.getItem(key)).toBeNull();
    await user.click(screen.getByRole("button", { name: /Start labeling/ }));
    expect(window.location.pathname).toContain(
      "/datasets/demo-answer-quality/examples/answer-001",
    );
    expect(
      validate(JSON.parse(localStorage.getItem(key)!).datasets[0]).id,
    ).toBe(sample.id);
  });
  it("accepts a dropped JSON file and previews it before importing", async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);
    const file = new File([JSON.stringify(sample)], "sample.json", {
      type: "application/json",
    });
    Object.defineProperty(file, "text", {
      value: async () => JSON.stringify(sample),
    });
    const transfer = { files: [file], types: ["Files"], dropEffect: "" };
    fireEvent.dragEnter(container.querySelector(".app")!, {
      dataTransfer: transfer,
    });
    expect(screen.getByText("Drop JSON to import")).toBeTruthy();
    fireEvent.drop(container.querySelector(".app")!, {
      dataTransfer: transfer,
    });
    await user.click(
      await screen.findByRole("button", { name: /Start labeling/ }),
    );
    expect(screen.queryByText("Drop JSON to import")).toBeNull();
    expect(screen.getByRole("heading", { name: "answer-001" })).toBeTruthy();
  });
});

describe("end of labeling", () => {
  it("prompts completion on the final example, then offers export", async () => {
    const user = userEvent.setup();
    const dataset = { ...sample, items: [sample.items[0]] };
    localStorage.setItem(
      key,
      JSON.stringify({
        datasets: [dataset],
        activeId: dataset.id,
        positions: {},
      }),
    );
    window.history.replaceState(
      null,
      "",
      `/datasets/${dataset.id}/examples/answer-001`,
    );
    render(<App />);
    expect(screen.queryByRole("button", { name: "Next unlabeled" })).toBeNull();
    expect(
      (
        screen.getByRole("button", {
          name: "Complete this example",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    await user.click(screen.getByRole("button", { name: "No" }));
    await user.click(screen.getByRole("button", { name: "4" }));
    await user.click(screen.getByRole("button", { name: "Export results" }));
    expect(screen.getByRole("dialog", { name: "export" })).toBeTruthy();
    expect(window.location.search).toBe("?panel=export");
  });
  it("still returns to earlier incomplete examples from the last example", () => {
    localStorage.setItem(
      key,
      JSON.stringify({
        datasets: [sample],
        activeId: sample.id,
        positions: {},
      }),
    );
    window.history.replaceState(
      null,
      "",
      `/datasets/${sample.id}/examples/answer-003`,
    );
    render(<App />);
    expect(screen.getByRole("button", { name: "Next unlabeled" })).toBeTruthy();
  });
});

describe("encoded dataset and example IDs", () => {
  it("opens an imported example with a colon in its ID and survives refresh", async () => {
    const user = userEvent.setup();
    const dataset = structuredClone(sample);
    dataset.id = "itk-takeaway-comparison-20261104-v1";
    dataset.items = [
      {
        ...dataset.items[0],
        id: "56cca651-014f-4eda-84aa-9bc6b4df4c19:takeaway-v1",
      },
    ];
    const first = render(<App />);
    await user.click(
      screen.getAllByRole("button", { name: "Import dataset" })[0],
    );
    fireEvent.change(screen.getByRole("textbox", { name: "Dataset JSON" }), {
      target: { value: JSON.stringify(dataset) },
    });
    await user.click(screen.getByRole("button", { name: "Preview dataset" }));
    await user.click(screen.getByRole("button", { name: /Start labeling/ }));
    expect(window.location.pathname).toContain("%3Atakeaway-v1");
    expect(
      screen.getByRole("heading", { name: dataset.items[0].id }),
    ).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    first.unmount();
    render(<App />);
    expect(
      screen.getByRole("heading", { name: dataset.items[0].id }),
    ).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it("decodes spaces, slashes, percent signs, and Unicode IDs from deep links", () => {
    const dataset = structuredClone(sample);
    dataset.id = "review:résumé / 50%";
    dataset.items = [{ ...dataset.items[0], id: "example:日本語 / 50%?ref#1" }];
    localStorage.setItem(
      key,
      JSON.stringify({
        datasets: [dataset],
        positions: {},
        activeId: dataset.id,
      }),
    );
    window.history.replaceState(
      null,
      "",
      `/datasets/${encodeURIComponent(dataset.id)}/examples/${encodeURIComponent(dataset.items[0].id)}`,
    );
    render(<App />);
    expect(
      screen.getByRole("heading", { name: dataset.items[0].id }),
    ).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("named workspaces", () => {
  it("creates, renames, switches, and imports into the selected workspace", async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(
      (screen.getByRole("combobox", { name: "Workspace" }) as HTMLSelectElement)
        .selectedOptions[0].textContent,
    ).toBe("Default Workspace");
    await user.click(screen.getByRole("button", { name: "Create workspace" }));
    await user.type(
      screen.getByRole("textbox", { name: "Workspace name" }),
      "Takeaway review",
    );
    await user.click(
      screen.getAllByRole("button", { name: "Create workspace" }).at(-1)!,
    );
    const group = JSON.parse(localStorage.getItem(key)!).activeWorkspaceId;
    expect(window.location.pathname).toBe(`/workspaces/${group}`);
    await user.click(screen.getByRole("button", { name: "Manage" }));
    const name = screen.getByRole("textbox", { name: "Workspace name" });
    await user.clear(name);
    await user.type(name, "Editorial review");
    await user.click(
      screen.getByRole("button", { name: "Save workspace name" }),
    );
    await user.click(
      screen.getByRole("button", { name: /Try sample dataset/ }),
    );
    expect(
      JSON.parse(localStorage.getItem(key)!).datasetWorkspaces[sample.id],
    ).toBe(group);
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Workspace" }),
      "default",
    );
    expect(screen.queryByRole("link", { name: /Answer quality/ })).toBeNull();
    await user.click(
      screen.getAllByRole("button", { name: "Import dataset" })[0],
    );
    expect(
      (
        screen.getByRole("combobox", {
          name: "Import workspace",
        }) as HTMLSelectElement
      ).value,
    ).toBe("default");
    const other = { ...sample, id: "other-dataset", name: "Other dataset" };
    fireEvent.change(screen.getByRole("textbox", { name: "Dataset JSON" }), {
      target: { value: JSON.stringify(other) },
    });
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Import workspace" }),
      group,
    );
    await user.click(screen.getByRole("button", { name: "Preview dataset" }));
    await user.click(screen.getByRole("button", { name: /Start labeling/ }));
    expect(
      JSON.parse(localStorage.getItem(key)!).datasetWorkspaces[other.id],
    ).toBe(group);
    expect(
      (screen.getByRole("combobox", { name: "Workspace" }) as HTMLSelectElement)
        .value,
    ).toBe(group);
  });
  it("cancels or confirms dataset deletion from the sidebar", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(
      screen.getByRole("button", { name: /Try sample dataset/ }),
    );
    await user.click(
      screen.getByRole("button", { name: `Delete dataset ${sample.name}` }),
    );
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("heading", { name: "answer-001" })).toBeTruthy();
    await user.click(
      screen.getByRole("button", { name: `Delete dataset ${sample.name}` }),
    );
    await user.click(screen.getByRole("button", { name: "Delete dataset" }));
    expect(JSON.parse(localStorage.getItem(key)!).datasets).toHaveLength(0);
    expect(window.location.pathname).toBe("/workspaces/default");
  });
  it("deletes a workspace while moving its labeled dataset to another workspace", async () => {
    const user = userEvent.setup();
    const dataset = structuredClone(sample);
    dataset.annotations = {
      "answer-001": { values: { correct: false, helpfulness: 3 } },
    };
    localStorage.setItem(
      key,
      JSON.stringify({
        datasets: [dataset],
        positions: {},
        workspaces: [
          { id: "default", name: "Default Workspace" },
          { id: "review", name: "Review" },
        ],
        activeWorkspaceId: "review",
        datasetWorkspaces: { [dataset.id]: "review" },
      }),
    );
    window.history.replaceState(null, "", "/workspaces/review");
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Manage" }));
    await user.click(screen.getByRole("button", { name: "Delete workspace" }));
    const state = JSON.parse(localStorage.getItem(key)!);
    expect(state.workspaces).toHaveLength(1);
    expect(state.datasetWorkspaces[dataset.id]).toBe("default");
    expect(state.datasets[0].annotations).toEqual(dataset.annotations);
    expect(window.location.pathname).toBe("/workspaces/default");
  });
});

describe("workspace navigation and sample reuse", () => {
  it("keeps sample datasets scoped to each workspace and supports browser history", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(
      screen.getByRole("button", { name: /Try sample dataset/ }),
    );
    await user.click(screen.getByRole("button", { name: "Create workspace" }));
    await user.type(
      screen.getByRole("textbox", { name: "Workspace name" }),
      "Second",
    );
    await user.click(
      screen.getAllByRole("button", { name: "Create workspace" }).at(-1)!,
    );
    const secondId = (
      screen.getByRole("combobox", { name: "Workspace" }) as HTMLSelectElement
    ).value;
    await user.click(
      screen.getByRole("button", { name: /Try sample dataset/ }),
    );
    const state = JSON.parse(localStorage.getItem(key)!);
    expect(state.datasets).toHaveLength(2);
    expect(state.datasetWorkspaces[state.datasets[1].id]).toBe(secondId);
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Workspace" }),
      "default",
    );
    await act(async () => {
      window.history.back();
    });
    await waitFor(() =>
      expect(
        (
          screen.getByRole("combobox", {
            name: "Workspace",
          }) as HTMLSelectElement
        ).value,
      ).toBe(secondId),
    );
    expect(screen.getByRole("heading", { name: "answer-001" })).toBeTruthy();
  });
});

describe("workspace form submission", () => {
  it("creates and renames a workspace with Enter", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Create workspace" }));
    await user.type(
      screen.getByRole("textbox", { name: "Workspace name" }),
      "Keyboard review{Enter}",
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(
      (screen.getByRole("combobox", { name: "Workspace" }) as HTMLSelectElement)
        .selectedOptions[0].textContent,
    ).toBe("Keyboard review");
    await user.click(screen.getByRole("button", { name: "Manage" }));
    const input = screen.getByRole("textbox", { name: "Workspace name" });
    await user.clear(input);
    await user.type(input, "Renamed with Enter{Enter}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(
      (screen.getByRole("combobox", { name: "Workspace" }) as HTMLSelectElement)
        .selectedOptions[0].textContent,
    ).toBe("Renamed with Enter");
  });
  it("applies name validation when submitting with Enter", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Create workspace" }));
    const input = screen.getByRole("textbox", { name: "Workspace name" });
    await user.type(input, " {Enter}");
    expect(screen.getByRole("alert").textContent).toContain(
      "Enter a workspace name",
    );
    await user.clear(input);
    await user.type(input, "Default Workspace{Enter}");
    expect(screen.getByRole("alert").textContent).toContain("already exists");
    expect(screen.getByRole("dialog", { name: "workspace" })).toBeTruthy();
  });
});
