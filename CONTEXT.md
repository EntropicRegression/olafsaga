# Adventure Diary Study

This context describes one participant's guided speaking study and the research records produced while completing the five-page diary.

## Language

**Study Session**:
One uninterrupted run through the Adventure Diary. A Study Restart ends the current Study Session and creates a linked new one.
_Avoid_: Browser session, login session, run record

**Study Restart**:
The recorded transition that preserves an unsuccessful Study Session and begins a new Study Session at Page 1, Plot Round, Attempt 1. See [ADR 0001](docs/adr/0001-linked-study-session-restarts.md).
_Avoid_: Reset, retry, clearing the study

**Root Session**:
The first Study Session in a chain of linked Study Restarts.
_Avoid_: Original attempt, parent session

**Page**:
One of the five story moments in the Adventure Diary.
_Avoid_: Stage, level, node

**Round**:
The speaking focus within a Page: Plot recalls what happened, and Feeling expresses a reaction.
_Avoid_: Phase, step

**Attempt**:
One submitted recording within a Page and Round. Attempt numbering restarts when the participant moves to another Round or begins a new Study Session.
_Avoid_: Recording, retry, turn
