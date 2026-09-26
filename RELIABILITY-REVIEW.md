# Sprint Helper reliability review

Reviewed 2026-09-13. Scope: extension runtime (`sprint-helper.js`, `eow-update.js`, `hover-selectors.js`), manifest, styles, and local tests. This is not a live Trello compatibility certification or a review of the separate website backend. No runtime fixes were made during this audit.

## Follow-up — 2026-09-14

Fixed issue 1 (board-specific cache, response identity checks, stale-refresh protection, navigation guard) and issue 8 (20-second timeout per primary/fallback request). Added `tests/board-cache.test.cjs`; regression suites pass. The findings below describe the original audit; later fixes are recorded in the follow-ups. The assigned-to-everyone rule remains intentional per user direction.

## Security follow-up — 2026-09-27

Fixed issue 3: board/member names, usernames, initials and avatar attributes are escaped before HTML rendering. Avatar URLs now require HTTPS and approved Trello/Atlassian/Gravatar hosts; invalid URLs use initials. Member metrics are normalized to numbers before interpolation.

The legacy spreadsheet export now escapes list names, card titles and descriptions and prefixes formula-like text with an apostrophe. Web-accessible image resources are limited to Trello pages instead of all websites. Added regression tests for malicious markup, avatar schemes/hosts, export content and resource scope.

These are targeted security fixes, not an independent security audit or a guarantee against future Trello changes. Spreadsheet behavior still depends on the importing application; no desktop Excel integration test was performed. The bundled legacy jQuery dependency remains a maintenance risk and needs a separately tested migration.

## Confirmed issues, ordered by impact

### 1. Burndown cache can return a different board (high)

Location: `sprint-helper.js`, `fetchBoardData`, around line 259.

The 30-second cache has no board key. Fetch board A, switch to B, then open Members Burndown without forcing refresh: the cache returns A. Reproduced with a mocked cache/request. Key the cache and in-flight requests by immutable board ID/short link, and validate response identity. Guard responses against board navigation as well as modal identity.

### 2. List names can incorrectly mark cards complete (high)

Location: `sprint-helper.js`, `computeBurndownFromBoardData`, around line 372; equivalent DOM fallback matching also exists.

Completion uses unanchored substrings such as `complete`. A list called **Incomplete** marks a `(5) Build login` card complete with zero remaining points. Reproduced. Renaming Done to a team-specific name can cause the opposite problem. Prefer explicit done-list IDs per board, with deliberate defaults and a visible settings mapping, rather than fuzzy status detection.

### 3. Board/member names are inserted as HTML (high; fixed 2026-09-27)

Location: `sprint-helper.js`, `renderMembersHtml`, around line 918, and board badge markup in `renderMembersBurndownModal`.

Names and avatar attributes are concatenated into HTML without escaping. A member name containing `<b>Injected markup</b>` is returned as literal markup by the renderer; reproduced. This can break layout and creates an HTML-injection risk. Script execution was not tested and depends on browser/site protections. Build user-controlled values with text nodes and safe attribute setters, or context-appropriate escaping.

### 4. Ordinary cards disappear on small boards (high)

Locations: `eow-update.js`, `s4tEowMergeBoards`; `sprint-helper.js`, Cards List `candidates`.

Every card assigned to all board members is treated as a template. On a single-member board this excludes every normally assigned card. Reproduced in EOW. Adding or removing a member changes exclusion results even when cards themselves do not change. Burndown uses a different common-card rule, so counts can disagree between features. Use explicit template/card IDs or an explicit marker, consistently across features.

### 5. EOW misses activity when a due date exists (medium)

Location: `eow-update.js`, `s4tEowCategories`, around lines 75–80.

The active single-board path uses `card.due || card.dateLastActivity`. A card updated on 10 September but due on 20 September is excluded from the 7–13 September week. Reproduced. If the intended rule is due OR activity OR creation, evaluate all three separately. Even that cannot reconstruct activity history: a newer update overwrites dateLastActivity, and assignment does not identify the actor. Accurate historical/member-action reporting requires action history or snapshots.

### 6. Renaming previous release boards silently suppresses the warning (medium)

