# Adventure Diary Study

This context describes one participant's guided speaking study and the research records produced while completing the five-page diary.

## Language

**Study Session**:
One uninterrupted run through the Adventure Diary for one Enrollment. A Study Restart ends the current Study Session and creates a linked new one; legacy sessions may remain unscoped until migration.
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

**Experiment Batch**:
A versioned cohort and protocol boundary for one planned study run. It owns lifecycle, mode, consent/protocol snapshots, roster, allocation, and scoped exports.
_Avoid_: Study Session, experiment run, class

**Participant Account**:
The Firebase Auth-backed login identity for a participant. An account can be enrolled in more than one Experiment Batch over time and does not permanently own a research group.
_Avoid_: Enrollment, subject record

**Enrollment**:
The membership of one Participant Account in one Experiment Batch. Enrollment owns the participant code for that batch, class, group allocation, consent state, and batch-specific lifecycle status.
_Avoid_: Participant Account, Study Session
