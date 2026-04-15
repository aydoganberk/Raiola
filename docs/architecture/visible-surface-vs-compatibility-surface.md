# Visible surface vs compatibility surface

Wave 4 reduced the root command surface from a large, drifting set to a smaller public entrypoint set. Wave 5 adds a guard so that reduction does not silently regress.

## Visible surface

The visible surface is the root `package.json` script list. This is the command surface new users see first.

Wave 5 keeps that surface at exactly 16 scripts:

- `release:cut`
- `release:notes`
- `test`
- `pack:smoke`
- `rai`
- `raiola-on`
- `rai:help`
- `rai:quickstart`
- `rai:start`
- `rai:do`
- `rai:next`
- `rai:verify`
- `rai:doctor`
- `rai:audit-repo`
- `rai:api-surface`
- `rai:repo-proof`

A regression test now fails if that visible set grows or drifts.

## Compatibility surface

The compatibility surface is the internal runtime catalog in `scripts/workflow/runtime_script_catalog.js`.

That catalog intentionally remains much larger because it absorbs:

- historical aliases
- internal workflow lanes
- migration shims
- compatibility entrypoints that should keep working but should not become top-level public commands

This keeps the public surface small without breaking older automation or internal workflow wiring.

## Rule of thumb

New workflow capability should usually follow this path:

1. add or extend an internal runtime catalog entry
2. wire it through the existing façade commands
3. document it inside the compatibility surface when needed

A new root script should only be introduced when it is worth expanding the product’s public command vocabulary.

## Why the guard matters

Without a guard, top-level commands slowly become the default extension point. That creates three problems:

- onboarding gets noisier
- the release surface becomes harder to explain
- compatibility shims leak into the public product shape

Wave 5 keeps the root surface intentionally small and treats the runtime catalog as the growth lane.
