# Task 15 — Authenticated Post-Fix HTTP Baseline and Comparative Analysis

**Date:** 2026-10-29  
**Branch:** `backup/sova-portal`  
**Git HEAD (before/after this task):** `8523954fadcc4f31b92305f81b8dfc09f3e61a14`  
**Expected HEAD:** matches ✓

**Confirmation:** No commit, destructive git ops, ingest, provisioning, DB/index mutation, `.env` edits, eval suite changes, rescoring of Task 9 artifacts, or RAG optimization. Credentials were not printed or stored.

---

## 1. Prior context (read-only)

| Document | Relevance |
|----------|-----------|
| `sdb1560m-task12-chat-gate-fix.md` | Pre-gate `OFF_TOPIC` fix for `SDB1560M` in scoped chat |
| `sdb1560m-task13-eval-numeric-cap-fix.md` | Checker `1.3-task13` accepts «не более N Вт» |
| `sdb1560m-task14-post-fix-baseline.md` | Local verification; HTTP blocked (no env creds) |
| `sdb1560m-baseline-task9.md` | First authenticated baseline narrative |

**Frozen Task 9 HTTP baseline (immutable):**  
`logs/baseline-task9/http-run-20261029-r2/`  
— captured `2026-10-29T07:08:13.062Z`, runner **`1.2-task6`**, `authMode: eval_login`, suite hash below, **pass 4 / fail 2**.

---

## 2. Git and suite identity

| Item | Value |
|------|--------|
| `git rev-parse HEAD` | `8523954fadcc4f31b92305f81b8dfc09f3e61a14` |
| Working tree | Dirty (pre-existing modified + untracked files preserved) |
| Eval suite path | `docs/reports/sdb1560m-eval-suite-draft-v1.json` |
| Suite SHA-256 | `5bab36e3114852d3154fec6182b53352e0700650e396e4a439d8e25a40afe695` |
| `EVAL_RUNNER_LIB_VERSION` | **`1.3-task13`** |

**Case ID note:** Task 15 brief lists `mode.regen-shutdown`; canonical suite ID is **`mode.regen-shutdown.verified`** (used below).

**Verified partition (six cases, dry-run):**

1. `num.mass.verified`  
2. `num.dry-power-base.verified`  
3. `mode.regen-shutdown.verified`  
4. `maint.desicc-interval.verified`  
5. `alarm.beep-door.verified`  
6. `para.mass-colloquial.verified`

---

## 3. Authentication preflight

| Check | Result |
|-------|--------|
| `EVAL_LOGIN` set in agent process | **No** |
| `EVAL_PASSWORD` set in agent process | **No** |
| `EVAL_BASE_URL` | `http://127.0.0.1:3000` |
| Portal GET `/` | **HTTP 200** (reachable; login not verified) |

**HTTP baseline execution:** **STOPPED** — credentials absent in the agent shell (same blocker as Task 14). No `.env`, cookies, or provisioning used.

---

## 4. Operator instructions (authorized local session)

Portal must be running; account must access **`sdb1560m`**. Set credentials in the **same** session before `node`:

```powershell
cd C:\Users\SOVAI\Documents\Work\QR

$env:EVAL_BASE_URL = "http://127.0.0.1:3000"
$env:EVAL_LOGIN = Read-Host "Portal login"

$sec = Read-Host "Portal password" -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)

try {
    $env:EVAL_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
}
finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
}

node scripts/test-sdb1560m-eval-runner-unit.js
node scripts/test-sdb1560m-eval-runner-counterexamples.js

node scripts/run-sdb1560m-eval-v1.js --dry-run --partition=verified

node scripts/run-sdb1560m-eval-v1.js --allow-http --partition=verified --out=logs/baseline-task15/http-run-20261029
```

If `logs/baseline-task15/http-run-20261029` exists, use a unique suffix (e.g. `http-run-20261029-r2`). **Never overwrite** Task 9 or prior run directories.

After the run, append to this report (or request a follow-up agent pass) the Task 15 artifact path and fill section 7 comparison columns marked **pending**.

---

## 5. Pre-HTTP verification (executed)