Location: `eow-update.js`, `s4tEowReleaseName` and `s4tEowPreviousReleases`.

The warning needs explicit dates and matching normalized name patterns in the same workspace. Renaming only the previous board to `16sep2026release renamed` produces no matching release and no error. Reproduced. Current-board names without a parseable date show an error; previous-board pattern mismatches instead look like no overlap. Most other extension features continue working because they use IDs. A robust warning needs authoritative release dates and linked board IDs, or at least an explicit “unable to establish release sequence” state when no predecessor can be identified.

### 7. Saved EOW drafts can contradict fresh board data (medium)

Location: `eow-update.js`, `selectDraft`, around line 208; refresh success calls it after fetching.

Refresh reloads the saved draft without reconciling generated cards against fresh membership, labels, or week matches. This intentionally protects edits, but can keep stale cards even if the fetched board now has no matching cards. Changing exclusions calls `generate()` directly and replaces edited categories and preview. Separate generated source cards, user edits/manual tasks, and exclusions; refresh source data without silently losing user content. Mark drafts as edited/stale where appropriate.

### 8. Burndown network requests have no timeout (medium)

Location: `sprint-helper.js`, `fetchBoardData` primary API and JSON fallback.

Unlike EOW and Attention, neither request sets a timeout. A stalled request can leave the skeleton/disabled refresh active until the browser fails the request. Add bounded timeouts, consistent validation, and a retry state that preserves the last known data. This is a code-inspection finding, not an induced live-network failure.

## Compatibility and performance risks

- **Trello markup and localization:** toolbar mounting, native-filter clearing, checklist expansion, and comment search depend on test IDs, DOM structure, and some English text. For example Check all searches for Delete and Show items. A Trello redesign or different language can remove controls or prevent filtering. Centralize selectors and capability checks; expose a clear unsupported state instead of silently doing nothing.
- **Private page-context endpoints:** requests rely on Trello's signed-in web-session behavior at `/1/...` and `/b/...json`. An auth or response-schema change can disable loading. Attention has a fallback and strict validation; EOW and Burndown differ in validation and failure handling. Use one board-data adapter and consistent response checks.
- **Large boards/drafts:** full-board/all-checklist fetches, multiple DOM observers, repeated category rendering, and full-draft synchronous localStorage writes on each keystroke are potential slow paths. No large-board benchmark was performed, so these are candidates rather than measured bottlenecks. Debounce persistence, cache per board, coalesce requests, and measure before adding virtualization.
- **Storage:** EOW drafts live in Trello-origin localStorage, not extension storage. Clearing Trello site data loses drafts. Rules lack a general draft-schema version/migration, and old drafts retain old classifications. Consider versioned extension storage and explicit migrations/export.
- **Checklist “success”:** Check all verifies the DOM checkbox state, which may be optimistic. A server-side failure that later reverts the checkbox is not independently verified by the extension. Native UI automation should stop safely and avoid claiming server confirmation.
- **Date display versus filtering:** the editable date text is report wording; actual filtering uses a separate internal week. Editing the text alone does not change the filter. Explain this distinction or validate date edits against the selected week so the report cannot accidentally claim a different period.

## Existing protections

- Attention saves list/member/label IDs, so ordinary renames generally preserve selections.
- Attention validates complete card/checklist data and keeps previous data on errors.
- EOW draft keys include board, member ID, and week; malformed JSON is caught.
- Loading paths have stale-modal/request guards, and checklist processing is sequential with card/checklist guards.
- Release matching scopes by workspace and refuses duplicate-date ambiguity.
- Local regression tests exist for filtering, date rules, cross-board handling, skeleton cleanup, and UI interactions.

## Validation and limits

The existing Node suites passed. A separate read-only VM harness reproduced issues 1–6 using fixture data. Passing the existing suites does not cover these missing cases. No real cards were modified, no accounts were messaged, and no production board data was used for these reproductions.

Recommended fix order: board cache isolation; safe name rendering; explicit done/template rules; EOW date semantics and draft reconciliation; request timeouts; centralized Trello adapters; then measured performance work.
