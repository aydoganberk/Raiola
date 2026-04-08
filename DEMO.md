# Demo

## 1. Install the product shell

```bash
npx raiola setup
```

Expected outcome:

- `docs/workflow/` exists
- runtime scripts are installed under `scripts/workflow/`
- the repo can run `rai doctor`, `rai hud`, and `rai next`

## 2. Run the daily loop

```bash
rai doctor --strict
rai hud --compact
rai next
```

Expected outcome:

- the repo has a clean install surface
- the HUD summarizes current workflow state
- `next` suggests the safest next operator action

## 3. Start a quick task

```bash
rai quick start --goal "Fix a narrow regression"
```

Expected outcome:

- `.workflow/quick/context.md`
- `.workflow/quick/plan.md`
- `.workflow/quick/verify.md`
- `.workflow/quick/handoff.md`

## 4. Escalate to full workflow when needed

```bash
rai quick escalate --summary "This needs a broader plan" --open-full-workflow --milestone-id Q1
```

Expected outcome:

- the quick session is marked escalated
- full workflow intake is synced into canonical docs
- a full milestone can continue from the quick summary

## 5. Generate closeout packages

```bash
rai review
rai ship
```

Expected outcome:

- `.workflow/reports/review.md`
- `.workflow/reports/ship.md`

## 6. Benchmark hot paths

```bash
rai benchmark
```

Expected outcome:

- `.workflow/benchmarks/latest.json`
- cache hit/miss counters for the measured commands
