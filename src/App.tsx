import React, { useState, useEffect, useRef } from "react";
import {
  BrowserRouter,
  Link,
  useLocation,
  useNavigate,
  useMatch,
} from "react-router-dom";
import ReactMarkdown from "react-markdown";
import {
  Upload,
  Download,
  Copy,
  Check,
  ChevronLeft,
  ChevronRight,
  Search,
  Plus,
  SlidersHorizontal,
  X,
  Database,
  ArrowRight,
  SkipForward,
  Trash2,
  BookOpen,
} from "lucide-react";
import {
  validate,
  status,
  csv,
  sample,
  generatorPrompt,
  validValue,
  type Dataset,
  type Workspace,
  type Field,
  type Block,
} from "./model";
import {
  emptyWorkspace,
  normalizeWorkspace,
  mergeBackup,
  deleteDataset,
  deleteWorkspace,
} from "./workspaces";
import "./style.css";
const KEY = "labeldesk.workspace.v1";
function read(): { workspace: Workspace; error: string } {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const w = JSON.parse(raw);
      if (!Array.isArray(w.datasets) || !w.positions)
        throw Error("Invalid workspace");
      w.datasets.forEach(validate);
      return { workspace: normalizeWorkspace(w), error: "" };
    }
  } catch {
    return {
      workspace: emptyWorkspace(),
      error:
        "Saved workspace could not be read. Import a backup to restore it; storage will not be replaced until you make a change.",
    };
  }
  return {
    workspace: emptyWorkspace(),
    error: "",
  };
}
function download(name: string, data: string, type = "application/json") {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function Content({ block: b }: { block: Block }) {
  return (
    <section className="content-block">
      <div className="block-label">
        {b.label}
        <span>{b.type}</span>
      </div>
      {b.type === "markdown" ? (
        <div className="prose">
          <ReactMarkdown
            components={{
              img: ({ alt }) => (
                <span className="muted">[Image: {alt || "omitted"}]</span>
              ),
              a: ({ href, children }) => (
                <a href={href} target="_blank" rel="noreferrer">
                  {children}
                </a>
              ),
            }}
          >
            {String(b.value)}
          </ReactMarkdown>
        </div>
      ) : b.type === "chat" ? (
        <div className="chat">
          {(b.value as { role: string; content: string }[]).map((m, i) => (
            <div key={i}>
              <small>{m.role}</small>
              <p>{m.content}</p>
            </div>
          ))}
        </div>
      ) : b.type === "json" || b.type === "code" ? (
        <pre>
          {b.type === "json"
            ? JSON.stringify(b.value, null, 2)
            : String(b.value)}
        </pre>
      ) : (
        <p className="plain">{String(b.value)}</p>
      )}
    </section>
  );
}
export default function App() {
  return (
    <BrowserRouter>
      <WorkspaceApp />
    </BrowserRouter>
  );
}
function WorkspaceApp() {
  const location = useLocation();
  const navigate = useNavigate();
  const exampleRoute = useMatch("/datasets/:datasetId/examples/:itemId");
  const workspaceRoute = useMatch("/workspaces/:workspaceId");
  const datasetRoute = useMatch("/datasets/:datasetId");
  const route: { params: { datasetId?: string; itemId?: string } } | null =
    exampleRoute || datasetRoute;
  const datasetPath = (dataset: Dataset, position = 0) =>
    `/datasets/${encodeURIComponent(dataset.id)}/examples/${encodeURIComponent(dataset.items[Math.max(0, Math.min(position, dataset.items.length - 1))].id)}`;

  const [initial] = useState(read);
  const [w, setW] = useState<Workspace>(initial.workspace),
    [error, setError] = useState(initial.error),
    [saved, setSaved] = useState(true),
    [notice, setNotice] = useState(""),
    [filter, setFilter] = useState("all"),
    [search, setSearch] = useState(""),
    [importText, setImportText] = useState(""),
    [importError, setImportError] = useState(""),
    [dragging, setDragging] = useState(false),
    [pending, setPending] = useState<Dataset | null>(null),
    [rubric, setRubric] = useState<Field[]>([]),
    [instructions, setInstructions] = useState(""),
    [completedOnly, setCompletedOnly] = useState(false),
    [focusedField, setFocusedField] = useState(0),
    [advanced, setAdvanced] = useState(false),
    [rubricJson, setRubricJson] = useState(""),
    [rubricError, setRubricError] = useState(""),
    [sideBySide, setSideBySide] = useState(false),
    [workspaceName, setWorkspaceName] = useState(""),
    [workspaceError, setWorkspaceError] = useState(""),
    [moveTarget, setMoveTarget] = useState(""),
    [importWorkspaceId, setImportWorkspaceId] = useState(
      initial.workspace.activeWorkspaceId,
    );
  const panel = new URLSearchParams(location.search).get("panel");
  const workspaceMode =
    new URLSearchParams(location.search).get("action") === "create"
      ? "create"
      : "rename";
  const modal = [
    "import",
    "export",
    "rubric",
    "prompt",
    "workspace",
    "delete-dataset",
  ].includes(panel || "")
    ? (panel as
        | "import"
        | "export"
        | "rubric"
        | "prompt"
        | "workspace"
        | "delete-dataset")
    : null;
  const setModal = (
    value:
      | "import"
      | "export"
      | "rubric"
      | "prompt"
      | "workspace"
      | "delete-dataset"
      | null,
  ) => {
    const params = new URLSearchParams(location.search);
    if (value !== "delete-dataset") params.delete("dataset");
    if (value !== "workspace") params.delete("action");
    if (value) params.set("panel", value);
    else params.delete("panel");
    const search = params.toString();
    if (search !== location.search.slice(1))
      navigate({
        pathname: location.pathname,
        search: search ? `?${search}` : "",
      });
  };
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!modal) return;
    const previous = document.activeElement as HTMLElement;
    const trap = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setModal(null);
        setPending(null);
        setBackup(null);
        return;
      }
      if (e.key !== "Tab") return;
      const elements = Array.from(
        dialog.current?.querySelectorAll<HTMLElement>(
          "button:not(:disabled),input,textarea,select,a[href],summary",
        ) || [],
      ).filter((el) => el.getClientRects().length > 0);
      const first = elements[0],
        last = elements.at(-1);
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", trap);
    return () => {
      document.removeEventListener("keydown", trap);
      previous?.focus();
    };
  }, [modal]);
  const dirty = useRef(false),
    file = useRef<HTMLInputElement>(null),
    reader = useRef<HTMLDivElement>(null);
  const d = w.datasets.find((x) => x.id === route?.params.datasetId),
    index = d
      ? Math.max(
          0,
          Math.min(
            route?.params.itemId
              ? Math.max(
                  0,
                  d.items.findIndex((item) => item.id === route.params.itemId),
                )
              : Number.isInteger(w.positions[d.id])
                ? w.positions[d.id]
                : 0,
            d.items.length - 1,
          ),
        )
      : 0,
    item = d?.items[index],
    a = item ? d?.annotations?.[item.id] : undefined;
  const activeWorkspaceId = d
    ? w.datasetWorkspaces[d.id]
    : workspaceRoute?.params.workspaceId || w.activeWorkspaceId;
  const activeWorkspace =
    w.workspaces.find((g) => g.id === activeWorkspaceId) || w.workspaces[0];
  const workspaceDatasets = w.datasets.filter(
    (dataset) => w.datasetWorkspaces[dataset.id] === activeWorkspace.id,
  );
  const workspacePath = (id: string) => `/workspaces/${encodeURIComponent(id)}`;
  const deletingDataset = w.datasets.find(
    (dataset) =>
      dataset.id === new URLSearchParams(location.search).get("dataset"),
  );
  const requestDeleteDataset = (id: string) => {
    const params = new URLSearchParams(location.search);
    params.set("panel", "delete-dataset");
    params.set("dataset", id);
    navigate({ pathname: location.pathname, search: `?${params}` });
  };
  const openWorkspace = (mode: "create" | "rename") => {
    setWorkspaceName(mode === "rename" ? activeWorkspace.name : "");
    setWorkspaceError("");
    setMoveTarget(
      w.workspaces.find((g) => g.id !== activeWorkspace.id)?.id || "",
    );
    const params = new URLSearchParams(location.search);
    params.set("panel", "workspace");
    params.set("action", mode);
    params.delete("dataset");
    navigate({ pathname: location.pathname, search: `?${params}` });
  };
  useEffect(() => {
    if (modal !== "workspace") return;
    setWorkspaceName(workspaceMode === "rename" ? activeWorkspace.name : "");
    setWorkspaceError("");
    setMoveTarget(
      w.workspaces.find((g) => g.id !== activeWorkspace.id)?.id || "",
    );
  }, [modal, workspaceMode, activeWorkspace.id, activeWorkspace.name]);
  useEffect(() => {
    if (w.activeWorkspaceId === activeWorkspace.id) return;
    dirty.current = true;
    setW((old) => ({ ...old, activeWorkspaceId: activeWorkspace.id }));
  }, [activeWorkspace.id, w.activeWorkspaceId]);
  const notFound =
    location.pathname !== "/" &&
    ((workspaceRoute
      ? !w.workspaces.some((g) => g.id === workspaceRoute.params.workspaceId)
      : !route || !d) ||
      (route?.params.itemId &&
        d &&
        !d.items.some((item) => item.id === route.params.itemId)));
  useEffect(() => {
    setPending(null);
    setSearch("");
    setFilter("all");
    setFocusedField(0);
    reader.current?.scrollTo({ top: 0 });
  }, [location.pathname]);
  useEffect(() => {
    if (modal === "rubric" && d) {
      setRubric(structuredClone(d.rubric));
      setInstructions(d.instructions || "");
      setAdvanced(false);
      setRubricError("");
    }
  }, [modal, d?.id]);
  useEffect(() => {
    if (!d || notFound) return;
    dirty.current = true;
    setW((old) =>
      old.activeId === d.id && old.positions[d.id] === index
        ? old
        : {
            ...old,
            activeId: d.id,
            positions: { ...old.positions, [d.id]: index },
          },
    );
  }, [d?.id, index, notFound]);
  const change = (fn: (old: Workspace) => Workspace) => {
    dirty.current = true;
    setSaved(false);
    setW(fn);
  };
  useEffect(() => {
    if (!dirty.current) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(w));
      setSaved(true);
      setError("");
    } catch {
      setSaved(false);
      setError(
        "Browser storage is full or unavailable. Your changes remain in this tab. Export a workspace backup now.",
      );
    }
  }, [w]);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 3000);
    return () => clearTimeout(t);
  }, [notice]);
  const updateDataset = (fn: (data: Dataset) => Dataset) =>
    change((old) => ({
      ...old,
      datasets: old.datasets.map((x) => (x.id === d?.id ? fn(x) : x)),
    }));
  const move = (n: number) => {
    if (!d) return;
    change((old) => ({
      ...old,
      positions: {
        ...old.positions,
        [d.id]: Math.max(0, Math.min(n, d.items.length - 1)),
      },
    }));
    navigate(datasetPath(d, n));
    setFocusedField(0);
    reader.current?.scrollTo({ top: 0 });
  };
  const answer = (f: Field, value: unknown) => {
    if (!item) return;
    if (Array.isArray(value) && value.length === 0) value = null;
    updateDataset((data) => ({
      ...data,
      annotations: {
        ...data.annotations,
        [item.id]: {
          values: { ...a?.values, [f.id]: value },
          updatedAt: new Date().toISOString(),
          skipped: false,
        },
      },
    }));
  };
  const needsLabels = (id: string) =>
    !!d && ["unlabeled", "in progress"].includes(status(d, id));
  const hasOtherUnlabeled = !!d?.items.some(
    (i) => i.id !== item?.id && needsLabels(i.id),
  );
  const currentIncomplete = !!item && needsLabels(item.id);
  const nextUnlabeled = () => {
    if (!d) return;
    const next = [...d.items.slice(index + 1), ...d.items.slice(0, index)].find(
      (i) => needsLabels(i.id),
    );
    if (next) move(d.items.indexOf(next));
    else if (currentIncomplete)
      setNotice("Complete this example or skip it before exporting.");
    else setModal("export");
  };
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (
        modal ||
        e.metaKey ||
        e.ctrlKey ||
        e.altKey ||
        (e.target as HTMLElement).closest(
          "input,textarea,select,[contenteditable]",
        )
      )
        return;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        move(index + 1);
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        move(index - 1);
      }
      if (e.key.toLowerCase() === "n") nextUnlabeled();
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setFocusedField((x) => Math.min((d?.rubric.length || 1) - 1, x + 1));
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocusedField((x) => Math.max(0, x - 1));
      }
      const f = d?.rubric[focusedField];
      if (!f) return;
      if (/^[1-9]$/.test(e.key)) {
        const num = Number(e.key);
        if (f.type === "binary" && num <= 2) answer(f, num === 1);
        if (f.type === "likert") {
          const v = f.min! + num - 1;
          if (v <= f.max!) answer(f, v);
        }
        if (f.type === "single-select" && f.options?.[num - 1])
          answer(f, f.options[num - 1]);
      }
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  });
  const add = (data: Dataset, copy = false) => {
    if (!copy) {
      const existing = w.datasets.find((x) => x.id === data.id);
      if (existing) {
        const target =
          modal === "import" ? importWorkspaceId : activeWorkspace.id;
        if (w.datasetWorkspaces[existing.id] === target) {
          navigate(datasetPath(existing, w.positions[existing.id] || 0));
          return;
        }
        copy = true;
      }
    }
    let result = structuredClone(data);
    if (copy) {
      result.id = `${data.id}-copy-${Date.now()}`;
      result.name += " (copy)";
    }
    change((old) => ({
      ...old,
      datasets: [...old.datasets, result],
      activeId: result.id,
      positions: { ...old.positions, [result.id]: 0 },
      datasetWorkspaces: {
        ...old.datasetWorkspaces,
        [result.id]:
          modal === "import" ? importWorkspaceId : activeWorkspace.id,
      },
    }));
    setPending(null);
    setModal(null);
    setSearch("");
    setFilter("all");
    navigate(datasetPath(result));
  };
  const openImport = () => {
    setImportWorkspaceId(activeWorkspace.id);
    setPending(null);
    setBackup(null);
    setBackupData(null);
    setImportError("");
    setImportText("");
    setModal("import");
  };
  const loadText = (text: string) => {
    setPending(null);
    setBackup(null);
    setBackupData(null);
    setImportError("");
    setImportText(text);
    if (modal !== "import") setImportWorkspaceId(activeWorkspace.id);
    setModal("import");
    try {
      const parsed = JSON.parse(text);
      if (parsed && parsed.format === "labeldesk-workspace/1") {
        const normalized = normalizeWorkspace(parsed);
        setBackup(normalized.datasets);
        setBackupData(parsed);
      } else setPending(validate(parsed));
    } catch (e) {
      setImportError(e instanceof Error ? e.message : "Unable to read JSON.");
    }
  };
  const load = async (f: File) => {
    try {
      loadText(await f.text());
    } catch (e) {
      setModal("import");
      setImportError(e instanceof Error ? e.message : "Unable to read file.");
    }
  };
  const dragDepth = useRef(0);
  const [backup, setBackup] = useState<Dataset[] | null>(null);
  const [backupData, setBackupData] = useState<any>(null);
  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(generatorPrompt);
      setNotice("Dataset prompt copied. Paste it into your project agent.");
    } catch {
      setModal("prompt");
    }
  };
  const storageBytes = JSON.stringify(w).length * 2;
  const total = d?.items.length || 0,
    done = d?.items.filter((i) => status(d, i.id) === "completed").length || 0;
  return (
    <div
      className="app"
      onDragEnter={(e) => {
        if (Array.from(e.dataTransfer.types || []).includes("Files")) {
          e.preventDefault();
          dragDepth.current++;
          setDragging(true);
        }
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (!dragDepth.current) setDragging(false);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }}
      onDrop={(e) => {
        e.preventDefault();
        dragDepth.current = 0;
        setDragging(false);
        const f = e.dataTransfer.files[0];
        if (f) void load(f);
      }}
    >
      <input
        ref={file}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void load(f);
          e.target.value = "";
        }}
      />
      <aside className="sidebar" inert={!!modal}>
        <Link className="brand" to={workspacePath(activeWorkspace.id)}>
          <span className="brand-icon">
            <Database size={19} />
          </span>
          labeldesk<span className="local-badge">LOCAL</span>
        </Link>
        <label className="workspace-picker">
          Workspace
          <select
            aria-label="Workspace"
            value={activeWorkspace.id}
            onChange={(e) => {
              change((old) => ({ ...old, activeWorkspaceId: e.target.value }));
              navigate(workspacePath(e.target.value));
            }}
          >
            {w.workspaces.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </select>
        </label>
        <div className="workspace-tools">
          <button onClick={() => openWorkspace("create")}>
            <Plus size={13} />
            Create workspace
          </button>
          <button onClick={() => openWorkspace("rename")}>Manage</button>
        </div>
        <div className="workspace-title">
          DATASETS{" "}
          <button
            className="icon"
            aria-label="Import dataset"
            onClick={openImport}
          >
            <Plus size={17} />
          </button>
        </div>
        {!workspaceDatasets.length && (
          <p className="workspace-empty">No datasets in this workspace yet.</p>
        )}
        <div className="dataset-list">
          {workspaceDatasets.map((x) => (
            <div className="dataset-entry" key={x.id}>
              <Link
                key={x.id}
                className={`dataset ${x.id === d?.id ? "active" : ""}`}
                to={datasetPath(x, w.positions[x.id] || 0)}
              >
                <Database size={16} />
                <span>
                  {x.name}
                  <small>{x.items.length} examples</small>
                </span>
              </Link>
              <button
                className="dataset-delete icon"
                aria-label={`Delete dataset ${x.name}`}
                onClick={() => requestDeleteDataset(x.id)}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
        <button className="import-side" onClick={openImport}>
          <Upload size={16} /> Import dataset
        </button>
        {d && (
          <>
            <div className="sidebar-divider" />
            <div className="workspace-title">
              EXAMPLES <span>{total}</span>
            </div>
            <label className="search">
              <Search size={15} />
              <input
                aria-label="Search examples"
                placeholder="Search ID or content…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <select
              aria-label="Filter examples"
              className="filter"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              <option value="all">All examples</option>
              {["unlabeled", "in progress", "completed", "skipped"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
            <div className="items">
              {d.items
                .map((i, n) => ({ i, n }))
                .filter(
                  ({ i }) =>
                    (filter === "all" || status(d, i.id) === filter) &&
                    JSON.stringify(i)
                      .toLowerCase()
                      .includes(search.toLowerCase()),
                )
                .map(({ i, n }) => (
                  <Link
                    key={i.id}
                    className={`item-row ${index === n ? "selected" : ""}`}
                    to={datasetPath(d, n)}
                  >
                    <span
                      className={`dot ${status(d, i.id).replace(" ", "-")}`}
                    >
                      {status(d, i.id) === "completed" && <Check size={10} />}
                    </span>
                    <span>{i.id}</span>
                    <small>{String(n + 1).padStart(2, "0")}</small>
                  </Link>
                ))}
            </div>
          </>
        )}
        <div className="sidebar-bottom">
          <button onClick={copyPrompt}>
            <Copy size={15} /> Copy dataset prompt
          </button>
          <button
            onClick={() =>
              download(
                "labeldesk-backup.json",
                JSON.stringify(
                  {
                    format: "labeldesk-workspace/1",
                    datasets: w.datasets,
                    positions: w.positions,
                    workspaces: w.workspaces,
                    datasetWorkspaces: w.datasetWorkspaces,
                    activeWorkspaceId: w.activeWorkspaceId,
                  },
                  null,
                  2,
                ),
              )
            }
          >
            <Download size={15} /> Back up workspace
          </button>
          <div className="privacy">
            <span className="green-dot" /> On this device only{" "}
            <span>{(storageBytes / 1024).toFixed(0)} KB</span>
          </div>
        </div>
      </aside>
      <main inert={!!modal}>
        <header>
          <div className="breadcrumb">
            <Link to={workspacePath(activeWorkspace.id)}>
              {activeWorkspace.name}
            </Link>{" "}
            <span>/</span>
            <strong>{d?.name || "Get started"}</strong>
          </div>
          <div className="header-actions">
            <span className={`save-state ${!saved ? "warning" : ""}`}>
              {saved ? <Check size={13} /> : null}
              {saved ? "Saved locally" : "Not saved"}
            </span>
            {d && (
              <>
                <button
                  className="button"
                  onClick={() => {
                    setAdvanced(false);
                    setRubricError("");
                    setRubric(structuredClone(d.rubric));
                    setInstructions(d.instructions || "");
                    setModal("rubric");
                  }}
                >
                  <SlidersHorizontal size={15} /> Rubric
                </button>
                <button
                  className="button dark"
                  onClick={() => setModal("export")}
                >
                  <Download size={15} /> Export
                </button>
              </>
            )}
          </div>
        </header>
        <div className="main-body">
          {storageBytes > 4 * 1024 * 1024 && !error && (
            <div className="error" role="status">
              Workspace is approaching typical browser storage limits. Download
              a backup before importing more data.
            </div>
          )}
          {error && (
            <div className="error" role="alert">
              {error}
              <button
                className="icon"
                aria-label="Dismiss error"
                onClick={() => setError("")}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {!d || notFound ? (
            <div className="welcome">
              {notFound && (
                <p role="alert">
                  This dataset or example is not available in this browser.{" "}
                  <Link to="/">Return to workspace</Link> or import its JSON
                  file.
                </p>
              )}
              <div className="eyebrow">LESS FRICTION. BETTER GROUND TRUTH.</div>
              <h1>
                A little focus.
                <br />A better dataset.
              </h1>
              <p>
                Give your examples the attention they deserve.
                <br />
                Import a dataset, make your judgments, and keep moving.
              </p>
              <div className="welcome-actions">
                <button className="button dark" onClick={openImport}>
                  <Upload size={17} /> Import JSON dataset
                </button>
                <button className="button" onClick={() => add(sample)}>
                  Try sample dataset <ArrowRight size={16} />
                </button>
              </div>
              <div className="welcome-cards">
                <article>
                  <span>01</span>
                  <h3>Bring your examples</h3>
                  <p>
                    Prompts, conversations, structured outputs, and references
                    in one simple format.
                  </p>
                </article>
                <article>
                  <span>02</span>
                  <h3>Label your way</h3>
                  <p>
                    Binary decisions, anchored scales, choices, and notes
                    tailored to your evaluation.
                  </p>
                </article>
                <article>
                  <span>03</span>
                  <h3>Take it with you</h3>
                  <p>
                    Autosaved in your browser. Export JSON or CSV whenever
                    you’re ready.
                  </p>
                </article>
              </div>
              <div className="prompt-callout">
                <BookOpen size={22} />
                <div>
                  <strong>Let your coding agent prepare the data.</strong>
                  <p>
                    Copy a ready-to-use prompt with the dataset format and
                    generation rules.
                  </p>
                </div>
                <button className="button" onClick={copyPrompt}>
                  <Copy size={15} /> Copy dataset prompt
                </button>
              </div>
              <button
                className="text-button"
                onClick={() =>
                  download(
                    "labeldesk-example.json",
                    JSON.stringify(sample, null, 2),
                  )
                }
              >
                Download example JSON
              </button>
            </div>
          ) : (
            <>
              <div className="dataset-heading">
                <div>
                  <div className="eyebrow">LABELING SESSION</div>
                  <h1>{d.name}</h1>
                </div>
                <div className="progress-summary">
                  <span>
                    <strong>{done}</strong> / {total} completed
                  </span>
                  <div className="progress-track">
                    <div style={{ width: `${(done / total) * 100}%` }} />
                  </div>
                </div>
              </div>
              <div className="session">
                <div className="reader" ref={reader}>
                  <div className="example-heading">
                    <span className="eyebrow">
                      EXAMPLE {String(index + 1).padStart(2, "0")}{" "}
                      <span className="muted">
                        OF {String(total).padStart(2, "0")}
                      </span>
                    </span>
                    <span
                      className={`status-pill ${status(d, item!.id).replace(" ", "-")}`}
                    >
                      {status(d, item!.id)}
                    </span>
                  </div>
                  <h2>{item!.id}</h2>
                  {item!.blocks.length > 1 && (
                    <button
                      className="comparison-toggle"
                      onClick={() => setSideBySide((x) => !x)}
                    >
                      {sideBySide ? "Stack content" : "Compare side by side"}
                    </button>
                  )}
                  <div className={sideBySide ? "comparison-grid" : ""}>
                    {item!.blocks.map((b, i) => (
                      <Content block={b} key={`${item!.id}-${i}`} />
                    ))}
                  </div>
                  {item!.metadata && (
                    <details className="metadata" key={item!.id}>
                      <summary>Source metadata</summary>
                      <pre>{JSON.stringify(item!.metadata, null, 2)}</pre>
                    </details>
                  )}
                </div>
                <aside className="scoring">
                  <div className="scoring-head">
                    <span className="eyebrow">YOUR EVALUATION</span>
                    <span>
                      {
                        d.rubric.filter((f) => validValue(f, a?.values[f.id]))
                          .length
                      }{" "}
                      / {d.rubric.length}
                    </span>
                  </div>
                  {d.instructions && (
                    <details className="instructions" open>
                      <summary>Labeling instructions</summary>
                      <p>{d.instructions}</p>
                    </details>
                  )}
                  <div className="fields">
                    {d.rubric.map((f, fi) => {
                      const v = a?.values[f.id];
                      return (
                        <section
                          key={f.id}
                          className={`field ${focusedField === fi ? "focused" : ""}`}
                          onClick={() => setFocusedField(fi)}
                        >
                          <div className="field-title">
                            <label htmlFor={`field-${f.id}`}>{f.label}</label>
                            <span>{f.required ? "Required" : "Optional"}</span>
                          </div>
                          {f.description && (
                            <p className="field-description">{f.description}</p>
                          )}
                          {f.type === "text" ? (
                            <textarea
                              id={`field-${f.id}`}
                              placeholder="Add your observations…"
                              value={typeof v === "string" ? v : ""}
                              onChange={(e) =>
                                answer(f, e.target.value || null)
                              }
                            />
                          ) : (
                            <div
                              role="group"
                              aria-label={f.label}
                              className={`choices ${f.type === "likert" ? "scale" : ""}`}
                            >
                              {(f.type === "binary"
                                ? [true, false]
                                : f.type === "likert"
                                  ? Array.from(
                                      {
                                        length: Math.max(
                                          0,
                                          Math.min(11, f.max! - f.min! + 1),
                                        ),
                                      },
                                      (_, i) => f.min! + i,
                                    )
                                  : f.options!
                              ).map((choice, ci) => (
                                <button
                                  key={String(choice)}
                                  aria-pressed={
                                    f.type === "multi-select"
                                      ? Array.isArray(v) && v.includes(choice)
                                      : v === choice
                                  }
                                  className={`choice ${(f.type === "multi-select" ? Array.isArray(v) && v.includes(choice) : v === choice) ? "chosen" : ""}`}
                                  onClick={() =>
                                    answer(
                                      f,
                                      f.type === "multi-select"
                                        ? Array.isArray(v) && v.includes(choice)
                                          ? v.filter((x) => x !== choice)
                                          : [
                                              ...(Array.isArray(v) ? v : []),
                                              choice,
                                            ]
                                        : choice,
                                    )
                                  }
                                >
                                  {f.type === "binary"
                                    ? choice
                                      ? "Yes"
                                      : "No"
                                    : String(choice)}
                                  {f.type === "binary" && (
                                    <kbd aria-hidden="true">{ci + 1}</kbd>
                                  )}
                                </button>
                              ))}
                            </div>
                          )}
                          {f.anchors && (
                            <div className="anchors">
                              {Object.entries(f.anchors).map(([key, label]) => (
                                <span key={key}>
                                  <b>{key}</b> {label}
                                </span>
                              ))}
                            </div>
                          )}
                          {v != null && (
                            <button
                              className="clear"
                              onClick={() => answer(f, null)}
                            >
                              Clear
                            </button>
                          )}
                        </section>
                      );
                    })}
                  </div>
                  <div className="score-footer">
                    <button
                      className="button"
                      onClick={() =>
                        updateDataset((data) => ({
                          ...data,
                          annotations: {
                            ...data.annotations,
                            [item!.id]: {
                              ...a,
                              values: a?.values || {},
                              skipped: !a?.skipped,
                              updatedAt: new Date().toISOString(),
                            },
                          },
                        }))
                      }
                    >
                      <SkipForward size={15} />
                      {a?.skipped ? "Unskip" : "Skip for now"}
                    </button>
                    <button
                      className="button dark"
                      disabled={!hasOtherUnlabeled && currentIncomplete}
                      onClick={nextUnlabeled}
                    >
                      {hasOtherUnlabeled ? (
                        <>
                          Next unlabeled <ArrowRight size={15} />
                        </>
                      ) : currentIncomplete ? (
                        "Complete this example"
                      ) : (
                        <>
                          Export results <Download size={15} />
                        </>
                      )}
                    </button>
                  </div>
                </aside>
              </div>
              <footer>
                <div className="keyboard-hints">
                  <kbd>←</kbd>
                  <kbd>→</kbd> navigate <span>·</span>
                  <kbd>↑</kbd>
                  <kbd>↓</kbd> field <span>·</span>
                  <kbd>1–9</kbd> score <span>·</span>
                  <kbd>N</kbd> next unlabeled
                </div>
                <div className="nav">
                  <button
                    className="button"
                    disabled={index === 0}
                    onClick={() => move(index - 1)}
                  >
                    <ChevronLeft size={16} /> Previous
                  </button>
                  <span>
                    {index + 1} / {total}
                  </span>
                  <button
                    className="button"
                    disabled={index === total - 1}
                    onClick={() => move(index + 1)}
                  >
                    Next <ChevronRight size={16} />
                  </button>
                </div>
              </footer>
            </>
          )}
        </div>
      </main>
      {dragging && (
        <div className="drop-overlay" role="status">
          <Upload size={38} />
          <strong>Drop JSON to import</strong>
          <span>Dataset or workspace backup</span>
        </div>
      )}
      {notice && (
        <div className="toast" role="status">
          <Check size={17} />
          {notice}
        </div>
      )}
      {modal && (
        <div
          className="modal-backdrop"
          onClick={() => {
            setModal(null);
            setPending(null);
            setBackup(null);
          }}
        >
          <div
            ref={dialog}
            className={`modal ${modal === "rubric" ? "wide" : ""}`}
            role="dialog"
            aria-modal="true"
            aria-label={modal}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-title">
              <h2>
                {modal === "workspace"
                  ? workspaceMode === "create"
                    ? "Create workspace"
                    : "Manage workspace"
                  : modal === "delete-dataset"
                    ? "Delete dataset"
                    : modal === "import"
                      ? "Import dataset"
                      : modal === "export"
                        ? "Export your work"
                        : modal === "rubric"
                          ? "Configure rubric"
                          : "Dataset generation prompt"}
              </h2>
              <button
                autoFocus
                className="icon"
                aria-label="Close dialog"
                onClick={() => {
                  setModal(null);
                  setPending(null);
                  setBackup(null);
                }}
              >
                <X size={20} />
              </button>
            </div>
            {modal === "import" && !backupData?.workspaces && (
              <label className="workspace-picker import-workspace">
                Assign dataset to workspace
                <select
                  aria-label="Import workspace"
                  value={importWorkspaceId}
                  onChange={(e) => setImportWorkspaceId(e.target.value)}
                >
                  {w.workspaces.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {modal === "workspace" && (
              <>
                <label className="workspace-name-label">
                  Workspace name
                  <input
                    autoFocus
                    aria-label="Workspace name"
                    value={workspaceName}
                    onChange={(e) => {
                      setWorkspaceName(e.target.value);
                      setWorkspaceError("");
                    }}
                  />
                </label>
                {workspaceError && (
                  <p role="alert" className="rubric-error">
                    {workspaceError}
                  </p>
                )}
                <div className="modal-actions">
                  <button
                    className="button dark"
                    onClick={() => {
                      const name = workspaceName.trim();
                      if (!name) {
                        setWorkspaceError("Enter a workspace name.");
                        return;
                      }
                      if (
                        w.workspaces.some(
                          (group) =>
                            group.name.toLowerCase() === name.toLowerCase() &&
                            (workspaceMode === "create" ||
                              group.id !== activeWorkspace.id),
                        )
                      ) {
                        setWorkspaceError(
                          "A workspace with this name already exists.",
                        );
                        return;
                      }
                      const id =
                        workspaceMode === "create"
                          ? `workspace-${crypto.randomUUID()}`
                          : activeWorkspace.id;
                      change((old) => ({
                        ...old,
                        workspaces:
                          workspaceMode === "create"
                            ? [...old.workspaces, { id, name }]
                            : old.workspaces.map((group) =>
                                group.id === id ? { ...group, name } : group,
                              ),
                        activeWorkspaceId: id,
                      }));
                      setModal(null);
                      if (workspaceMode === "create")
                        navigate(workspacePath(id));
                    }}
                  >
                    {workspaceMode === "create"
                      ? "Create workspace"
                      : "Save workspace name"}
                  </button>
                </div>
                {workspaceMode === "rename" && (
                  <div className="workspace-danger">
                    <h3>Delete workspace</h3>
                    <p>
                      {w.workspaces.length === 1
                        ? "Keep at least one workspace. Create another workspace before deleting this one."
                        : `The ${workspaceDatasets.length} dataset(s) in this workspace will be moved to the workspace you choose, keeping their labels.`}
                    </p>
                    {w.workspaces.length > 1 && (
                      <label className="workspace-picker">
                        Move datasets to
                        <select
                          aria-label="Move datasets to"
                          value={moveTarget}
                          onChange={(e) => setMoveTarget(e.target.value)}
                        >
                          {w.workspaces
                            .filter((group) => group.id !== activeWorkspace.id)
                            .map((group) => (
                              <option key={group.id} value={group.id}>
                                {group.name}
                              </option>
                            ))}
                        </select>
                      </label>
                    )}
                    <button
                      className="button delete-action"
                      disabled={w.workspaces.length === 1}
                      onClick={() => {
                        change((old) =>
                          deleteWorkspace(old, activeWorkspace.id, moveTarget),
                        );
                        setModal(null);
                        navigate(workspacePath(moveTarget));
                      }}
                    >
                      Delete workspace
                    </button>
                  </div>
                )}
              </>
            )}
            {modal === "delete-dataset" && (
              <>
                <p>
                  {deletingDataset
                    ? `Delete “${deletingDataset.name}” and its labels from this browser? This cannot be undone. Download a backup first if you need to keep them.`
                    : "This dataset has already been deleted."}
                </p>
                <div className="modal-actions">
                  <button className="button" onClick={() => setModal(null)}>
                    Cancel
                  </button>
                  {deletingDataset && (
                    <button
                      className="button delete-action"
                      onClick={() => {
                        change((old) => deleteDataset(old, deletingDataset.id));
                        setModal(null);
                        if (d?.id === deletingDataset.id)
                          navigate(workspacePath(activeWorkspace.id));
                      }}
                    >
                      Delete dataset
                    </button>
                  )}
                </div>
              </>
            )}
            {modal === "import" && !pending && !backup && (
              <div className="import-inputs">
                <p>
                  Drop a JSON dataset or workspace backup, choose a file, or
                  paste JSON below.
                </p>
                <button
                  className="drop-zone"
                  onClick={() => file.current?.click()}
                >
                  <Upload size={26} />
                  <strong>Drop your JSON file here</strong>
                  <span>or click to browse · .json files</span>
                </button>
                <div className="import-or">or paste JSON</div>
                <label className="paste-label" htmlFor="paste-json">
                  Dataset JSON
                </label>
                <textarea
                  id="paste-json"
                  className="paste-json"
                  spellCheck={false}
                  placeholder={
                    '{\n  "schemaVersion": "1.0",\n  "id": "my-dataset",\n  ...\n}'
                  }
                  value={importText}
                  onChange={(e) => {
                    setImportText(e.target.value);
                    setImportError("");
                  }}
                />
                {importError && (
                  <p className="rubric-error" role="alert">
                    {importError}
                  </p>
                )}
                <div className="modal-actions">
                  <button
                    className="button dark"
                    disabled={!importText.trim()}
                    onClick={() => loadText(importText)}
                  >
                    Preview dataset <ArrowRight size={16} />
                  </button>
                </div>
              </div>
            )}
            {modal === "import" && (pending || backup) && (
              <button
                className="text-button"
                onClick={() => {
                  setPending(null);
                  setBackup(null);
                  setImportError("");
                }}
              >
                <ChevronLeft size={14} /> Choose different JSON
              </button>
            )}
            {modal === "import" &&
              (backup ? (
                <>
                  <p>
                    This backup contains {backup.length} datasets. Restore adds
                    them to your saved data; conflicting IDs are imported as
                    copies. Named workspaces and their dataset assignments are
                    preserved. Older backups use the selected workspace.
                  </p>
                  <button
                    className="button dark"
                    onClick={() => {
                      const restored = mergeBackup(
                        w,
                        backupData,
                        importWorkspaceId,
                      );
                      change(() => restored);
                      setBackup(null);
                      setModal(null);
                      const first = restored.datasets.find(
                        (dataset) => dataset.id === restored.activeId,
                      );
                      navigate(
                        first
                          ? datasetPath(
                              first,
                              restored.positions[first.id] || 0,
                            )
                          : workspacePath(restored.activeWorkspaceId),
                      );
                    }}
                  >
                    Restore backup
                  </button>
                </>
              ) : (
                pending && (
                  <>
                    <div className="import-preview">
                      <Database size={25} />
                      <h3>{pending.name}</h3>
                      <p>
                        {pending.items.length} examples ·{" "}
                        {pending.rubric.length} scoring fields
                      </p>
                      <p>{pending.instructions}</p>
                    </div>
                    {w.datasets.some((x) => x.id === pending.id) ? (
                      <>
                        <p>
                          A dataset with this ID already exists. Resume keeps
                          your saved dataset and labels. Import a copy to use
                          this file separately.
                        </p>
                        <div className="modal-actions">
                          <button
                            className="button"
                            onClick={() => {
                              change((old) => ({
                                ...old,
                                activeId: pending.id,
                              }));
                              setModal(null);
                              setPending(null);
                              const existing = w.datasets.find(
                                (x) => x.id === pending.id,
                              )!;
                              navigate(
                                datasetPath(
                                  existing,
                                  w.positions[existing.id] || 0,
                                ),
                              );
                            }}
                          >
                            Resume saved dataset
                          </button>
                          <button
                            className="button dark"
                            onClick={() => add(pending, true)}
                          >
                            Import as copy
                          </button>
                        </div>
                      </>
                    ) : (
                      <button
                        className="button dark"
                        onClick={() => add(pending)}
                      >
                        Start labeling <ArrowRight size={16} />
                      </button>
                    )}
                  </>
                )
              ))}
            {modal === "export" && d && (
              <>
                <p>Take your annotations back to your evaluation workflow.</p>
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={completedOnly}
                    onChange={(e) => setCompletedOnly(e.target.checked)}
                  />{" "}
                  Export completed examples only ({done})
                </label>
                {completedOnly && done === 0 && (
                  <p>No completed examples to export yet.</p>
                )}
                {["Annotated JSON", "Labels-only JSON", "CSV"].map(
                  (label, i) => (
                    <button
                      className="export-option"
                      disabled={completedOnly && done === 0}
                      key={label}
                      onClick={() => {
                        const items = d.items.filter(
                          (it) =>
                            !completedOnly || status(d, it.id) === "completed",
                        );
                        const annotations = Object.fromEntries(
                          items.map((it) => [
                            it.id,
                            {
                              values: Object.fromEntries(
                                d.rubric.map((f) => [
                                  f.id,
                                  d.annotations?.[it.id]?.values[f.id] ?? null,
                                ]),
                              ),
                              skipped: d.annotations?.[it.id]?.skipped || false,
                              updatedAt: d.annotations?.[it.id]?.updatedAt,
                            },
                          ]),
                        );
                        const data =
                          i === 0
                            ? { ...d, items, annotations }
                            : i === 1
                              ? {
                                  schemaVersion: "1.0",
                                  datasetId: d.id,
                                  rubric: d.rubric,
                                  annotations,
                                }
                              : null;
                        download(
                          `${d.id}${i === 1 ? "-labels" : ""}.${i === 2 ? "csv" : "json"}`,
                          i === 2
                            ? csv(d, completedOnly)
                            : JSON.stringify(data, null, 2),
                          i === 2 ? "text/csv" : "application/json",
                        );
                        setNotice("Export downloaded.");
                      }}
                    >
                      <Download size={18} />
                      <div>
                        <strong>{label}</strong>
                        <small>
                          {i === 0
                            ? "Dataset, rubric, and annotations. Reimport to resume."
                            : i === 1
                              ? "Annotations keyed by item ID, with the scoring rubric."
                              : "One row per example, ready for a spreadsheet."}
                        </small>
                      </div>
                      <ArrowRight size={17} />
                    </button>
                  ),
                )}
                <p className="muted">
                  Unanswered fields are null in JSON and empty in CSV. False and
                  zero remain valid values.
                </p>
                <button
                  className="text-button danger"
                  onClick={() => requestDeleteDataset(d.id)}
                >
                  <Trash2 size={14} /> Remove dataset from this browser
                </button>
              </>
            )}
            {modal === "rubric" && d && (
              <>
                <p>
                  Field IDs connect annotations to your evaluation pipeline.
                  Keep existing field IDs and types to preserve labels.
                </p>
                <label className="editor-label">
                  Labeling instructions
                  <textarea
                    value={instructions}
                    onChange={(e) => setInstructions(e.target.value)}
                  />
                </label>
                <div className="rubric-editor">
                  {rubric.map((f, i) => (
                    <div className="rubric-row" key={f.id}>
                      <div className="rubric-row-top">
                        <input
                          aria-label="Field label"
                          value={f.label}
                          onChange={(e) =>
                            setRubric((r) =>
                              r.map((x, j) =>
                                j === i ? { ...x, label: e.target.value } : x,
                              ),
                            )
                          }
                        />
                        <span>{f.type}</span>
                        <label>
                          <input
                            type="checkbox"
                            checked={!!f.required}
                            onChange={(e) =>
                              setRubric((r) =>
                                r.map((x, j) =>
                                  j === i
                                    ? { ...x, required: e.target.checked }
                                    : x,
                                ),
                              )
                            }
                          />{" "}
                          Required
                        </label>
                        <button
                          className="icon"
                          aria-label={`Remove ${f.label}`}
                          onClick={() =>
                            setRubric((r) => r.filter((_, j) => j !== i))
                          }
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                      <small>ID: {f.id}</small>
                      <input
                        placeholder="Description or scoring guidance"
                        aria-label="Field description"
                        value={f.description || ""}
                        onChange={(e) =>
                          setRubric((r) =>
                            r.map((x, j) =>
                              j === i
                                ? { ...x, description: e.target.value }
                                : x,
                            ),
                          )
                        }
                      />
                      {f.type.includes("select") && (
                        <label className="options-editor">
                          Choices (one per line)
                          <textarea
                            aria-label={`Choices for ${f.label}`}
                            value={f.options?.join("\n") || ""}
                            onChange={(e) =>
                              setRubric((r) =>
                                r.map((x, j) =>
                                  j === i
                                    ? {
                                        ...x,
                                        options: e.target.value.split("\n"),
                                      }
                                    : x,
                                ),
                              )
                            }
                          />
                        </label>
                      )}
                      {f.type === "likert" && (
                        <div className="range-editor">
                          {(["min", "max"] as const).map((bound) => (
                            <label key={bound}>
                              {bound === "min" ? "Minimum" : "Maximum"}
                              <input
                                aria-label={`${f.label} ${bound}`}
                                type="number"
                                step="1"
                                value={f[bound]}
                                onChange={(e) =>
                                  setRubric((r) =>
                                    r.map((x, j) =>
                                      j === i
                                        ? {
                                            ...x,
                                            [bound]: Number(e.target.value),
                                          }
                                        : x,
                                    ),
                                  )
                                }
                              />
                            </label>
                          ))}
                        </div>
                      )}
                      {f.type === "likert" && (
                        <div className="anchor-editor">
                          {Array.from(
                            {
                              length: Math.max(
                                0,
                                Math.min(11, f.max! - f.min! + 1),
                              ),
                            },
                            (_, n) => n + f.min!,
                          ).map((n) => (
                            <label key={n}>
                              {n}
                              <input
                                aria-label={`Anchor ${n}`}
                                value={f.anchors?.[n] || ""}
                                onChange={(e) =>
                                  setRubric((r) =>
                                    r.map((x, j) =>
                                      j === i
                                        ? {
                                            ...x,
                                            anchors: {
                                              ...x.anchors,
                                              [n]: e.target.value,
                                            },
                                          }
                                        : x,
                                    ),
                                  )
                                }
                              />
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <div className="add-field">
                  <select
                    aria-label="Add scoring field"
                    defaultValue=""
                    onChange={(e) => {
                      if (!e.target.value) return;
                      const type = e.target.value as Field["type"];
                      setRubric((r) => [
                        ...r,
                        {
                          id: `field_${crypto.randomUUID().slice(0, 8)}`,
                          label: "New field",
                          type,
                          required: false,
                          ...(type === "likert"
                            ? {
                                min: 1,
                                max: 5,
                                anchors: { "1": "Low", "5": "High" },
                              }
                            : {}),
                          ...(type.includes("select")
                            ? { options: ["Option A", "Option B"] }
                            : {}),
                        },
                      ]);
                      e.target.value = "";
                    }}
                  >
                    <option value="">+ Add scoring field</option>
                    {[
                      "binary",
                      "likert",
                      "text",
                      "single-select",
                      "multi-select",
                    ].map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <button
                  className="text-button"
                  onClick={() => {
                    setAdvanced((x) => !x);
                    setRubricJson(JSON.stringify(rubric, null, 2));
                    setRubricError("");
                  }}
                >
                  {advanced
                    ? "Close advanced editor"
                    : "Advanced: edit ranges, options, and IDs"}
                </button>
                {advanced && (
                  <>
                    <textarea
                      className="json-editor"
                      aria-label="Rubric JSON"
                      value={rubricJson}
                      onChange={(e) => setRubricJson(e.target.value)}
                    />
                    <button
                      className="button"
                      onClick={() => {
                        try {
                          const parsed = JSON.parse(rubricJson);
                          validate({
                            ...d,
                            rubric: parsed,
                            annotations: undefined,
                          });
                          setRubric(parsed);
                          setAdvanced(false);
                          setRubricError("");
                        } catch (err) {
                          setRubricError(
                            err instanceof Error
                              ? err.message
                              : "Invalid rubric",
                          );
                        }
                      }}
                    >
                      Apply JSON
                    </button>
                  </>
                )}
                {rubricError && (
                  <p role="alert" className="rubric-error">
                    {rubricError}
                  </p>
                )}
                <div className="modal-actions">
                  <button
                    className="button dark"
                    onClick={() => {
                      try {
                        if (advanced)
                          throw Error(
                            "Apply or close the advanced JSON editor before saving.",
                          );
                        const kept = new Set(rubric.map((f) => f.id));
                        const annotations = Object.fromEntries(
                          Object.entries(d.annotations || {}).map(
                            ([id, ann]) => [
                              id,
                              {
                                ...ann,
                                values: Object.fromEntries(
                                  Object.entries(ann.values).filter(([k]) =>
                                    kept.has(k),
                                  ),
                                ),
                              },
                            ],
                          ),
                        );
                        const candidate = validate({
                          ...d,
                          rubric,
                          instructions,
                          annotations,
                        });
                        updateDataset(() => candidate);
                        setModal(null);
                      } catch (err) {
                        setRubricError(
                          err instanceof Error ? err.message : "Invalid rubric",
                        );
                      }
                    }}
                  >
                    Save rubric
                  </button>
                </div>
              </>
            )}
            {modal === "prompt" && (
              <>
                <p>
                  Clipboard access is unavailable. Select and copy this prompt.
                </p>
                <textarea
                  className="prompt-text"
                  readOnly
                  value={generatorPrompt}
                  onFocus={(e) => e.target.select()}
                />
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
