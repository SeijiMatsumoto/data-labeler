# Labeldesk

A local-first workspace for AI evaluation dataset labeling. Built with React, TypeScript, and Vite. No backend, analytics, remote fonts, or account required.

## Run

```sh
npm install
npm run dev
```

Open the localhost URL printed by Vite. Keep using the same origin (host and port): browser storage is origin-specific.

```sh
npm test
npm run build
```

## Workflow

1. Try the built-in sample or open Import dataset to drop a JSON file, browse files, or paste JSON text. Files can also be dropped anywhere in the app. Each option validates and previews the data before importing.
2. Use **Copy dataset prompt** to ask a coding agent in another project to prepare data. The prompt includes the complete contract and example.
3. Configure the rubric, review examples, and score. Every edit saves to localStorage.
4. Export annotated JSON to resume later, labels-only JSON for evaluation scripts, or CSV for spreadsheets.
5. Back up the workspace regularly. Browser data can be cleared; localStorage is typically limited to a few MB. Storage failures show a warning and leave current changes in memory for export.

Keyboard shortcuts when not editing a form control: left/right navigate; up/down select scoring field; 1–9 pick a scoring option; N goes to the next unlabeled example. For a binary field, 1 = Yes and 2 = No. An item is complete when required fields are answered and at least one field has an answer. Skip preserves existing answers.

## Workspaces

Use the sidebar dropdown to switch workspaces. **Create workspace** adds a named group; **Manage** renames it or deletes it after choosing another workspace for its datasets. At least one workspace is kept. Deleting a workspace preserves datasets and annotations by moving them to the chosen destination.

Existing local data automatically belongs to **Default Workspace**. Imports show a workspace assignment selector, and the sample belongs to the current workspace. Each sidebar dataset has a delete button with confirmation; deleting it also removes its labels and saved position.

Backups include every workspace, dataset assignment, annotation, and saved position. Restoring a named backup preserves its groups, importing conflicting dataset IDs as copies. Older backups are assigned to the selected workspace.

## Navigation

The workspace home is `/`, and each named workspace has a `/workspaces/:workspaceId` URL. Each example has a bookmarkable URL, `/datasets/:datasetId/examples/:itemId`. Dataset links resume the last reviewed example, and `/datasets/:datasetId` also opens the saved position. Rubric and export panels use `?panel=rubric` and `?panel=export`. Browser Back/Forward restores these views without undoing annotations. Refreshing a deep link restores the same example from localStorage. Links require the dataset to exist in that browser; import a dataset or workspace backup on another browser first.

## Dataset contract

The runtime validator and TypeScript types live in `src/model.ts`. Download the sample from the app or use the included `example.dataset.json`.

- Envelope: `schemaVersion: "1.0"`, stable `id`, `name`, optional `instructions`, `rubric`, `items`.
- Rubric fields: unique `id`, `label`, `type`, optional `required` and `description`.
- Types: `binary`, `likert` (integer min < max; maximum 11 options; optional anchors), `text`, `single-select`, `multi-select` (string options).
- Items: unique string `id`, nonempty `blocks`, optional `metadata`.
- Blocks: `label`, `type`, `value`. Text, Markdown and code use strings; JSON accepts JSON values; chat uses an array of `{role, content}` strings.
- Optional `annotations`: object keyed by item ID containing `values` keyed by rubric ID, optional `skipped`, `updatedAt`.
- JSON exports use `null` for unanswered values, preserving `false` and `0`. CSV uses empty cells for unanswered values and JSON strings for multiple selections.

Rubric editor supports labels, descriptions, required flags, anchors, adding and removing fields. Ranges, scale anchors, and choice options can be edited directly. An advanced JSON editor is also available. Changing a field type or range must remain compatible with existing answers; the app validates before saving. Removing a field removes its annotations.

Importing an existing dataset ID offers resume (keep saved data) or import as a copy. Backup restore merges datasets and copies conflicting IDs. Rendered Markdown uses no raw HTML and blocks remote images so imported content does not initiate image requests. This app targets text-based datasets; image/audio labeling is outside this version.

## Deploy to Vercel

`vercel.json` configures the Vite build and SPA fallback so dataset/example URLs work on direct visits and refreshes. Run `vercel --prod` from this directory with the Vercel CLI authenticated.

Datasets and annotations remain in browser localStorage. The hosted URL has separate storage from localhost: export a workspace backup locally and import it on the hosted app to carry your labels over.
