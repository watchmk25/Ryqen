# Architecture Decision Records (ADRs)

This directory contains durable Architecture Decision Records (ADRs) for the Ryqen project.

## Purpose and Principles

- **What ADRs are:** ADRs capture critical architectural, operational, and structural decisions along with their context, trade-offs, and rationale at the time of approval.
- **Why Ryqen uses them:** Ryqen uses ADRs to establish durable, inspectable project knowledge in the repository, ensuring decisions do not depend on transient AI chat memory or individual model contexts.
- **Historical records:** Accepted ADRs are historical records. They must not be rewritten or modified to alter past decisions or erase historical facts.
- **Supersession lifecycle:** When an architectural decision changes, a new ADR is authored that explicitly references and supersedes the earlier record (`Supersedes: ADR-xxx`). The earlier record is updated with a reference to the superseding record (`Superseded by: ADR-yyy`).
- **Immutability rule:** ADRs should not be rewritten to erase historical decisions. Non-substantive corrections (formatting, typos, broken links) are permissible, provided the historical rationale and decision remain intact.

## Decision Registry

| ADR | Title | Status |
| --- | --- | --- |
| [ADR-000](ADR-000-ai-workshop-operating-model.md) | AI Workshop Operating Model | Accepted |
