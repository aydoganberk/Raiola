# POLICY

This document is the canonical workflow policy surface.
Runtime mirrors under `.workflow/runtime/policy.json` and `.workflow/runtime/approvals.json` are derived state only.

## Domain Matrix
| Domain | Read | Edit | Delete | Move | Notes |
| --- | --- | --- | --- | --- | --- |
| docs | auto | auto | warn | warn | Canonical markdown can change quickly, but destructive edits stay visible. |
| tests | auto | auto | warn | warn | Test updates are encouraged, but deletions and moves should be explicit. |
| src | auto | warn | human_needed | human_needed | Source edits are allowed with review; destructive refactors need approval. |
| config | auto | human_needed | block | block | Config drift can break installs, CI, or routing unexpectedly. |
| infra | auto | human_needed | block | human_needed | Infra changes can affect deployment or remote environments. |
| migrations | auto | human_needed | block | human_needed | Schema moves need a deliberate rollout plan and rollback story. |
| secrets | human_needed | block | block | block | Secrets stay guarded unless a human explicitly approves access. |

## Operation Defaults
| Operation | Decision | Notes |
| --- | --- | --- |
| read | auto | Read-only inspection is safe by default outside secret surfaces. |
| edit | warn | Edits should stay reviewable and tied to the current scope. |
| delete | human_needed | Destructive changes require an explicit acknowledgement. |
| move | warn | Moves can hide churn or break paths and deserve visibility. |
| install | human_needed | Dependency and tool installs mutate the runtime surface. |
| network | human_needed | Network access can leak data or mutate remote systems. |
| browser | warn | Browser verification is allowed, but it should remain intentional and evidence-backed. |
| git | warn | Git mutations should remain preview-first and rollback-aware. |
| shell | warn | Shell execution is allowed when bounded and justified by the workflow. |

## Approval Grants
| Target | Reason | Granted At |
| --- | --- | --- |
|  |  |  |
