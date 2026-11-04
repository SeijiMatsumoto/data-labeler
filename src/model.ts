export type Field = {
  id: string;
  label: string;
  type: "binary" | "likert" | "text" | "single-select" | "multi-select";
  required?: boolean;
  description?: string;
  min?: number;
  max?: number;
  anchors?: Record<string, string>;
  options?: string[];
};
export type Block = {
  label: string;
  type: "text" | "markdown" | "json" | "code" | "chat";
  value: unknown;
};
export type Item = {
  id: string;
  blocks: Block[];
  metadata?: Record<string, unknown>;
};
export type Annotation = {
  values: Record<string, unknown>;
  skipped?: boolean;
  updatedAt?: string;
};
export type Dataset = {
  schemaVersion: "1.0";
  id: string;
  name: string;
  instructions?: string;
  rubric: Field[];
  items: Item[];
  annotations?: Record<string, Annotation>;
};
export type WorkspaceGroup = { id: string; name: string };
export type Workspace = {
  workspaces: WorkspaceGroup[];
  activeWorkspaceId: string;
  datasetWorkspaces: Record<string, string>;
  datasets: Dataset[];
  activeId: string;
  positions: Record<string, number>;
};
const object = (x: unknown): x is Record<string, any> =>
  !!x && typeof x === "object" && !Array.isArray(x);
