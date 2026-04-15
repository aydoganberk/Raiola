# UI SPEC

- Workflow root: `docs/workflow`
- Framework: `Custom`
- UI system: `custom`
- Frontend mode: `inactive`
- UI direction: `docs/workflow/UI-DIRECTION.md`
- Design DNA: `docs/workflow/DESIGN-DNA.md`
- State atlas: `docs/workflow/STATE-ATLAS.md`
- Page blueprint: `docs/workflow/PAGE-BLUEPRINT.md`
- DESIGN.md export: `docs/workflow/DESIGN.md`
- Component strategy: `docs/workflow/COMPONENT-STRATEGY.md`
- Design benchmark: `docs/workflow/DESIGN-BENCHMARK.md`
- Taste profile: `Operator Dense`
- Taste signature: `quiet precision with dense information and strong alignment; compact but breathable; micro-motion only for state change, selection, and live status; default to even less motion if the stack lacks dedicated motion primitives.`

## Information Architecture

- `Product archetype: control-plane`
- `Primary UI surface depends on Custom with custom as the main UI system.`
- `Touched files context: - `Fill this when a workflow milestone opens``

## Design Direction

- `High-signal operational UI with dense data, fast scanning, and powerful states.`
- `Visual tone: quiet precision with dense information and strong alignment`
- `Hierarchy: sticky shell, obvious priorities, and stable summary rails`
- `Motion: micro-motion only for state change, selection, and live status; default to even less motion if the stack lacks dedicated motion primitives`
- `Taste profile source: inferred`
- `Codex should respect the UI direction document before improvising new aesthetics.`

## External Design DNA

- `Product category: Analytics Platform`
- `Reference blend: Linear Precision structure + VoltAgent Command Energy type cues + VoltAgent Command Energy accent restraint`
- `North star: Data-heavy products need dense but legible hierarchy, evidence rails, and stable state design.`
- `Linear Precision` -> Precise hierarchy, thin borders, disciplined density, and confident restraint.
- `VoltAgent Command Energy` -> Dark command-center focus, signal-color discipline, and architecture-first storytelling.
- `Cohere Data-Rich` -> Enterprise credibility, data-forward composition, and restrained gradient energy.
- `Rule: Start from Linear Precision hierarchy before adding expressive details.`
- `Rule: Use Operator Dense tokens and analytics platform expectations as the decision rule for new components.`
- `Rule: Reference Linear Precision, VoltAgent Command Energy, Cohere Data-Rich for composition cues, not for literal cloning.`
- `Rule: Patch loading, empty, error, and success coverage in the same pass as visual polish whenever possible.`
- `Rule: If the screen starts to look like a generic template, tighten type rhythm, section hierarchy, and proof surfaces before adding new effects.`
- `Ban: Do not replace data relationships with oversized decorative cards.`
- `Ban: Do not bury status, risk, or primary actions below fold-heavy hero chrome.`
- `Ban: Do not mix multiple visual metaphors on one screen.`
- `Ban: Do not hide core actions in tertiary menus when the task is frequent.`
- `Ban: Do not use color as the only state signal.`
- `Ban: Do not add gradients/shadows/radii without a consistent token story.`

## Experience Thesis

- `Operator Dense control-plane`
- `Build a control-plane experience that feels quiet precision with dense information and strong alignment while remaining implementation-friendly for Custom.`
- `Fast scanning, anchored context rails, and operator confidence beat decorative novelty.`

## Signature Moments

- `Anchored hero moment: Give each primary screen one unmistakable anchor: a hero metric rail, authored hero block, or command surface.`
- `State polish: Loading, empty, success, and destructive states should feel intentionally designed, not leftover scaffolding.`
- `Operator summary rail: A fixed summary lane should keep risk, status, and next action visible as users inspect detail panes.`

## Page Blueprint

