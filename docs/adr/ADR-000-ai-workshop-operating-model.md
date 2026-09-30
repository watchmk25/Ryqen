# ADR-000: AI Workshop Operating Model

- **Status:** Accepted
- **Date:** 2026-10-01
- **Deciders:** Founder / Ryqen Project Lead
- **Supersedes:** None
- **Superseded by:** None

---

## 1. Context

Development of the Ryqen project relies on AI models assisting the human founder across product strategy, system design, research, implementation, code review, and verification.

Early project working notes informally assigned fixed roles to specific external models and commercial tools (e.g., assigning strategy and architecture exclusively to ChatGPT, implementation exclusively to Codex, and native mobile troubleshooting to Gemini). While functional during initial setup, this structure introduced significant operational risks:
1. **Model conflation:** Task roles were tightly coupled to specific model identities and vendor brands.
2. **Lack of risk tiering:** Routine styling updates and high-consequence database security boundaries were treated without a structured governance distinction.
3. **Anchoring bias:** Follow-up reviews were often anchored to the first model's generated proposal, masking blind spots and unstated assumptions.
4. **Transient memory risk:** Critical decisions risked living in fleeting chat histories rather than in the repository.

Ryqen requires a durable, vendor-agnostic development operating model that scales safely, prevents AI committee paralysis, preserves the founder's absolute authority, and ensures that the repository remains the single source of truth.

---

## 2. Decision

We establish the **Ryqen AI Workshop Operating Model** governed by the following core tenets:

### 2.1. Human Sovereignty
The human founder is the sole workshop orchestrator and final decision-maker.
- No AI model possesses permanent authority or fixed ownership over architecture, engineering, review, or coordination.
- AI models propose, analyze, critique, and implement under direction; only the founder approves decisions and accepts work.

### 2.2. Durable Project Knowledge vs. Transient Working Context
The repository is the durable source of truth; AI chat memory is not.
- AI chat sessions, conversation threads, and context windows are transient working scratchpads.
- Any decision, architectural invariant, specification, or constraint not committed to the repository does not authoritatively exist.

### 2.3. Source-of-Truth Hierarchy
When information or directives conflict, authority is determined by the nature of the claim:

1. **Ryqen Constitution and Approved Principles:** Non-negotiable philosophical and product commitments (user control, honesty, privacy, meaningful progress over vanity metrics).
2. **Accepted ADRs and Explicit Decisions:** Authoritative records of architectural, technical, and operational decisions, contracts, and boundaries.
3. **Current Product and Architecture Specifications:** Specifications defining intended behavior and system structure (`docs/RYQEN_V0.1_*.md`).
4. **Current Repository Implementation:** The definitive source of truth for *current runtime behavior*.
5. **AI Conversations and Transient Reasoning:** Non-authoritative working context.

*Resolution rule:* ADRs and specifications govern intended design and constraints. The repository implementation governs what currently runs. Transient chat holds no authority.

### 2.4. AI Models as Interchangeable Capabilities
AI models and providers are interchangeable intelligence nodes selected according to the task:
- Roles such as **builder**, **reviewer**, **researcher**, **specialist**, **debugger**, **planner**, and **adversarial critic** are ephemeral task roles, not permanent model identities.
- Any capable model (from any provider or open-weights ecosystem) may fulfill any role based on problem suitability, context window, reasoning depth, and cost.

### 2.5. Three-Tier Execution Model
Work is classified and executed according to risk and reversibility:

#### Tier 1 — Routine / Reversible
- **Characteristics:** Low risk, immediate reversibility, narrow blast radius.
- **Examples:** Routine UI adjustments, styling updates, routine tests, straightforward bug fixes, minor refactoring, documentation edits, simple utility helpers.
- **Workflow:** One capable model implements and runs narrow validation; founder verifies.
  $$\text{Model} \longrightarrow \text{Implement} \longrightarrow \text{Validate} \longrightarrow \text{Founder Verification}$$

#### Tier 2 — Important / Reasonably Reversible
- **Characteristics:** Moderate impact, non-trivial domain logic, reasonably reversible if flawed.
- **Examples:** Meaningful feature additions, planner rule adjustments, service boundary refinements, significant UX flow changes.
- **Workflow:** A primary builder implements and validates with automated tests, followed by targeted independent review when useful before founder verification.
  $$\text{Builder} \longrightarrow \text{Implementation / Tests} \longrightarrow \text{Targeted Review} \longrightarrow \text{Correction} \longrightarrow \text{Founder Verification}$$

#### Tier 3 — High Consequence / High Uncertainty / High Path-Dependency
- **Characteristics:** Critical blast radius, high uncertainty, severe security/privacy impact, irreversible or costly migrations, or foundational constraints on future components.
- **Examples:** Database schema changes, Supabase migrations, authentication and authorization boundaries, RLS policies, lifecycle/state-machine transitions, core planner architectural invariants, data contracts, AI-to-state mutation boundaries.
- **Workflow:** Independent reasoning before implementation, unanchored adversarial review, founder synthesis and decision, formal ADR record when appropriate, followed by implementation and exhaustive validation.
  $$\begin{aligned}
  \text{Independent Proposal(s)} &\longrightarrow \text{Unanchored Adversarial Review} \longrightarrow \text{Synthesis} \\
  &\longrightarrow \text{Founder Decision (ADR)} \longrightarrow \text{Implementation} \longrightarrow \text{Validation} \longrightarrow \text{Founder Verification}
  \end{aligned}$$

