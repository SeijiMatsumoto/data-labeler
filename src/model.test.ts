import { describe, it, expect } from "vitest";
import { validate, sample, status, csv, validValue } from "./model";
describe("dataset contract", () => {
  it("accepts the example and preserves false and zero", () => {
    const d = structuredClone(sample);
    d.rubric[1].min = 0;
    d.annotations = {
      "answer-001": {
        values: { correct: false, helpfulness: 0, comment: null },
      },
    };
    expect(validate(JSON.parse(JSON.stringify(d)))).toEqual(d);
    expect(status(d, "answer-001")).toBe("completed");
    expect(csv(d)).toContain('"false","0"');
  });
  it("rejects duplicate IDs and invalid annotations with useful paths", () => {
    const d = structuredClone(sample);
    d.items[1].id = d.items[0].id;
    expect(() => validate(d)).toThrow("items[1].id");
    const other = structuredClone(sample);
    other.annotations = { "answer-001": { values: { correct: "yes" } } };
    expect(() => validate(other)).toThrow("annotations.answer-001.correct");
  });
  it("distinguishes partial, completed, skipped, and unfilled answers", () => {
    const d = structuredClone(sample);
    expect(status(d, "answer-001")).toBe("unlabeled");
    d.annotations = { "answer-001": { values: { correct: false } } };
    expect(status(d, "answer-001")).toBe("in progress");
    d.annotations["answer-001"].values.helpfulness = 3;
    expect(status(d, "answer-001")).toBe("completed");
    d.annotations["answer-001"].skipped = true;
    expect(status(d, "answer-001")).toBe("skipped");
    expect(validValue({ id: "x", label: "x", type: "text" }, " ")).toBe(false);
  });
  it("escapes CSV and exports only completed rows when requested", () => {
    const d = structuredClone(sample);
    d.annotations = {
      "answer-001": {
        values: { correct: false, helpfulness: 2, comment: 'a,"quote"\nnext' },
      },
    };
    const output = csv(d, true);
    expect(output).toContain('"a,""quote""\nnext"');
    expect(output).not.toContain("answer-002");
  });
  it("validates chat blocks and select fields", () => {
    const d = structuredClone(sample);
    (d.items[2].blocks[0].value as any[])[0].content = 3;
    expect(() => validate(d)).toThrow("items[2].blocks[0].value");
  });
});
