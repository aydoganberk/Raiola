# UI DIRECTION

- Workflow root: `docs/workflow`
- Archetype: `control-plane`
- Framework/UI stack: `Custom / custom / custom`
- Taste profile: `Operator Dense` (source: `inferred`)
- Taste signature: `quiet precision with dense information and strong alignment; compact but breathable; micro-motion only for state change, selection, and live status; default to even less motion if the stack lacks dedicated motion primitives.`

## Product Direction

- High-signal operational UI with dense data, fast scanning, and powerful states.

## External Design DNA

- Product category: `Analytics Platform`
- Reference blend: `Linear Precision structure + VoltAgent Command Energy type cues + VoltAgent Command Energy accent restraint`
- North star: Data-heavy products need dense but legible hierarchy, evidence rails, and stable state design.
- `Linear Precision` -> Precise hierarchy, thin borders, disciplined density, and confident restraint.
- `VoltAgent Command Energy` -> Dark command-center focus, signal-color discipline, and architecture-first storytelling.
- `Cohere Data-Rich` -> Enterprise credibility, data-forward composition, and restrained gradient energy.

## Experience Thesis

- Title: `Operator Dense control-plane`
- Thesis: Build a control-plane experience that feels quiet precision with dense information and strong alignment while remaining implementation-friendly for Custom.
- Signature: Fast scanning, anchored context rails, and operator confidence beat decorative novelty.
- Execution bias: Codex should bias toward reusable shells, tokenized primitives, and repeatable state patterns instead of one-off flourishes.

## Taste Signature

- Visual tone: `quiet precision with dense information and strong alignment`
- Density: `compact but breathable`
- Motion: `micro-motion only for state change, selection, and live status; default to even less motion if the stack lacks dedicated motion primitives`
- Hierarchy: `sticky shell, obvious priorities, and stable summary rails`

## Signature Moments

### Anchored hero moment

- Give each primary screen one unmistakable anchor: a hero metric rail, authored hero block, or command surface.

### State polish

- Loading, empty, success, and destructive states should feel intentionally designed, not leftover scaffolding.

### Operator summary rail

- A fixed summary lane should keep risk, status, and next action visible as users inspect detail panes.

## Screen Blueprints

### Primary screen blueprint

- Header -> summary/hero -> main work area -> secondary rail -> evidence/state zone.

### Detail screen blueprint

- Sticky title row -> content stack -> related actions -> audit/supporting metadata.

### Split-pane operations view

- Left filter/table pane -> right detail/inspector pane -> sticky command bar.

## Motion System

- Principle: micro-motion only for state change, selection, and live status
- Use fast enter/exit transitions to clarify hierarchy and preserve perceived responsiveness.
- Reserve richer motion for one signature surface per screen; keep the rest utilitarian.
- Default to CSS-native transitions unless the stack already ships a motion primitive.
- Timing: `micro: 120-160ms`
- Timing: `standard: 180-240ms`
- Timing: `large surface changes: 240-320ms`

## Copy Voice

- Tone: Operator Dense copy: concise, directive, confident, and low-noise.
- Do: Prefer short action labels and concrete status language.
- Do: Use helper text to reduce ambiguity, not to narrate obvious UI.
- Do: Keep empty and success states useful, not cute for the sake of it.
- Do: Operational copy should be brief, high-signal, and easy to scan in dense layouts.
- Avoid: Do not over-explain routine interactions.
- Avoid: Do not mix multiple brand voices on the same screen.

## Design Tokens

- typeScale: `tight UI scale with restrained display sizes`
- radius: `8-12px radius with crisp corners on dense controls`
- spacing: `8px grid with 16/24 section rhythm`
- surfaces: `matte surfaces, thin borders, quiet elevation`
- contrast: `high information contrast with restrained chroma`
- accentStrategy: `one action accent plus semantic states`
- archetype: `control-plane`
- frameworkBias: `Custom`
- uiSystem: `custom`

## Component Cues

- Data tables and split panes beat oversized cards.
- Command bars, summary rails, and scoped filters should feel native.
- Important metrics deserve fixed positions instead of decorative reshuffling.

## Interaction Cues

- Keyboard and hover states must be obvious but not flashy.
- Selections and in-progress states should be visible at a glance.

## Design Principles

- Prefer one dominant visual idea per screen instead of stacking unrelated flourishes.
- Use spacing and typography before borders, shadows, or color noise.
- Every surface should explain its state: loading, empty, success, partial, destructive, and offline where relevant.
- Preserve interaction hierarchy: one obvious primary action, quiet secondary actions, hidden tertiary actions.
- Keep layout rhythm stable across breakpoints so Codex can patch confidently without fragile one-off CSS.
- Favor dense but legible tables, split panes, command bars, and sticky context.
- Promote critical metrics into stable summary rails; do not bury risk behind accordions.
- Data tables and split panes beat oversized cards.
- Command bars, summary rails, and scoped filters should feel native.

## Preferred Patterns

