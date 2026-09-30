# Ryqen AI Workshop

The Ryqen AI Workshop is the operational framework used to assist the human founder in making, validating, and executing engineering and product decisions for Ryqen.

The governing decision for this workshop is [ADR-000: AI Workshop Operating Model](../adr/ADR-000-ai-workshop-operating-model.md).

---

## Core Principles

- **Human Sovereignty:** The workshop exists to help the founder make and execute better Ryqen decisions. The founder is the sole workshop orchestrator and final decision-maker.
- **Interchangeable Intelligence Nodes:** AI models and tools are interchangeable intelligence capabilities assigned task-specific roles (builder, reviewer, researcher, specialist, debugger, planner, adversarial critic). No AI model has permanent authority or fixed role ownership.
- **Durable Repository Knowledge:** The repository documentation is the durable source of truth. AI chat conversations and context windows are transient working scratchpads.
- **Evidence Over Model Preference:** Claims, recommendations, and code must be backed by evidence (reproducible tests, type checks, platform documentation, database constraints, code diffs). Evidence and project constraints outrank model preference or assertions.
- **Anti-Committee Paralysis:** Multi-model review is reserved for high-consequence work. Avoid unnecessary multi-model involvement and committee paralysis; models do not vote.
- **Development Scope Only:** This operational toolkit governs development decisions. It does not introduce runtime multi-agent orchestration or alter Ryqen's runtime product architecture.

---

## Execution Tiers

Work is routed into three execution tiers based on **consequence, uncertainty, path-dependency, blast radius, security/privacy impact, migration/reversal cost, and future components constrained** — never code volume:

| Tier | Nature of Work | Mode | Typical Flow |
| :--- | :--- | :--- | :--- |
| **Tier 1** | Routine / Reversible | Single capable model | Model $\longrightarrow$ Implement $\longrightarrow$ Validate $\longrightarrow$ Founder Verification |
| **Tier 2** | Important / Reasonably Reversible | Primary builder + targeted review when useful | Builder $\longrightarrow$ Implementation/Tests $\longrightarrow$ Targeted Review $\longrightarrow$ Correction $\longrightarrow$ Founder Verification |
| **Tier 3** | High Consequence / Uncertainty / Path-Dependency | Independent reasoning + unanchored review | Independent Proposal(s) $\longrightarrow$ Unanchored Adversarial Review $\longrightarrow$ Synthesis $\longrightarrow$ Founder Decision $\longrightarrow$ Implementation $\longrightarrow$ Validation $\longrightarrow$ Founder Verification |

---

## Operational Templates

The [`templates/`](templates/) directory provides lightweight templates for workshop workflows:

1. **[`decision-brief.md`](templates/decision-brief.md):** Frames a problem, its constraints, blast radius, and tier classification before soliciting proposals.
2. **[`proposal.md`](templates/proposal.md):** Structures an approach, alternatives, trade-offs, and evidence from a builder or reasoning model.
3. **[`adversarial-review.md`](templates/adversarial-review.md):** Used by independent reviewers to examine a problem without anchoring on prior proposals.
4. **[`decision-record.md`](templates/decision-record.md):** A lightweight working record for the founder's final decision during the workshop (distinct from formal ADRs).
