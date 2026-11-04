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
