# CCKH LMS

Learning management system for the CCKH weekend coding club: lessons, attendance, homework with an in-browser code editor, grading, reports and certificates for admins, teachers and students.

**Live:** `https://lms.cckh.dev` (after G1, the server set-up) · **Status:** M1 code done; next M2

## Documents
| | |
|---|---|
| [01 System analysis](docs/01-system-analysis.md) | problem, actors, decisions |
| [02 Requirements](docs/02-system-requirements.md) | FR-/BR-/NFR- IDs used in tests and commits |
| [03 Architecture](docs/03-architecture.md) | stack, data model, security, hosting |
| [04 Architecture review](docs/04-architecture-review.md) | accepted review |
| [05 Milestones](docs/05-milestones.md) | build order, tests first, exit criteria |
| [ADRs](docs/adr/) | decisions with evidence |
| [Runbook](docs/runbook.md) | server set-up, deploys, backups, restore drills, alerts |
| [P0 prototype](prototype/cckh-lms-prototype.html) | approved clickable prototype |

## Way of working
Test-driven: every change starts with a failing test, references a requirement ID, and lands through a pull request whose checks must pass.