- `Page type: Dashboard`
- `Primary outcome: Support fast scanning, decisions, and safe next actions.`
- `Summary rail` -> Expose the top metrics, risk, and next action immediately. | states: loading, partial-data, success
- `Filters and scoped controls` -> Let users narrow data without losing orientation. | states: filtered-empty
- `Main data surface` -> Support scanning, comparison, and prioritization. | states: loading, empty, filtered-empty, error, partial-data
- `Detail inspector` -> Keep the selected record or panel visible without forcing hard navigation. | states: loading, success, destructive-confirmation, permissions
- `Activity or evidence lane` -> Make timeline, logs, or recent changes easy to inspect in context. | states: loading, empty, error

## Component Strategy

- `Reuse Table` -> Table already overlaps main data surface and should be reused before adding page-local UI.
- `Build Summary rail` -> hero/proof section shell
- `Build Filters and scoped controls` -> filter/search control bar
- `Build Detail inspector` -> detail panel or dialog primitive
- `Build Activity or evidence lane` -> timeline or stepper block
- `Build the shared async-state family` -> loading / empty / error / success primitives

## Design Benchmark

- `Anchored hero moment` -> Give each primary screen one unmistakable anchor: a hero metric rail, authored hero block, or command surface.
- `Lead with product proof` -> Primary metrics should stay anchored, not move around between breakpoints.
- `Borrow from Linear Precision` -> Use crisp containment and obvious hierarchy instead of oversized chrome.
- `Differentiate through structure` -> Ship build summary rail as a shared system primitive, not a page-local one-off.
- `Constrain motion` -> Reserve motion for state change, selection, and live status.
- `Avoid: Do not replace relational data with decorative cards when comparison matters.`
- `Avoid: Do not bury risk and action behind accordions or hidden secondary tabs.`
- `Avoid: Do not replace data relationships with oversized decorative cards.`
- `Avoid: Do not bury status, risk, or primary actions below fold-heavy hero chrome.`

## Screen Blueprints

- `Primary screen blueprint: Header -> summary/hero -> main work area -> secondary rail -> evidence/state zone.`
- `Detail screen blueprint: Sticky title row -> content stack -> related actions -> audit/supporting metadata.`
- `Split-pane operations view: Left filter/table pane -> right detail/inspector pane -> sticky command bar.`

## Native-First Decisions

- `Relational data views` -> table + thead + tbody -> Prefer <table>/<thead>/<tbody> before composing custom grid chrome.
- `Confirm, edit, or drill-in overlays` -> dialog -> Start from <dialog> or a very thin wrapper before introducing custom portal choreography.
- `Advanced settings and expandable sections` -> details + summary -> Use <details>/<summary> for first-pass behavior, then wrap only if the repo needs extra control.
- `Forms and inline validation` -> label + input/select/textarea + fieldset -> Start with label/input/select/fieldset semantics and add wrappers only when repeated patterns emerge.
- `Secondary actions and contextual menus` -> button + popover/menu -> Start with button + popover/menu semantics rather than bespoke trays and invisible div click zones.
- `Status, success, and recovery messaging` -> output + aria-live + progress/meter where relevant -> Use output/aria-live plus one shared toast helper instead of page-local success banners.

## Recipe Pack

- `Semantic page shell` -> header/nav -> main -> primary action lane -> secondary rail or footer (Start with landmarks and one obvious primary action before decorative treatment.)
- `Async state cluster` -> loading skeleton -> empty state -> error/recovery state -> success confirmation (Implement all four states together so the happy path does not monopolize polish.)
- `Form card / settings section` -> section header -> labeled fields -> helper/error copy -> action row (Keep labels, helper text, and validation semantics explicit before spacing polish.)
- `Filter -> table -> inspector` -> filter bar -> relational table -> sticky detail/inspector pane -> action/status rail (Favor true table semantics and predictable inspector behavior over oversized summary cards.)
- `Command + summary rail` -> top command lane -> summary metrics -> main work area -> evidence/status rail (Keep scan speed ahead of novelty and let the summary rail anchor decision-making.)
- `Prototype -> translation lane` -> semantic HTML prototype -> approval snapshot -> thin shared primitive extraction -> stack translation (Reduce churn by settling hierarchy and state semantics before framework-specific styling expands.)

