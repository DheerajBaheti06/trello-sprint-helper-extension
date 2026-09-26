# Sprint Helper

A sprint management and reporting toolkit for teams working in Trello.

**Created and maintained by Dheeraj**, Sprint Helper brings workload visibility, card quality checks and release reporting into the board where your team already works. Review sprint progress, find incomplete task details and prepare structured Slack updates without repeatedly opening cards or collecting links by hand.

Built on [Scrum for Trello](https://github.com/Q42/TrelloScrum) by Q42, it extends the original story-point badges and list totals with member dashboards, persistent filters, editable reports and card productivity tools. Several workflows are adapted from **Trello Burndown**, Dheeraj’s companion web application.

## Sprint workflows

| Workflow | What you can do |
| --- | --- |
| **Members Burndown** | Review completed and remaining hours, card completion and individual workloads in one sprint overview. Charts opens interactive developer-points and label-distribution pies with a pop-out view. |
| **Settings** | Open Members Burndown → Settings to control the four board features, charts, Check All, comment search, quick point editing, Review mode and the laser pointer. Choices apply across boards in this browser. All features start enabled; hiding Trello’s native filter is optional. Reset to defaults restores these choices. |
| **Attention** | Combine scope, points, hotfix and checklist checks with member, label and list filters. Preserve selections and import native Trello filters. |
| **Cards List & Slack Preview** | Select filtered cards, group them by developer, label or list, choose title/link formats, optionally append developer names when grouping by labels, and copy from the preview panel. |
| **EOW Update** | Build weekly reports with task categories, drag-and-drop organization, list exclusions, points display and editable Slack previews. |
| **Card productivity** | Search and navigate comments, complete an individual checklist in one action, and manage estimated/completed story points. |

The four main popups follow Trello’s theme and include contextual **info help**. Slack previews remain editable and are copied manually for review and sharing.

## Go further with Trello Burndown

**Trello Burndown**, also created by Dheeraj, is the full web dashboard behind several of these workflows. It provides a dedicated workspace designed for faster sprint operations, with a richer visual interface and broader board-management features:

- **Bulk card updates** to handle changes across multiple tasks.
- **Expanded sprint dashboards and reporting** for reviewing team progress.
- **Push to Google Sheet** for exporting sprint data into reporting spreadsheets.
- **Cards List and EOW workflows** in a full-page workspace with more room to organize and edit reports.

Open it through **View Full Dashboard** in the Members Burndown header once the website URL is configured. The website address will be added here when available.

## Install

1. Download and extract this repository, or clone it with Git. Keep the folder in a permanent location.
2. Open `chrome://extensions/` and enable **Developer mode**.
3. Click **Load unpacked** and select the folder containing `manifest.json`.
4. Open or refresh Trello.

## Update

Run `git pull --ff-only` from your cloned folder, or replace the files with the latest download. Then **Reload** the extension in `chrome://extensions/` and refresh Trello. Updates are manual.

## Before using

Point edits and **Check All** modify Trello cards. Cards assigned to everyone are excluded from Cards List/EOW; this also affects single-member boards. Review the [known limitations](RELIABILITY-REVIEW.md), including Trello compatibility and team-rule assumptions, before wider deployment.

<details>
<summary><strong>Advanced usage, data storage and developer setup</strong></summary>

### EOW behavior

The report uses the current board independently of Attention/native filters. It starts with the signed-in member when available. Week matching checks due date, last activity, card creation and dated comments independently; these dates do not prove who performed the work.

Default categories are Stabilization (UI/UX), Hotfix, Features (Client Requests/Critical labels), Dev-Ops (title suffix), and Release Tasks (everything else). Priority is Hotfix, Dev-Ops, Stabilization, then Features. Saved drafts retain edits; Reset rebuilds from board data.

Recognizable release dates can trigger a notice to add previous-release tasks manually. There is no automatic previous-board import. Unrecognized release names cannot reliably establish overlap. Empty weeks remain empty.

### Dashboard link

Set `fullDashboardUrl` inside `renderMembersBurndownModal` in `sprint-helper.js` to Dheeraj’s deployed **Trello Burndown** website URL. **View Full Dashboard** stays inactive until that URL is added and then opens the website in a new tab. Google Sheets export and bulk card updates run on the website; the link itself does not transfer authentication or synchronize data.

### Data and limitations

The extension reads Trello using your signed-in browser session. Point edits and Check All can modify Trello cards. Slack exports require manual copying/pasting. Feature preferences, Attention filters and EOW drafts are stored in Trello-origin local storage; clearing site data removes them. General settings use Chrome sync storage when available.

Trello markup or endpoint changes can break integration. Cards assigned to every board member are excluded from Cards List/EOW, which also affects single-member boards. Done-list naming affects completion totals. See [the reliability review](RELIABILITY-REVIEW.md) for remaining findings, and the targeted security fixes; this has not undergone an independent security audit.

### Development

No build step or npm installation is required. With Node.js installed:

```bash
node --check sprint-helper.js
node --check eow-update.js
node --test attention.test.cjs tests/*.test.cjs
```

Python fixture builders under `tests/` generate local browser test pages in `/tmp`. Some EOW fixtures use fixed dates; date-dependent results need review when run later. Automated tests do not replace testing against live Trello.

### Publish to your own GitHub repository

Create an empty repository named `trello-sprint-helper-extension` under your own GitHub account. Leave GitHub’s initial README/license options unchecked because these files already exist here. From this folder:

```bash
git add .
git commit -m "Prepare Sprint Helper for GitHub"
git remote add origin https://github.com/DheerajBaheti06/trello-sprint-helper-extension.git
git push -u origin main
```

If `origin` already exists, inspect `git remote -v` before changing it. This publishes to your repository, not Q42’s. Keep private credentials and company data out of both files and Git history.

</details>

## Credits & license

MIT licensed. Dheeraj develops and maintains this enhanced version; Q42, original authors Marcel Duin and Jasper Kaizer, and community contributors retain credit for TrelloScrum. See [LICENSE](LICENSE), [third-party notices](THIRD_PARTY_NOTICES.md) and [release history](CHANGELOG.md).

Independent project; not affiliated with Trello or Atlassian.
