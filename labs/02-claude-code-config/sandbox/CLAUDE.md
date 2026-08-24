# sandbox/ — directory-level CLAUDE.md

This file demonstrates two things from Task 3.1 that are hard to see from the
root of a repo.

## 1. Directory-level scoping

Root `CLAUDE.md` files (and every `CLAUDE.md` above the working directory) load
**in full at launch**. This one does not — it loads **on demand**, the first
time Claude reads a file under `sandbox/`.

The consequence the exam cares about: content in a subdirectory `CLAUDE.md`
costs nothing until it's relevant, but it also **is not re-injected after
`/compact`**. Root-level project CLAUDE.md is re-read from disk and re-injected;
nested files and path-scoped rules reload only the next time Claude touches a
matching file. If an instruction seems to vanish after compaction, this is
usually why.

Load order is root → down, so the closer a file is to your working directory,
the *later* it appears in context.

## 2. `@import`

The line below pulls in a shared standards file:

@./standards/api-conventions.md

Rules for imports:

- Relative paths resolve against **the file containing the import**, not the
  working directory.
- Imports can nest, to a maximum depth of four hops.
- Parsing skips code spans and fenced blocks — write `` `@README` `` in
  backticks to mention a path without importing it.
- An import resolving **outside** your working directory (e.g. `@~/.claude/…`)
  is "external" and triggers a one-time approval dialog the first time Claude
  Code sees it in a project. Declining disables it permanently and silently.

## Import vs. rule vs. skill

The distinction Task 3.1 and 3.3 both probe:

| Mechanism | When it loads | Use for |
|---|---|---|
| Root `CLAUDE.md` | every session, in full | universal standards |
| `@import` | every session, in full | *organizing* a large CLAUDE.md — it does **not** reduce context |
| Subdirectory `CLAUDE.md` | when Claude reads that directory | conventions confined to one directory tree |
| `.claude/rules/` with `paths:` | when Claude reads a **matching file** anywhere | conventions that span directories — all test files, all Terraform |
| Skill | when invoked, or when Claude judges it relevant | procedures, not facts |

The common mistake is reaching for `@import` to shrink a bloated CLAUDE.md.
It doesn't: imported files are expanded into context at launch. Path-scoped
rules are the mechanism that actually reduces what's loaded.
