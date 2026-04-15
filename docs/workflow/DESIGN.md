# DESIGN SYSTEM

## 1. Visual Theme & Atmosphere

This product should feel like quiet precision with dense information and strong alignment; compact but breathable; micro-motion only for state change, selection, and live status; default to even less motion if the stack lacks dedicated motion primitives.. Use Linear Precision structure + VoltAgent Command Energy type cues + VoltAgent Command Energy accent restraint as the reference blend, keep the dashboard goal centered, and let product truth plus state clarity beat generic template polish.

## 2. Color Palette & Roles

- **Primary Accent** (`#2563eb`): Primary CTA, links, selection state
- **Accent Soft** (`#dbeafe`): Tinted backgrounds, support emphasis
- **Secondary Accent** (`#059669`): Charts, secondary emphasis, comparison cues
- **Background** (`#0b1220`): Page canvas
- **Surface** (`#111a2b`): Cards, panels, raised surfaces
- **Text** (`#e6edf7`): Primary headings and body text
- **Muted** (`#8a99b2`): Metadata, helper copy, supporting labels
- **Border** (`#25324a`): Containment, dividers, input boundaries
- **Success** (`#059669`): Success states and confirmations
- **Warning** (`#d97706`): Warning states
- **Danger** (`#dc2626`): Destructive and error states
- Notes: Use #2563eb as the main action accent and keep all other chroma subordinate to the operator dense surface system.

## 3. Typography Rules

- Display family: `Manrope`
- Body family: `Manrope`
- Monospace family: `IBM Plex Mono`
- Notes: Neutral precision with strong UI readability and clean dashboard rhythm.
- Display: Manrope at 48-64px with compressed but readable line-height for hero or primary headers.
- Section heading: Manrope or Manrope at 28-36px with strong contrast from body copy.
- Body: Manrope at 16-18px with calm line-height and no gimmicky letter-spacing.
- Meta/code: IBM Plex Mono for technical labels, snippets, and compact evidence surfaces.

## 4. Component Stylings

- Buttons: primary actions use #2563eb with the Operator Dense surface discipline; secondary actions stay quieter but clearly interactive.
- Cards and sections: follow the token posture (typeScale=tight UI scale with restrained display sizes | radius=8-12px radius with crisp corners on dense controls | spacing=8px grid with 16/24 section rhythm | surfaces=matte surfaces, thin borders, quiet elevation | contrast=high information contrast with restrained chroma | accentStrategy=one action accent plus semantic states | archetype=control-plane | frameworkBias=Custom | uiSystem=custom) before introducing page-local styling exceptions.
- Inputs and filters: labels and helper copy must stay explicit; validation states should use semantic color plus text, never color alone.
- Navigation: preserve a strong active state and obvious action lane on dashboard surfaces.

## 5. Layout Principles

- Use the dashboard section order as the default layout spine.
- Spacing should follow 8px grid with 16/24 section rhythm and avoid improvised page-local gaps.
- Let section rhythm and hierarchy do more work than visual decoration.
- Keep responsive collapse behavior intentional for Summary rail and the primary CTA zone.

## 6. Depth & Elevation

- Subtle downward elevation with crisp borders and low chroma.
- Borders and surface layering should reinforce sticky shell, obvious priorities, and stable summary rails.
- Reserve the richest elevation for one emphasis surface per screen family.

## 7. Do's and Don'ts

- Do: Start from Linear Precision hierarchy before adding expressive details.
- Do: Use Operator Dense tokens and analytics platform expectations as the decision rule for new components.
- Do: Reference Linear Precision, VoltAgent Command Energy, Cohere Data-Rich for composition cues, not for literal cloning.
- Do: Patch loading, empty, error, and success coverage in the same pass as visual polish whenever possible.
- Do: Keep labels short, directive, and high-signal.
- Do: Use helper text only where it reduces ambiguity or risk.
- Do: Primary metrics should stay anchored, not move around between breakpoints.
- Do: Operational trust comes from visible state handling more than decorative polish.
- Don't: Do not replace data relationships with oversized decorative cards.
- Don't: Do not bury status, risk, or primary actions below fold-heavy hero chrome.
- Don't: Do not mix multiple visual metaphors on one screen.
- Don't: Do not hide core actions in tertiary menus when the task is frequent.
- Don't: Do not replace relational data with decorative cards when comparison matters.
- Don't: Do not bury risk and action behind accordions or hidden secondary tabs.

## 8. Responsive Behavior

- Protect scan order on tablet and mobile before preserving every desktop column.
- Collapsed layouts should preserve summary rail, filters, and selected record context.
- Required state families to preserve across breakpoints: loading, empty, filtered-empty, error, success, destructive-confirmation.
- Keep the primary CTA or next action visible before tertiary content on small screens.

## 9. Agent Prompt Guide

- Build a dashboard that feels "quiet precision with dense information and strong alignment; compact but breathable; micro-motion only for state change, selection, and live status; default to even less motion if the stack lacks dedicated motion primitives.".
- Respect this reference blend: Linear Precision structure + VoltAgent Command Energy type cues + VoltAgent Command Energy accent restraint.
- Use these sections by default: Summary rail -> Filters and scoped controls -> Main data surface -> Detail inspector -> Activity or evidence lane.
- Do not skip required state families: loading, empty, filtered-empty, error, success, destructive-confirmation.
- If the output starts to look generic, tighten hierarchy, typography, and product proof before adding effects.