### 2.6. Escalation Criteria
Escalation between tiers is based on **consequence, uncertainty, path-dependency, blast radius, security/privacy impact, migration/reversal cost, and future components constrained** — never code volume or cosmetic complexity:
- Consequence of being wrong (e.g., security vulnerability vs. misaligned UI margin).
- Uncertainty of domain constraints or platform behaviors.
- Path-dependency (how many future components or decisions are constrained by this choice).
- Migration and rollback cost.
- Security, privacy, and data-integrity impact.

*Explicit rule:* A small 3-line SQL RLS policy change can be Tier 3. A 400-line stylesheet or pure UI component refactor can remain Tier 1.

### 2.7. Unanchored Adversarial Review
For Tier 3 decisions, independent reviewers should receive the relevant requirements, constraints, problem statement, and evidence **without being shown the first model's proposed solution** whenever practical.
- The objective is to reduce anchoring bias, expose hidden assumptions, surface edge cases, and discover alternative architectures.
- Review exists to uncover disagreement and test assumptions, not to manufacture superficial consensus.

### 2.8. Avoiding AI Committee Paralysis
The workshop must not degenerate into a bureaucratic multi-agent committee or voting system:
- Multi-model review is not required for every task and is reserved for high-consequence Tier 3 decisions where the expected cost of an error warrants the overhead.
- AI models do not vote; the founder synthesizes differing perspectives, resolves trade-offs, and decides.

### 2.9. Evidence Over Model Authority
Model assertions carry zero authority on their own:
- All claims must be backed by evidence: reproducible tests, type checking (`tsc --noEmit`), code diffs, database query plans, and official platform documentation.
- Repository state, automated test suites, and deterministic verification always take precedence over a model's claim.

### 2.10. Provider and Model Independence
The workshop operates independently of specific AI vendors:
- Prompts, task handoffs, and documentation must remain vendor-neutral.
- Workflows must not depend on proprietary vendor features that prevent switching models or tools.

### 2.11. ADR Lifecycle and Supersession
- Accepted ADRs are historical decision records capturing intent, context, and trade-offs at a specific point in time.
- Past ADRs are not rewritten to alter a past decision or erase history.
- When an architectural decision is modified or replaced, a **new ADR** is created that explicitly supersedes the prior ADR (`Supersedes: ADR-xxx`, and the prior ADR is marked `Superseded by: ADR-yyy`).
- Non-substantive corrections (typos, formatting, broken links) are permissible, but historical rationale and decisions must never be falsified.

---

## 3. Relationship to Ryqen Product Architecture

This ADR governs the **development workshop of Ryqen**, not Ryqen's runtime product architecture:
- It does **not** introduce or modify Ryqen runtime architecture.
- It does **not** introduce runtime multi-agent orchestration, LLM provider routing, or autonomous swarms into the Ryqen mobile application.
- V0.1 runtime architecture remains strictly as approved: a calm, deterministic Today Command Center backed by Supabase RPC security boundaries.
- The workshop model mirrors the core conceptual relationship of Ryqen:
  $$\begin{aligned}
  \text{User Intent} &\longrightarrow \text{Context} \longrightarrow \text{Appropriate Intelligence / Tool} \longrightarrow \text{Structured Reasoning} \\
  &\longrightarrow \text{Validation} \longrightarrow \text{Permission Boundary} \longrightarrow \text{Action} \longrightarrow \text{Verification} \longrightarrow \text{Audit}
  \end{aligned}$$
- No future runtime capability is claimed to be already implemented.

---

## 4. Consequences

### Positive
- **Velocity with Safety:** Tier 1 work proceeds rapidly without unnecessary review overhead, while Tier 3 decisions receive rigorous scrutiny.
- **Resilience:** Development is decoupled from any single AI vendor or platform outage.
- **Clarity:** Models entering the codebase immediately recognize the rules of engagement and authority boundaries from repository documentation.
- **Auditability:** Architectural evolution is preserved through explicit, linked ADR records.

### Trade-offs & Operational Discipline
- Requires the founder to actively orchestrate tasks, select tiers, and synthesize divergent AI analyses.
- Formulating unanchored prompts for Tier 3 reviews requires intentional preparation.
- Requires discipline to record decisions in ADRs rather than leaving them in chat transcripts.

---

## 5. Rejected Alternatives

1. **Permanent Model Role Assignments (e.g., ChatGPT as architect, Codex as coder):**
   *Rejected.* Creates vendor lock-in, limits the use of superior emerging models, and obscures accountability.
2. **Autonomous Peer-Agent Swarms with Majority Voting:**
   *Rejected.* Produces hallucination compounding, committee paralysis, token bloat, and evades human sovereignty.
3. **Transient Chat Memory as Project Source of Truth:**
   *Rejected.* Fragile, inaccessible across tools, subject to context drift, and non-reproducible.
4. **Mutable Single-File Decision Log:**
   *Rejected.* Overwriting historical decisions erases the rationale, constraints, and evolution of the system over time.
