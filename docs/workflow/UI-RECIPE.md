# UI RECIPE

- UI direction: `docs/workflow/UI-DIRECTION.md`
- UI spec: `docs/workflow/UI-SPEC.md`
- Recipe: `semantic-shell`
- Recipe title: `Semantic page shell`
- Framework: `Custom`
- UI system: `custom`
- Prototype mode: `semantic-html-first`

## Why This Recipe

- `Use for any new page, dashboard, settings screen, or content workspace.`
- `header/nav -> main -> primary action lane -> secondary rail or footer`
- `Start with landmarks and one obvious primary action before decorative treatment.`

## Semantic Prototype

```html
<main>
  <header>
    <h1>Operations overview</h1>
    <p>Start with landmarks and one obvious primary action before decorative treatment.</p>
  </header>

  <section>
    <h2>Semantic page shell</h2>
    <p>header/nav -> main -> primary action lane -> secondary rail or footer</p>
  </section>
</main>
```

## Stack Scaffold

```html
export default function SemanticPageShellPage() {
  return (
    <main>
      <header>
        <h1>Operations overview</h1>
        <p>Start with landmarks and one obvious primary action before decorative treatment.</p>
      </header>

      <section aria-labelledby="recipe-title">
        <h2 id="recipe-title">Semantic page shell</h2>
        <p>header/nav -> main -> primary action lane -> secondary rail or footer</p>
      </section>
    </main>
  );
}
```

## Target Files

- `src/pages/index.tsx`
- `components/SemanticPageShell.module.css`

## Translation Notes

- `Start from the Operator Dense taste signature: quiet precision with dense information and strong alignment; compact but breathable; micro-motion only for state change, selection, and live status; default to even less motion if the stack lacks dedicated motion primitives.`
- `Keep the semantic contract explicit before translating to custom primitives.`
- `Prefer shared components from the detected inventory (package, Card, Table, package) before adding page-local abstractions.`
- `Advanced settings and expandable sections: Use <details>/<summary> for first-pass behavior, then wrap only if the repo needs extra control.`
- `Status, success, and recovery messaging: Use output/aria-live plus one shared toast helper instead of page-local success banners.`

## Native-First Recommendations

- `Advanced settings and expandable sections` -> details + summary -> Use <details>/<summary> for first-pass behavior, then wrap only if the repo needs extra control.
- `Status, success, and recovery messaging` -> output + aria-live + progress/meter where relevant -> Use output/aria-live plus one shared toast helper instead of page-local success banners.

## Verification Plan

- `rai ui-review`
- `rai verify-browser --smoke`

## Acceptance Checklist

- [ ] Primary action is obvious within 3 seconds of opening the screen.
- [ ] Typography, spacing, radius, and shadows feel systematic across touched surfaces.
- [ ] The implemented tokens match the chosen taste profile (Operator Dense).
- [ ] Loading, empty, error, success, and destructive states exist where the feature needs them.
- [ ] The selected recipe can be translated to the repo UI stack without losing the semantic contract.
- [ ] The scaffold covers the primary path plus the state variants this surface needs.