| Command | Exit code | Notes |
|---------|-----------|--------|
| `node scripts/test-sdb1560m-eval-runner-unit.js` | **0** | OK |
| `node scripts/test-sdb1560m-eval-runner-counterexamples.js` | **0** | OK |
| `node scripts/run-sdb1560m-eval-v1.js --dry-run --partition=verified` | **0** | 6 cases, all `not_run`; no HTTP |

Dry-run manifest: `logs/eval-runs/sdb1560m-2026-10-29T07-34-24-545Z/` — confirms **`1.3-task13`**, suite hash, partition `verified`.

**Not run in agent session:** `--allow-http` (auth blocked).

---

## 6. Task 15 HTTP artifacts (operator run)

| Field | Value |
|--------|--------|
| Path | `logs/baseline-task15/http-run-20261029/` |
| `capturedAt` | `2026-10-29T07:38:12.118Z` |
| `evalRunnerLibVersion` | **`1.3-task13`** |
| `authMode` | **`eval_login`** |
| Cases | **6** executed; infra **0** |
| Summary | **pass 5**, **fail 1** (83.3%) |

---

## 7. Task 9 vs Task 15 comparison

| Metric | Task 9 (`1.2-task6`) | Task 15 (`1.3-task13`) |
|--------|----------------------|-------------------------|
| Pass / fail | 4 / 2 | **5 / 1** |

| Case ID | T9 | T15 | Notes |
|---------|----|-----|-------|
| `num.mass.verified` | fail | **fail** | Same scope refusal; no **260 kg**; empty sources |
| `num.dry-power-base.verified` | fail | **pass** | **Same** «не более 40 Вт» — **checker-only** fix (Task 13) |
| `mode.regen-shutdown.verified` | pass | pass | Same prohibition text |
| `maint.desicc-interval.verified` | pass | pass | **36 months** |
| `alarm.beep-door.verified` | pass | pass | Door beep norm |
| `para.mass-colloquial.verified` | pass | pass | **260 kg** (wording differs) |

**Single remaining fail:** `num.mass.verified` — production still returns pre-gate refusal. On-disk gate (Task 12) classifies this query as **`IN_SCOPE`**; live HTTP does not → **restart portal** (`Ctrl+C`, `npm start`) so Node reloads `sdb1560m-chat-gate.js`, then re-test mass case.

**Task 13 confirmed:** dry-power **pass** with unchanged answer text.

Full tables and manual review: see sections 8–9 below (updated after HTTP).

---

## 7b. Detailed case table

| Case ID | T9 overall | T15 overall | Factual T9→T15 | Retrieval | Likely cause | Follow-up |
|---------|------------|-------------|----------------|-----------|--------------|-----------|
| `num.mass.verified` | fail | fail | fail→fail | fail (no PDF) | Stale gate / scope short-circuit | Restart portal; re-run case |
| `num.dry-power-base.verified` | fail | pass | fail→pass | n/e | Eval semantics (Task 13) | Manual OK on cap |
| Others | pass | pass | pass→pass | n/e | — | Expert manual review |

---

## 8. Mandatory manual review (Task 15 answers)

### A. `num.mass.verified`

Still **scope refusal**; **not** 260 kg. Gate failure on **running** server (high confidence if portal not restarted after Task 12).

### B. `num.dry-power-base.verified`

**Pass** — «не более 40 Вт», no 810/415; semantically OK for base dry mode.

### C. Other four

Regen / 36 mo / beep / colloquial **260 kg** — previews consistent with required facts; runner pass is not full semantic sign-off.

---

## 9. Checker vs production

- **+1 pass** vs Task 9 is mostly **dry-power scoring**, not RAG improvement.
- **Mass** is a **real** product issue until portal loads Task 12 fix.

---

## 10. Task 15 completion status

| Criterion | Status |
|-----------|--------|
| HTTP baseline `logs/baseline-task15/http-run-20261029/` | **Yes** |
| T9 comparison | **Yes** |
| Task 9 artifacts unchanged | **Yes** |

---

## 11. Files

| Path | Role |
|------|------|
| `logs/baseline-task15/http-run-20261029/` | Task 15 HTTP artifacts |
| `logs/baseline-task9/http-run-20261029-r2/` | Frozen Task 9 |

**Not modified:** Task 9 files, eval suite, `.env`, DB, index (analysis only).

