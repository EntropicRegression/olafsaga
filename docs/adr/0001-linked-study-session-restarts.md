---
status: accepted
---

# Represent a full restart as a linked Study Session

When a participant reaches the maximum Attempt without passing, the application preserves the current Study Session and atomically creates a linked Study Session at Page 1 instead of erasing data or reusing the same session ID. This keeps every Attempt, message, worksheet entry, and restart origin auditable while allowing the student interface to present a clean diary; the trade-off is that reporting must group sessions by Root Session to avoid counting restarted runs as independent studies.