- Shells: sticky page header + context summary + one primary action zone.
- States: every async panel gets skeleton + empty + error + success variants.
- Lists & tables: reserve compact density for scanning, not for decorative crowding.
- Forms: inline validation, progressive disclosure, and clear destructive affordances.
- Navigation: consistent active state, location memory, and keyboard-friendly command affordances.
- Translate taste into tokens early: typeScale=tight UI scale with restrained display sizes | radius=8-12px radius with crisp corners on dense controls | spacing=8px grid with 16/24 section rhythm | surfaces=matte surfaces, thin borders, quiet elevation | contrast=high information contrast with restrained chroma | accentStrategy=one action accent plus semantic states.
- Lean on existing component inventory first: Button, Card, package, Table.
- Use multi-row cards sparingly; data-dense screens benefit from stable tabular or split-pane layouts.

## Anti-Patterns

- Do not mix multiple visual metaphors on one screen.
- Do not hide core actions in tertiary menus when the task is frequent.
- Do not use color as the only state signal.
- Do not add gradients/shadows/radii without a consistent token story.
- Do not let loading/empty/error states regress behind the happy path.
- Do not waste vertical space with oversized chrome.
- Avoid decorative gradients that reduce scan speed.
- Avoid oversized cards that waste vertical space and slow operator scanning.
- Contract ban: Do not replace data relationships with oversized decorative cards.
- Contract ban: Do not bury status, risk, or primary actions below fold-heavy hero chrome.
- Contract ban: Do not mix multiple visual metaphors on one screen.
- Contract ban: Do not hide core actions in tertiary menus when the task is frequent.

## Style Guardrails

- Do not waste vertical space with oversized chrome.
- Avoid decorative gradients that reduce scan speed.
- Prefer consistency across all touched surfaces over one standout component that breaks the system.
- Scan speed beats novelty on operator-critical screens.

## Differentiators

- The product should feel like a operator dense system, not a generic component library assembly.
- Signature moments should come from hierarchy, state design, and composition before visual effects.
- Dense operational screens should still feel premium through rhythm, typography, and stable rails.

## Design System Actions

- Encode Operator Dense through tokens first: typeScale=tight UI scale with restrained display sizes | radius=8-12px radius with crisp corners on dense controls | spacing=8px grid with 16/24 section rhythm | surfaces=matte surfaces, thin borders, quiet elevation | contrast=high information contrast with restrained chroma | accentStrategy=one action accent plus semantic states.
- Refactor repeated utility piles into semantic wrappers or shared primitives once patterns repeat.
- Keep custom primitives, but restyle density, radius, spacing, and typography systematically.

## Semantic Guardrails

- Prefer semantic landmarks (`header`, `nav`, `main`, `section`, `article`, `footer`) before anonymous wrapper stacks.
- Reach for `button`, `a`, `label`, `fieldset`, `dialog`, `details`, `table`, `progress`, `meter`, and `output` before custom div-based interactions.
- If a pattern repeats more than twice, extract a small named primitive or semantic wrapper instead of cloning utility piles.
- Write the state contract first: loading, empty, error, success, disabled, and recovery paths are first-class UI.
- Preserve keyboard, focus, and dismissal behavior as part of the design contract, not as post-polish cleanup.
- When data is relational, real table semantics and stable summary rails beat decorative card farms.

## Native-First Decision Matrix

### Relational data views

- Native first: `table + thead + tbody`
- Use when: Use for operator lists, audit logs, comparison screens, and anything row/column driven.
- Why: Real table semantics preserve scan speed, keyboard expectations, and accessible structure.
- Stack translation: Prefer <table>/<thead>/<tbody> before composing custom grid chrome.

### Confirm, edit, or drill-in overlays

- Native first: `dialog`
- Use when: Use for confirm flows, inline editing overlays, inspectors, and focused task interruptions.
- Why: A dialog contract keeps dismissal, focus return, and escape behavior predictable.
- Stack translation: Start from <dialog> or a very thin wrapper before introducing custom portal choreography.

### Advanced settings and expandable sections

- Native first: `details + summary`
- Use when: Use when secondary metadata, FAQs, advanced filters, or low-frequency settings expand inline.
- Why: Disclosure primitives reduce custom JS and make collapsed vs expanded state explicit.
- Stack translation: Use <details>/<summary> for first-pass behavior, then wrap only if the repo needs extra control.

### Forms and inline validation

- Native first: `label + input/select/textarea + fieldset`
- Use when: Use for settings, onboarding, account flows, and any form that needs clear helper and error copy.
- Why: Native form semantics keep labels, validation, and keyboard flow resilient before styling decisions compound.
- Stack translation: Start with label/input/select/fieldset semantics and add wrappers only when repeated patterns emerge.

### Secondary actions and contextual menus

- Native first: `button + popover/menu`
- Use when: Use for row actions, filter menus, split buttons, and compact secondary command surfaces.
- Why: Button-targeted menus make trigger ownership and dismissal rules easier to standardize.
- Stack translation: Start with button + popover/menu semantics rather than bespoke trays and invisible div click zones.

### Status, success, and recovery messaging

