# STATE ATLAS

- Workflow root: `docs/workflow`
- Product surface: `Dashboard`
- Product category: `Analytics Platform`
- State families: `9`
- Required in first pass: `loading, empty, filtered-empty, error, success, destructive-confirmation`

## State Families

### Loading shell

- Id: `loading`
- Priority: `required`
- Applies to: Any async screen or panel before data lands.
- Evidence signals: `loading`
- Guidance: Use skeletons or layout-preserving placeholders so hierarchy does not jump.
- Copy rule: If loading may exceed a short beat, explain what is being prepared.
- Recovery: Offer passive progress first; avoid spinner-only dead air.

### Empty state

- Id: `empty`
- Priority: `required`
- Applies to: First-use screens, cleared workspaces, or zero-data surfaces.
- Evidence signals: `empty`
- Guidance: Explain what the page is for and provide one obvious next step.
- Copy rule: Use calm, specific language instead of joke copy.
- Recovery: Give users a primary action, sample data, or clear setup path.

### Filtered empty

- Id: `filtered-empty`
- Priority: `required`
- Applies to: Search, filters, faceted views, and narrowed result sets.
- Evidence signals: `empty, interaction`
- Guidance: Differentiate no-results from first-use empty; keep reset actions close.
- Copy rule: State which filter or query caused the empty result if possible.
- Recovery: Offer clear reset, broaden search, or remove-filter actions.

### Error recovery

- Id: `error`
- Priority: `required`
- Applies to: Failed fetches, broken actions, and unavailable downstream systems.
- Evidence signals: `error`
- Guidance: Make the failure visible, explain the next safe action, and preserve user context.
- Copy rule: Say what failed and what the user can try next.
- Recovery: Provide retry, alternative path, or support escalation.

### Partial data

- Id: `partial-data`
- Priority: `important`
- Applies to: Dashboards, multi-panel pages, or degraded-but-usable surfaces.
- Evidence signals: `error, loading`
- Guidance: Show what is still usable and isolate the degraded area instead of blanking the whole page.
- Copy rule: Identify which region is stale, delayed, or unavailable.
- Recovery: Offer panel-level retry or refresh without destroying the rest of the view.

### Success confirmation

- Id: `success`
- Priority: `required`
- Applies to: Create, save, submit, publish, or complete flows.
- Evidence signals: `success`
- Guidance: Confirm completion and surface the next meaningful action.
- Copy rule: Prefer specific completion language over a generic “done”.
- Recovery: If reversible, pair the confirmation with undo or view-details affordances.

### Destructive confirmation

- Id: `destructive-confirmation`
- Priority: `required`
- Applies to: Delete, revoke, archive, disconnect, or irreversible actions.
- Evidence signals: `interaction, error`
- Guidance: Slow users down just enough to confirm impact and recovery options.
- Copy rule: Name exactly what will be lost and whether it is reversible.
- Recovery: Offer cancel, secondary safeguards, or undo when available.

### Offline or reconnecting

- Id: `offline`
- Priority: `important`
- Applies to: Apps with async sync, live data, or remote saves.
- Evidence signals: `error`
- Guidance: Make connection state legible without hijacking the whole interface.
- Copy rule: State whether work is queued, stale, or blocked.
- Recovery: Offer reconnect guidance and protect unsaved work where possible.

### Permission or access block

- Id: `permissions`
- Priority: `important`
- Applies to: Admin, billing, settings, and restricted tools.
- Evidence signals: `error`
- Guidance: Explain the access boundary and the next escalation path.
- Copy rule: State missing permission in plain language.
- Recovery: Offer request-access, switch-account, or contact-admin paths.

## Screen Coverage

### Primary screen blueprint

- Blueprint: Header -> summary/hero -> main work area -> secondary rail -> evidence/state zone.
- States: `loading, empty, filtered-empty, error`

### Detail screen blueprint

- Blueprint: Sticky title row -> content stack -> related actions -> audit/supporting metadata.
- States: `loading, empty, filtered-empty, error, success, destructive-confirmation`

### Split-pane operations view

- Blueprint: Left filter/table pane -> right detail/inspector pane -> sticky command bar.
- States: `loading, empty, filtered-empty, error, success, partial-data, permissions`

## Atlas Guidance

- First pass should land all required states before decorative polish.
- When a state belongs to one panel, isolate it there instead of blanking the entire screen.
- Every success or failure state should point users to the next safe action.
