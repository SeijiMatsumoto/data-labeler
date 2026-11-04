# Labeldesk

Label AI evaluation datasets without working through raw JSON or Markdown files. Review one example at a time, score it with a rubric that fits your dataset, and export the results.

**[Open Labeldesk →](https://label-desk.vercel.app)**

No account required. Your datasets and labels stay in your browser on your device.

## Get started

1. Open [label-desk.vercel.app](https://label-desk.vercel.app) and choose **Try sample dataset** to explore the labeling flow.
2. Bring your own data with **Import dataset**. Drag and drop a JSON file, browse for a file, or paste JSON text. You can also drop a file anywhere in the app.
3. Choose a workspace, preview the dataset, and select **Start labeling**.
4. Review each example and fill in its scoring fields. Changes save automatically, so you can leave and resume later in the same browser.
5. When you're finished, select **Export results**. You can also open **Export** at any time.

## Have your coding agent prepare the dataset

You don't need to write the input JSON by hand.

Click **Copy dataset prompt** in the sidebar, then paste it into a coding agent working in the project you want to evaluate. The prompt includes the expected JSON format, an example, and instructions for preparing reviewable data without prefilling human judgments.

Give the agent your evaluation goal and tell it which outputs to include. Import the JSON file it generates into Labeldesk. You can also select **Download example JSON** on the home screen to see an example of the format.

## Choose how to score

Each dataset has its own rubric. Open **Rubric** to adjust scoring instructions and fields:

| Field           | Use it for                                                 |
| --------------- | ---------------------------------------------------------- |
| Binary          | Yes/no decisions, such as whether an answer is correct     |
| Likert scale    | Numeric ratings with descriptions for what the scores mean |
| Single select   | Choosing one category or outcome                           |
| Multiple select | Selecting every applicable category                        |
| Text            | Comments, observations, or explanations                    |

Fields can be required or optional. An example is complete once all required fields are answered and at least one field has an answer. **No** and a score of **0** count as answers.

Use **Skip for now** to set an example aside without losing any scores you've already entered. **Next unlabeled** finds examples that still need attention. Once no unfinished examples remain, the button becomes **Export results**.

## Review comfortably

Examples can include plain text, Markdown, formatted JSON, code, or chat conversations. Prompts, responses, references, and supporting context appear as separate reading blocks.

- Use **Compare side by side** when reviewing multiple blocks together.
- Search examples by ID or content, or filter by review status.
- Expand **Source metadata** when you need provenance or extra context.
- Use browser Back and Forward to return to previous views. You can bookmark individual examples, too.

Example links open your locally saved data. To use a link on another browser or device, import the dataset or a backup there first. Image and audio labeling aren't supported yet.

### Keyboard shortcuts

Shortcuts work when you aren't typing in a text field or choosing an option in a dropdown.

| Key                     | Action                                                                    |
| ----------------------- | ------------------------------------------------------------------------- |
| Left / Right arrow      | Previous / next example                                                   |
| Up / Down arrow         | Select a scoring field                                                    |
| 1–9                     | Choose an option in the selected scoring field                            |
| 1 / 2 on a binary field | Yes / No                                                                  |
| N                       | Go to the next unfinished example, or open export when review is complete |
| Enter / Return          | Submit a create or rename workspace form                                  |
| Escape                  | Close a dialog                                                            |

## Organize datasets into workspaces

Start in **Default Workspace**, or select **Create workspace** to group datasets by project, experiment, or review session. Switch groups with the workspace dropdown in the sidebar.

- **Manage** lets you rename the current workspace.
- Every imported dataset is assigned to a workspace you choose.
- Deleting a workspace moves its datasets and labels into another workspace you select. At least one workspace must remain.
- Each dataset has a delete button in the sidebar. Deleting a dataset removes it and its labels from this browser after confirmation.

## Export your labels

Open **Export** and choose the format that fits your next step:

| Format           | What you get                                                                                |
| ---------------- | ------------------------------------------------------------------------------------------- |
| Annotated JSON   | The dataset, rubric, labels, and review states. Import it again to resume labeling.         |
| Labels-only JSON | Labels keyed by example ID, together with the scoring rubric, for your evaluation workflow. |
| CSV              | One row per example, with scoring fields as columns, for a spreadsheet.                     |

You can export all examples or only completed ones. Unanswered fields are `null` in JSON and empty cells in CSV.

If you import a dataset that's already saved, choose **Resume saved dataset** to keep your existing work or **Import as copy** to review the new file separately.

## Keep a backup

Click **Back up workspace** to download all your workspaces, dataset assignments, labels, and saved positions. Restore a backup through **Import dataset**. Restoring adds to your saved data and imports conflicting dataset IDs as copies.

Your work is stored in your browser's local storage. It isn't synced across browsers or devices, and clearing site data can erase it. Browser storage is limited; Labeldesk shows a warning if it fills up. Export a backup regularly, especially before deleting data or switching devices.

**Moving from an older site address or localhost?** Export a backup from that address and import it at [label-desk.vercel.app](https://label-desk.vercel.app). Each site address has separate browser storage.