- Native first: `output + aria-live + progress/meter where relevant`
- Use when: Use for save/delete/retry flows, async jobs, uploads, and transient result messaging.
- Why: Status feedback becomes easier to reuse when message semantics are explicit before the toast/banner styling layer.
- Stack translation: Use output/aria-live plus one shared toast helper instead of page-local success banners.

## Recipe Pack

### Semantic page shell

- Use when: Use for any new page, dashboard, settings screen, or content workspace.
- Structure: header/nav -> main -> primary action lane -> secondary rail or footer
- Implementation bias: Start with landmarks and one obvious primary action before decorative treatment.

### Async state cluster

- Use when: Use whenever a screen loads remote data, saves, retries, or can become empty.
- Structure: loading skeleton -> empty state -> error/recovery state -> success confirmation
- Implementation bias: Implement all four states together so the happy path does not monopolize polish.

### Form card / settings section

- Use when: Use for settings, onboarding, account forms, and edit panels.
- Structure: section header -> labeled fields -> helper/error copy -> action row
- Implementation bias: Keep labels, helper text, and validation semantics explicit before spacing polish.

### Filter -> table -> inspector

- Use when: Use for admin, ops, queues, audit, or review-heavy surfaces.
- Structure: filter bar -> relational table -> sticky detail/inspector pane -> action/status rail
- Implementation bias: Favor true table semantics and predictable inspector behavior over oversized summary cards.

### Command + summary rail

- Use when: Use when operators need risk, next action, and status visible while scanning detail.
- Structure: top command lane -> summary metrics -> main work area -> evidence/status rail
- Implementation bias: Keep scan speed ahead of novelty and let the summary rail anchor decision-making.

### Prototype -> translation lane

- Use when: Use when the repo lacks a strong shared UI system or a new surface is still ambiguous.
- Structure: semantic HTML prototype -> approval snapshot -> thin shared primitive extraction -> stack translation
- Implementation bias: Reduce churn by settling hierarchy and state semantics before framework-specific styling expands.

## Prototype Mode

- Recommended: `yes`
- Mode: `semantic-html-first`
- Rationale: Start with a semantic HTML/CSS prototype to settle hierarchy, state coverage, and native interaction contracts before stack translation.
- Entry strategy: Prototype the shell, state variants, and one primary flow with low-JS semantic primitives, then translate only after the structure feels stable.
- Deliverable: Prototype shell with semantic landmarks and one primary action lane.
- Deliverable: Loading, empty, error, and success states captured before visual polish.
- Deliverable: Translation notes that map each native primitive to the target stack equivalent.
- Handoff: Freeze hierarchy and state behavior before translating to repo-local components.
- Handoff: Map native primitives to the target UI stack deliberately instead of re-inventing them page by page.
- Handoff: Re-run browser/UI review after translation so the semantic contract survives the final polish layer.

## Codex Implementation Recipes

- Start each frontend task by restating the design direction in one sentence: "quiet precision with dense information and strong alignment; compact but breathable; micro-motion only for state change, selection, and live status; default to even less motion if the stack lacks dedicated motion primitives."
- Lock the token posture early: typeScale=tight UI scale with restrained display sizes | radius=8-12px radius with crisp corners on dense controls | spacing=8px grid with 16/24 section rhythm | surfaces=matte surfaces, thin borders, quiet elevation | contrast=high information contrast with restrained chroma | accentStrategy=one action accent plus semantic states.
- When adding a screen, first patch the shell, state model, and responsive layout, then fill in decorative polish last.
- Prefer editing existing primitives and tokens over introducing bespoke one-off components.
- When a diff changes visuals, also patch empty/loading/error/success states in the same pass if they share the component.
- End every UI slice with a concise visual QA checklist and the exact browser review command.
- For operational surfaces, prefer composable table/filter/panel primitives over custom dashboard art direction.
- If the screen is still ambiguous, prototype it in semantic HTML/CSS first and translate only after the shell and state model stabilize.

## Codex Implementation Prompts

- Build the shell so it reads as "quiet precision with dense information and strong alignment; compact but breathable; micro-motion only for state change, selection, and live status; default to even less motion if the stack lacks dedicated motion primitives." before adding decorative polish.
- Land at least one signature moment from the chosen archetype (control-plane) in the first pass.
- Use Operator Dense tokens as the decision rule whenever multiple UI options appear valid.
- Patch state coverage and responsive behavior in the same diff as visual changes whenever possible.

## Acceptance Checklist

- [ ] Primary action is obvious within 3 seconds of opening the screen.
- [ ] Typography, spacing, radius, and shadows feel systematic across touched surfaces.
- [ ] The implemented tokens match the chosen taste profile (Operator Dense).
- [ ] Loading, empty, error, success, and destructive states exist where the feature needs them.
- [ ] Responsive behavior keeps hierarchy intact at narrow and wide breakpoints.
- [ ] Accessibility semantics remain intact for headings, labels, focus, and status messaging.
- [ ] Dense data views remain scannable without horizontal chaos or oversized chrome.
