# Pariksha — Feature Log

A running record of what's been built across the Pariksha exam-prep platform
(web app, mobile app, backend, and the shared logic they all consume).

## Architecture

- **`pariksha` (this repo)** — React 19 + TypeScript web app (Vite), deployed to
  `pariksha.billbolo.in` on push to `main` via GitHub Actions. Contains the
  FastAPI/Mangum backend at `pariksha-backend/`, deployed to AWS Lambda +
  DynamoDB (Serverless Framework v4, `ap-south-1`, profile `billbolo`).
- **`pariksha-mobile`** — React Native 0.88 + React 19 + Expo SDK 58, built to
  Android APK via EAS Build.
- **`pariksha-shared`** — shared TypeScript types, API client, and scoring/
  session logic, consumed identically by both apps as a `shared/` git
  submodule.

## Study Vault — Sub-Concept Tagging

Every chapter across all 18 Study Vault chapters (Quant + Reasoning) now has
sub-concept notes and tagging, not just Time & Work (the original pilot):

- **121 sub-concepts** across the 18 chapters, with dedicated study notes per
  sub-concept.
- **13,195 bank questions** tagged by chapter + sub-concept.
- Ported to both web (`StudyVaultScreen` equivalent) and mobile
  (`StudyVaultScreen.tsx`).

## Master Vault — Practice Builder

A persistent, tagged question bank (separate from the one-shot Paper Vault
upload flow) that lets a learner multi-select chapters/sub-concepts and spin
up an on-the-fly scored practice session, reusing the existing exam-taking
engine (`Review → SystemCheck → Instructions → Exam → Report`).

### Multi-chapter sub-concept fix
Selecting 2+ chapters used to hide the sub-concept picker entirely, and the
underlying filter used bare sub-concept names — a correctness bug, since the
same name (e.g. "Miscellaneous Questions") repeats across many chapters.
Fixed end-to-end with a `"chapter|subConcept"` compound key:
- Backend: `/bank/subconcepts` now takes a `chapters` comma-list and returns
  `{chapter, subConcept, count}`.
- `/bank/practice-paper`'s sub-concept filter matches on the compound key.
- Web + mobile: fetch fires for any non-empty chapter selection; all
  selection state keyed by `chapter|subConcept`.

### Sub-concept picker redesign
Replaced the flat wall-of-chips UI with collapsible per-chapter accordion
cards — each card shows a colored dot, chapter name, question count, a
"N selected" pill, select-all/clear-all per chapter, and a global clear-all
summary row. Mockup previewed in `~/Downloads/` before building; shipped on
both web (`MasterVault.tsx`) and mobile (`MasterVaultScreen.tsx`).

## Reasoning Drill — Ungraded Practice Mode

Parsed and ingested **725 Reasoning questions** from a third-party PDF
(RRB PO Prelims Reasoning practice set) that has no written answer key — only
YouTube "solution link" annotations per question.

Rather than fabricate or algorithmically guess answers to hundreds of
multi-step logic puzzles, this became a new **ungraded, browse-only** content
type, explicitly isolated from every scored path:

- New `BankQuestion.type = "practice"` — validated (needs text + ≥2 options,
  no answer required), carries a `solutionLink` field.
- New `drill` boolean query param on `/bank/sections`, `/bank/subconcepts`,
  `/bank/questions` — toggles between the scored pool (default) and the
  practice pool. `generate_practice_paper` defensively excludes `"practice"`
  items from every scored sample, even if selected indirectly.
- Distributed across 18 Reasoning chapters: Seating Arrangement - Linear
  (124), Reasoning - Miscellaneous (95), Syllogism (68), Blood Relation (62),
  Month Based Puzzles (52), Circle Based Arrangements (49), Certain Person
  Based Puzzles (47), Box Based Puzzles (38), Floor Based Puzzles (37),
  Inequality (34), Direction Sense (34), Order and Ranking (24), Square Based
  Arrangements (21), Year & Base Year Based Puzzles (12), Day Based Puzzles
  (9), Data Sufficiency (6), Coding-Decoding (5), Triangle/Pentagon/Hexagon
  Based Arrangements (4), Rectangular Based Arrangements (4).
- Web UI: `MasterVault.tsx` gained a "Scored practice" / "Browse drill" mode
  toggle; drill mode renders `DrillBrowse.tsx` — chapter tabs, prev/next
  question nav, lettered options with no correctness shown, and a
  "Watch solution ↗" link out to the YouTube explanation. **Not yet ported
  to mobile.**

Parsing pipeline notes (for future re-runs on similar source material):
- `pypdf` page text + `/Annots → /A → /URI` extraction for the embedded
  solution-video hyperlinks (the PDF has no plain-text answer key at all).
- Self-contained Syllogism/Inequality questions were initially silently
  mis-grouped under whatever unrelated puzzle preceded them on the page
  sequence (no passage of their own). Fixed by detecting the
  `statements...conclusions` signature and splitting those out into their
  own passage-less groups before classification — this alone corrected 98
  mis-tagged questions and dropped the "Miscellaneous" fallback rate from
  ~30% to ~9.5% of groups.

## Mobile Bug Fix — Upload Crash

Fixed a production crash on the Android app: "Method readAsStringAsync
imported from 'expo-file-system' is deprecated." Expo SDK 58's default
`expo-file-system` export dropped `readAsStringAsync`/`EncodingType`; fixed
by importing from `expo-file-system/legacy` instead, across the 3 call
sites (`HomeScreen.tsx`, `VaultListScreen.tsx`, `VaultDetailScreen.tsx`).

## Conventions Established

- **Backend deploy safety**: verify every Python change with a fresh-process
  import (`python3 -I -c "import src.main"`) before deploying — a cold
  Lambda hits import-order errors a long-lived dev session can mask.
- **Shared submodule workflow**: commit/push `pariksha-shared` first, then
  `git pull` inside each app's `shared/` submodule dir, then commit the
  updated submodule pointer in the parent repo (web + mobile both).
- **UI redesign previews**: for any visual redesign, build a static HTML
  mockup into `~/Downloads/` for approval before implementing for real.
- **EAS build verification**: before handing over an install link, confirm
  `npx eas-cli build:view <id>` shows `finished` and that its commit hash
  matches the fix/feature's actual commit.
