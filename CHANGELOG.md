# Changelog

## 1.108

Card Quick View (Peek Out), rich description clipboard workflows, and productivity enhancements.

- **Quick View (Peek Out)**:
  - Added hover preview on board cards featuring a bold registration paper icon badge.
  - Previews card Description / Scope with full Markdown formatting (headings, blockquotes, code blocks, bold/italics, and nested bullet lists).
  - Inspects checklist progress and required comment heading statuses (`Tech Design`, `Test Cases`, `Branch`) mirroring Attention filter rules.
  - Dedicated copy button inside description view with animated copy feedback and a floating screen toast to copy structured scope directly.
  - Auto-dismisses when clicking outside, opening a card modal, or navigating routes.
- **Rich Description Copy in Card Modal**:
  - Enhanced modal description copy button to preserve semantic markdown formatting and nested bullet list hierarchies (`text/html` and structured `text/plain`).
  - Automatically filters out internal Trello edit button text artifacts.
- **Interactive Board Card Export**:
  - Replaced broken legacy export with interactive Column Designer modal accessible from the board toolbar (`#s4t-export-launch`) and Members Burndown.
  - Dynamically add, rename, remove, and shift (← / →) columns across 14 card fields with descriptions and tooltips (`list`, `title`, `title_raw`, `points`, `completed_points`, `remaining_points`, `members`, `labels`, `due`, `status`, `desc`, `url`, `checklists`, `blank`).
  - Independent Exclusions & Ordering section below the column builder to exclude lists (with Not Sure toggle), developers, and labels, and sort rows by list, developer, title, story points, or due date.
  - Live on-demand 4–5 card demo preview with settings-changed refresh indicator.
  - Exports to Excel (.xls), CSV (.csv) with UTF-8 BOM, and tab-separated clipboard copy for direct Google Sheets paste, with formula injection protection (`=`, `+`, `-`, `@`).
  - Settings preference toggle under Board features.

## 1.107

First prepared GitHub release of Sprint Helper by Dheeraj, built on Q42’s TrelloScrum.

- Members Burndown, Attention, Cards List/Slack previews and EOW reporting.
- Comment search and checklist Check All.
- Slack grouping by developer, label or list.
- Clickable and hoverable info help for all four popups.
- Optional View Full Dashboard link; Google Sheets integration removed.
- Installation/update documentation and preserved third-party licenses.

The inherited extension version was 1.106. Version 1.107 continues that sequence; it does not imply 107 releases by this project. Known limitations are documented in RELIABILITY-REVIEW.md.
