# ADR 0004 — Running students' Python and Java on the server (M11)

| | |
|---|---|
| Status | **Accepted** (owner, 2026-10-29) |
| Date | 2026-10-29 |
| Milestone | M11 |
| Related | ADR-02 and §6.4 in `03-architecture.md` (the `CodeRunner` interface) · FR-CODE-08, 09, 10 · NFR-05, NFR-06 · prototype https://claude.ai/artifact/QFLzXG1LhQZaQ2YAk6BbmF |

## Question
Students write Python and Java in the editor and the Playground but can't run it: only Web work has a preview. How do we run their programs, with what they type as input, without risking the LMS, its database or other students' work, and without a new monthly cost?

## Options
| Option | Cost | Why not / why |
|---|---|---|
| Python in the browser (Pyodide) and Java in the browser (CheerpJ) | $0 | Pyodide is ~10 MB on first load; CheerpJ is far bigger and slow on the club's low-end laptops, and its licence needs checking for a club that charges fees. Two different ways of running, one per language. |
| A second, small server only for running code | ≈ €4–5/month (Germany) | The safest: a break-out lands on a server with nothing on it. The owner chose not to pay for it. |
| **Piston on the same server** | $0 | Piston's sandbox (isolate) needs a **privileged** container: one that can do almost anything to the server, next to the database. |
| **Our own small runner on the same server** — *chosen* | **$0** | No privileged container. The owner chose the same server (2026-10-29) and accepted this design. |

## Decision
A `runner` container on the VPS, built from `infra/runner/` (Python 3.12 and Java 21 on Ubuntu 24.04, plus a small Python program using only the standard library). The app calls it through the `CodeRunner` interface (`src/server/runner.ts`) over a **Unix socket** in a volume the two containers share; browsers never reach it.

**The container** (checked by `infra/tests/compose-config.sh`):
- **no network at all** (`network_mode: none`): not the internet, and not the database or the app either. (On the `internal` network a program could have called the LMS from inside, without Cloudflare's sign-in limits.) The socket belongs to the app's group, so the programs themselves can't open it;
- no secrets and no volume but the socket's: it never sees the database, its password, `.env` or the uploads;
- `read_only`, a small `tmpfs` for each run's files, `no-new-privileges`, every capability dropped except the four it needs to hand each run to its own user and stop it (`SETUID`, `SETGID`, `CHOWN`, `KILL`);
- `mem_limit` 768 MB, `pids_limit`, `cpus` 1.5, so a runaway program can't starve the site;
- later, if wanted, under **gVisor** (a free user-space kernel, a second wall between student code and the server's kernel). It needs root to install and extra set-up for the socket, so it isn't part of M11.

**Each run:**
- its own empty folder and its **own Linux user** (one per slot), so a program can't read another run's files. After each run the slot is emptied and checked, including what the program left in `/tmp` or `/dev/shm` and folders it locked; a slot that can't be emptied is never handed on (the runner restarts instead). Added in M17a after the security audit showed one program could break a slot until a restart;
- at most **2 at once** (more wait up to 15 s, then "busy"); **10 s** to run (Java gets up to 15 s more to compile), **5 s** of CPU, 256 MB for Python (a 256 MB heap for Java), a limit on processes, 1 MB per written file; output kept up to 64 KB;
- the app checks the sender first: signed in, the same file limits as saving (30 files, 200 KB), **20 runs a minute** per person, input up to 10 KB;
- **one run at a time per person** (M17a): the app names the person with a SHA-256 of their id, and the runner answers a second run from them with "You already have a program running", so one person can't hold both slots;
- in development and CI the runner listens on `127.0.0.1` instead of a socket, and then asks for a shared token (`RUNNER_TOKEN`).

**Input:** students type the input in a box before pressing Run (owner's choice, not an interactive terminal). Python's `input()` shows each line it read in the output, marked so the editor can show it in green, as in a terminal. Java's `Scanner` reads the same box.

## Consequences
- Run needs no new account, server or monthly cost; the runner image adds ~450 MB on the server and is sent again only when `infra/runner/` changes.
- A kernel bug that let a program out of its container would reach the server. That is the risk the owner accepted by choosing the same server; No network, the limits and a container with nothing in it keep it small. If the club grows or the risk changes, the same image moves to its own server with only `RUNNER_URL` changing.
- Teachers still mark work by reading it; Run doesn't grade anything (no automatic tests in M11).
