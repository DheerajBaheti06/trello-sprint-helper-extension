# Sprint Helper workflow rules

Only the rules that can change your results. Match these conventions when setting up your board.

## Points & progress

| Feature | What you need to know | Example |
| --- | --- | --- |
| **List-top points** | Reads assigned points from `( )` and completed points from `[ ]` in card titles. Assigned appears first. | `(5) Fix login [2]` → **5 assigned / 2 completed**. |
| **Members Burndown** | Done-list cards count as fully completed, even if their title shows fewer completed points. Marking the due date complete has the same effect. | The same `(5) Fix login [2]` in `Done-Accepted in Test` counts as **5 completed** here, but **2** in list-top totals. |
| **Done-list detection** | Uses name matching, not a Trello status. Avoid `Not Done` and `Incomplete` for active work—they also match. | Recognized names include `Done`, `Done-Closed`, `Done-Accepted in Test`, `Verified` and `Released`. |
| **Not Sure exclusion** | Use `Not Sure` in list names. Members Burndown excludes these lists by default **only from member rows**, not the four summary cards. | `Dheeraj Not Sure`, `Ishan Not Sure`. Uncheck the option to include them. |
| **Shared-card points** | Each assigned member gets the card’s full points; they are not divided between members. | A 5-point card assigned to two developers contributes **5 to each**, but only **5 to the team total**. |

## Cards that may be missing from results

| Feature | What gets excluded | Example |
| --- | --- | --- |
| **Points, Attention & reports** | Cards named exactly `Release` or `Template card` are treated as housekeeping cards. Case and point brackets are ignored. | `(2) Template card` is excluded. `Release login fix` is not excluded by this name rule. |
| **Cards List & EOW** | Also exclude cards assigned to **every board member**. On a single-member board, this includes ordinary cards assigned to that member. | A card assigned to all 6 members will not appear in these two features. |

## Attention filters

| Check | Matching rule | Example |
| --- | --- | --- |
| **Missing required comments** | Looks for your names as **H1, H2 or H3 headings across comments**, not plain text or description text. Any missing heading makes the card match. Case is ignored; common variants are accepted. | Required: `Tech Design, Test Cases, Branch`. `TESTCASES` and `Branches` match; missing Tech Design still keeps the card in results. |
| **Missing checklists** | Any missing checklist name makes the card match. Case and extra spaces are ignored. | Required: `Process, Impact`. A card with only Process still appears. |
| **Points mismatch** | Matches unequal assigned/completed values. Cards missing either value are excluded; zero is a valid value. | `(5) Task [2]` matches. `(5) Task` does not. |

## EOW Update

| Rule | How it affects your report | Example |
| --- | --- | --- |
| **Week selection** | Includes assigned cards with a due date, creation date, last activity or comment date in the selected week. This does not identify who did the work. | Another person comments on your assigned card this week → it can appear in your EOW. |
| **Category priority** | First match wins: **Hotfix label → Dev-Ops title ending → UI/UX → Client Requests/Critical label → Release Tasks**. You can edit the draft. | A card labelled Hotfix and UI goes under **Hotfix**. |
| **Category examples** | Dev-Ops checks the title ending. UI/UX checks title, labels or list. Features checks labels. | `Fix pipeline #dev-ops` → Dev-Ops; `UI` label → Stabilization; `Critical` label → Features. |
| **Previous release work** | EOW loads the current board. Add previous-board tasks manually; dated board names do not import them. | A week spans two release boards → review the older board and add its tasks to the draft. |