export function validate(input: unknown): Dataset {
  if (!object(input)) throw Error("Dataset must be a JSON object.");
  const fail = (path: string, msg: string): never => {
    throw Error(`${path}: ${msg}`);
  };
  if (input.schemaVersion !== "1.0") fail("schemaVersion", 'must be "1.0".');
  for (const key of ["id", "name"])
    if (typeof input[key] !== "string" || !input[key].trim())
      fail(key, "must be a nonempty string.");
  if (
    input.instructions !== undefined &&
    typeof input.instructions !== "string"
  )
    fail("instructions", "must be text.");
  if (!Array.isArray(input.rubric) || !input.rubric.length)
    fail("rubric", "provide at least one scoring field.");
  const safeId = (id: string) =>
    !["__proto__", "constructor", "prototype"].includes(id);
  if (!safeId(input.id)) fail("id", "reserved ID.");
  const fields = new Set<string>();
  input.rubric.forEach((f: any, i: number) => {
    const p = `rubric[${i}]`;
    if (!object(f)) fail(p, "must be an object.");
    for (const k of ["id", "label"])
      if (typeof f[k] !== "string" || !f[k].trim())
        fail(`${p}.${k}`, "must be nonempty text.");
    if (!safeId(f.id)) fail(`${p}.id`, "reserved ID.");
    if (f.description !== undefined && typeof f.description !== "string")
      fail(`${p}.description`, "must be text.");
    if (
      f.anchors !== undefined &&
      (!object(f.anchors) ||
        Object.values(f.anchors).some((v) => typeof v !== "string"))
    )
      fail(`${p}.anchors`, "must map scale values to text.");
    if (fields.has(f.id)) fail(`${p}.id`, "duplicate field ID.");
    fields.add(f.id);
    if (
      !["binary", "likert", "text", "single-select", "multi-select"].includes(
        f.type,
      )
    )
      fail(`${p}.type`, "unsupported field type.");
    if (f.required !== undefined && typeof f.required !== "boolean")
      fail(`${p}.required`, "must be boolean.");
    if (
      f.type === "likert" &&
      (!Number.isInteger(f.min) ||
        !Number.isInteger(f.max) ||
        f.min >= f.max ||
        f.max - f.min > 10)
    )
      fail(p, "Likert needs integer min < max, with at most 11 values.");
    if (
      f.type.includes("select") &&
      (!Array.isArray(f.options) ||
        !f.options.length ||
        f.options.some((o: unknown) => typeof o !== "string" || !o.trim()) ||
        new Set(f.options).size !== f.options.length)
    )
      fail(`${p}.options`, "provide unique, nonempty text options.");
  });
  if (!Array.isArray(input.items) || !input.items.length)
    fail("items", "provide at least one item.");
  const ids = new Set<string>();
  input.items.forEach((item: any, i: number) => {
    const p = `items[${i}]`;
    if (!object(item) || typeof item.id !== "string" || !item.id.trim())
      fail(`${p}.id`, "must be nonempty text.");
    if (!safeId(item.id)) fail(`${p}.id`, "reserved ID.");
    if (item.metadata !== undefined && !object(item.metadata))
      fail(`${p}.metadata`, "must be an object.");
    if (ids.has(item.id)) fail(`${p}.id`, "duplicate item ID.");
    ids.add(item.id);
    if (!Array.isArray(item.blocks) || !item.blocks.length)
      fail(`${p}.blocks`, "provide at least one content block.");
    item.blocks.forEach((b: any, j: number) => {
      const q = `${p}.blocks[${j}]`;
      if (
        !object(b) ||
        typeof b.label !== "string" ||
        !["text", "markdown", "json", "code", "chat"].includes(b.type) ||
        !("value" in b)
      )
        fail(q, "needs label, supported type, and value.");
      if (
        ["text", "markdown", "code"].includes(b.type) &&
        typeof b.value !== "string"
      )
        fail(`${q}.value`, "must be text.");
      if (
        b.type === "chat" &&
        (!Array.isArray(b.value) ||
          b.value.some(
            (m: any) =>
              !object(m) ||
              typeof m.role !== "string" ||
              typeof m.content !== "string",
          ))
      )
        fail(`${q}.value`, "must be an array of {role, content} messages.");
    });
  });
  if (input.annotations !== undefined) {
    if (!object(input.annotations))
      fail("annotations", "must be an object keyed by item ID.");
    Object.entries(input.annotations).forEach(([id, a]: [string, any]) => {
      if (!ids.has(id) || !object(a) || !object(a.values))
        fail(`annotations.${id}`, "needs a known item ID and values object.");
      if (a.skipped !== undefined && typeof a.skipped !== "boolean")
        fail(`annotations.${id}.skipped`, "must be boolean.");
      Object.entries(a.values).forEach(([key, value]) => {
        const f = input.rubric.find((r: Field) => r.id === key);
        if (!f) fail(`annotations.${id}.${key}`, "unknown rubric field.");
        if (
          value !== null &&
          !(f.type === "text" && typeof value === "string") &&
          !(
            f.type === "multi-select" &&
            Array.isArray(value) &&
            value.length === 0
          ) &&
          !validValue(f, value)
        )
          fail(`annotations.${id}.${key}`, "invalid value for this field.");
      });
    });
  }
  return input as Dataset;
}
export function validValue(f: Field, v: unknown): boolean {
  switch (f.type) {
    case "binary":
      return typeof v === "boolean";
    case "text":
      return typeof v === "string" && v.trim().length > 0;
    case "likert":
      return (
        typeof v === "number" &&
        Number.isInteger(v) &&
        v >= f.min! &&
        v <= f.max!
      );
    case "single-select":
      return typeof v === "string" && !!f.options?.includes(v);
    case "multi-select":
      return (
        Array.isArray(v) &&
        v.length > 0 &&
        new Set(v).size === v.length &&
        v.every((x) => f.options?.includes(x))
      );
  }
}
export function status(d: Dataset, id: string) {
  const a = d.annotations?.[id];
  if (a?.skipped) return "skipped";
  const answered = d.rubric.filter((f) => validValue(f, a?.values[f.id]));
  if (!answered.length) return "unlabeled";
  return d.rubric
    .filter((f) => f.required)
    .every((f) => validValue(f, a?.values[f.id]))
    ? "completed"
    : "in progress";
}
export function csv(d: Dataset, completedOnly = false) {
  const rows = [
    ["item_id", "status", ...d.rubric.map((f) => f.id)],
    ...d.items
      .filter((i) => !completedOnly || status(d, i.id) === "completed")
      .map((i) => [
        i.id,
        status(d, i.id),
        ...d.rubric.map((f) => {
          const v = d.annotations?.[i.id]?.values[f.id];
          return v == null
            ? ""
            : Array.isArray(v)
              ? JSON.stringify(v)
              : String(v);
        }),
      ]),
  ];
  return rows
    .map((r) => r.map((v) => '"' + v.replaceAll('"', '""') + '"').join(","))
    .join("\r\n");
}
export const sample: Dataset = {
  schemaVersion: "1.0",
  id: "demo-answer-quality",
  name: "Answer quality · sample",
  instructions:
    "Read the prompt and response. Score correctness and helpfulness independently. Use the reference when provided.",
  rubric: [
    {
      id: "correct",
      label: "Factually correct",
      type: "binary",
      required: true,
      description: "Does the response give an accurate answer?",
    },
    {
      id: "helpfulness",
      label: "Helpfulness",
      type: "likert",
      min: 1,
      max: 5,
      anchors: {
        "1": "Not useful",
        "3": "Partially useful",
        "5": "Fully useful",
      },
      required: true,
    },
    { id: "comment", label: "Reviewer notes", type: "text", required: false },
  ],
  items: [
    {
      id: "answer-001",
      blocks: [
        {
          label: "Prompt",
          type: "text",
          value: "Why does bread rise when you add yeast?",
        },
        {
          label: "Response",
          type: "markdown",
          value:
            "Yeast consumes sugars in the dough and produces **carbon dioxide** through fermentation. The dough’s gluten network traps that gas, creating bubbles that make the dough expand.\n\nDuring baking, heat expands the gas and sets the structure, giving bread its airy texture.",
        },
      ],
      metadata: { category: "science", difficulty: "easy" },
    },
    {
      id: "answer-002",
      blocks: [
        {
          label: "Prompt",
          type: "text",
          value: "Return the three primary colors of light as JSON.",
        },
        {
          label: "Response",
          type: "json",
          value: { colors: ["red", "yellow", "blue"] },
        },
        {
          label: "Reference",
          type: "text",
          value:
            "The additive primary colors of light are red, green, and blue.",
        },
      ],
    },
    {
      id: "answer-003",
      blocks: [
        {
          label: "Conversation",
          type: "chat",
          value: [
            {
              role: "user",
              content:
                "How do I reverse a list in Python without changing the original?",
            },
            {
              role: "assistant",
              content: "Use items.reverse(). This returns a reversed copy.",
            },
          ],
        },
        {
          label: "Reference",
          type: "code",
          value:
            "reversed_items = items[::-1]\n# list.reverse() mutates the list and returns None.",
        },
      ],
    },
  ],
};
export const generatorPrompt = `Generate a JSON dataset for Labeldesk, a local AI evaluation labeling app. Inspect this project's actual data and choose useful examples for human review. Ask me what to evaluate if the goal is unclear. Never invent source data or human labels. Do not include existing model scores in visible blocks unless I explicitly request them. Write a valid UTF-8 .json file and tell me its path.\n\nRequired format:\n${JSON.stringify({ ...sample, id: "REPLACE_WITH_STABLE_DATASET_ID", name: "REPLACE_WITH_DATASET_NAME", items: [sample.items[0]] }, null, 2)}\n\nSchema rules:\n- schemaVersion is exactly "1.0". Dataset id and name are nonempty strings. instructions is optional text.\n- rubric is a nonempty array of fields with unique stable id, label, type, optional description, and required boolean.\n- Field types: binary (boolean answers); likert (integer min and max, min < max, at most 11 values, optional anchors mapping numbers to labels); text; single-select and multi-select (unique nonempty string options array). Use meaningful rubric descriptions and explicit scale anchors. Include an optional text comment field.\n- items is a nonempty array with unique stable string id and nonempty blocks array. Each block has label, type, value.\n- Block types: text, markdown, code (string value); json (any JSON value); chat (array of {"role":"user|assistant|system or other role","content":"string"}). Use multiple blocks for inputs, outputs, reference answers, or evidence. Preserve source text faithfully. Do not wrap arbitrary text in HTML.\n- Optional item metadata holds provenance and other context; it is collapsed in the UI. This app is text-based: do not embed large binary/base64 assets. Dataset must fit browser localStorage (typically a few MB).\n- Omit annotations for a fresh dataset. Never prefill human judgments.\n- Output JSON only in the file: no comments, fences, trailing commas, NaN, or undefined. Validate IDs, field types, and JSON before finishing.\n- If rubric choice is unclear, propose a small set of concrete dimensions suited to the evaluation. Prefer binary where the decision is binary; use Likert only with meaningful anchors.`;