## Prototype Mode

- `Recommended: yes`
- `Mode: semantic-html-first`
- `Rationale: Start with a semantic HTML/CSS prototype to settle hierarchy, state coverage, and native interaction contracts before stack translation.`
- `Entry strategy: Prototype the shell, state variants, and one primary flow with low-JS semantic primitives, then translate only after the structure feels stable.`
- `Prototype deliverable: Prototype shell with semantic landmarks and one primary action lane.`
- `Prototype deliverable: Loading, empty, error, and success states captured before visual polish.`
- `Prototype deliverable: Translation notes that map each native primitive to the target stack equivalent.`
- `Handoff: Freeze hierarchy and state behavior before translating to repo-local components.`
- `Handoff: Map native primitives to the target UI stack deliberately instead of re-inventing them page by page.`
- `Handoff: Re-run browser/UI review after translation so the semantic contract survives the final polish layer.`

## User Flows

- `- Primary request:
  - `Fill this when a milestone opens`
- Why this matters now:
  - `Capture the user-facing reason before planning starts`
- In-scope outcome:
  - `Describe the smallest meaningful capability we are trying to land``
- `Primary flow should cover empty/loading/error/success states before ship.`
- `Journey coverage status: inconclusive (missing nav, main, heading, primaryAction, feedback)`

## Component Inventory

- `package` -> tests/fixtures/large-monorepo/packages/ui/package.json
- `Card` -> tests/fixtures/large-monorepo/packages/ui/src/Card.tsx
- `Table` -> tests/fixtures/large-monorepo/packages/ui/src/Table.tsx
- `package` -> tests/fixtures/medium-monorepo/packages/ui/package.json
- `Button` -> tests/fixtures/medium-monorepo/packages/ui/src/Button.tsx

## State Map

- `Detected missing states: loading, empty, error, success, disabled, interaction, form-validation, mobile-nav`
- `loading` should preserve layout stability
- `error` should expose recovery language
- `success` should confirm completion and next action

## State Atlas

- `Required state families: loading, empty, filtered-empty, error, success, destructive-confirmation`
- `Loading shell` -> Use skeletons or layout-preserving placeholders so hierarchy does not jump. | evidence: loading
- `Empty state` -> Explain what the page is for and provide one obvious next step. | evidence: empty
- `Filtered empty` -> Differentiate no-results from first-use empty; keep reset actions close. | evidence: empty, interaction
- `Error recovery` -> Make the failure visible, explain the next safe action, and preserve user context. | evidence: error
- `Partial data` -> Show what is still usable and isolate the degraded area instead of blanking the whole page. | evidence: error, loading
- `Success confirmation` -> Confirm completion and surface the next meaningful action. | evidence: success
- `Destructive confirmation` -> Slow users down just enough to confirm impact and recovery options. | evidence: interaction, error
- `Offline or reconnecting` -> Make connection state legible without hijacking the whole interface. | evidence: error
- `Permission or access block` -> Explain the access boundary and the next escalation path. | evidence: error
- `Screen: Primary screen blueprint` -> loading, empty, filtered-empty, error
- `Screen: Detail screen blueprint` -> loading, empty, filtered-empty, error, success, destructive-confirmation
- `Screen: Split-pane operations view` -> loading, empty, filtered-empty, error, success, partial-data, permissions

## Responsive Behavior

- `small 360px` -> No overflow, clipped text, or unreachable controls.
- `medium 768px` -> Adaptive layout still matches the intended information architecture.
- `large 1440px` -> Components align consistently and avoid over-stretching.

## Copy Tone

