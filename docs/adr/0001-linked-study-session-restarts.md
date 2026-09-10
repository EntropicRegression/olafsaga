---
status: accepted
---

# Represent a Page restart as a linked Study Session

When a participant reaches the maximum Attempt without passing, the application preserves the current Study Session and atomically creates a linked Study Session at the same Page, Plot Round, Attempt 1 instead of erasing data or reusing the same session ID. The student is shown the restart notice, completed earlier Pages remain visible, and only the unsuccessful Page is cleared before its Plot prompt is shown again. This keeps every Attempt, message, worksheet entry, and the triggering Page and Round auditable; the trade-off is that participant views must reconstruct prior completed Pages from the Root Session chain, and reporting must group linked sessions to avoid counting restarts as independent studies.