- `Operator Dense copy: concise, directive, confident, and low-noise.`
- `Do: Prefer short action labels and concrete status language.`
- `Do: Use helper text to reduce ambiguity, not to narrate obvious UI.`
- `Do: Keep empty and success states useful, not cute for the sake of it.`
- `Do: Operational copy should be brief, high-signal, and easy to scan in dense layouts.`
- `Avoid: Do not over-explain routine interactions.`
- `Avoid: Do not mix multiple brand voices on the same screen.`

## Accessibility Checklist

- `Semantic landmarks remain intact.`
- `Interactive controls expose labels and focus states.`
- `Color/contrast issues are reviewed during UI review.`
- `Accessibility audit verdict: inconclusive (0 issue signals)`

## Semantic Quality

- `Semantic audit verdict: fail (1 issue signals)`
- `table-structure` tests/fixtures/large-monorepo/packages/ui/src/Table.tsx -> Table markup should include both <thead> and <tbody> so relational data stays understandable to users and assistive tech.

## Design Token Usage

- `Styling layers: custom`
- `Prefer shared tokens/components before page-local styling.`
- `Token drift issues detected: 0`
- `Taste token targets: typeScale=tight UI scale with restrained display sizes | radius=8-12px radius with crisp corners on dense controls | spacing=8px grid with 16/24 section rhythm | surfaces=matte surfaces, thin borders, quiet elevation | contrast=high information contrast with restrained chroma | accentStrategy=one action accent plus semantic states | archetype=control-plane | frameworkBias=Custom | uiSystem=custom`
- `Component cues: Data tables and split panes beat oversized cards. | Command bars, summary rails, and scoped filters should feel native. | Important metrics deserve fixed positions instead of decorative reshuffling.`
- `Semantic guardrail: Prefer semantic landmarks (`header`, `nav`, `main`, `section`, `article`, `footer`) before anonymous wrapper stacks.`
- `Semantic guardrail: Reach for `button`, `a`, `label`, `fieldset`, `dialog`, `details`, `table`, `progress`, `meter`, and `output` before custom div-based interactions.`
- `Semantic guardrail: If a pattern repeats more than twice, extract a small named primitive or semantic wrapper instead of cloning utility piles.`
- `Semantic guardrail: Write the state contract first: loading, empty, error, success, disabled, and recovery paths are first-class UI.`
- `Semantic guardrail: Preserve keyboard, focus, and dismissal behavior as part of the design contract, not as post-polish cleanup.`
- `Semantic guardrail: When data is relational, real table semantics and stable summary rails beat decorative card farms.`
- `Encode Operator Dense through tokens first: typeScale=tight UI scale with restrained display sizes | radius=8-12px radius with crisp corners on dense controls | spacing=8px grid with 16/24 section rhythm | surfaces=matte surfaces, thin borders, quiet elevation | contrast=high information contrast with restrained chroma | accentStrategy=one action accent plus semantic states.`
- `Refactor repeated utility piles into semantic wrappers or shared primitives once patterns repeat.`
- `Keep custom primitives, but restyle density, radius, spacing, and typography systematically.`
- `Prompt: Build the shell so it reads as "quiet precision with dense information and strong alignment; compact but breathable; micro-motion only for state change, selection, and live status; default to even less motion if the stack lacks dedicated motion primitives." before adding decorative polish.`
- `Prompt: Land at least one signature moment from the chosen archetype (control-plane) in the first pass.`
- `Prompt: Use Operator Dense tokens as the decision rule whenever multiple UI options appear valid.`
- `Prompt: Patch state coverage and responsive behavior in the same diff as visual changes whenever possible.`

## Empty/Loading/Error/Success States

- `Missing state coverage for: loading, empty, error, success, disabled, interaction, form-validation, mobile-nav`

## Evidence Plan

- `Capture at least one browser verification artifact before closeout.`

## Primitive Opportunities

- `Clarify relational data surfaces` -> Model relational data with real table semantics first, then apply visual wrappers or advanced behaviors second. (Prefer real <table>/<thead>/<tbody> semantics before composing custom grid chrome.)

## Primitive Contracts

- `No primitive contract gaps were detected in the scanned UI files.`
