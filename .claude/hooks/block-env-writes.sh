#!/usr/bin/env bash
# PreToolUse hook — refuses any write whose target looks like a secrets file.
#
# Why this exists alongside the `deny` rules in settings.json:
#   deny rules   -> declarative, checked before the permission mode, survive
#                   bypassPermissions. Best for "never, under any circumstance".
#   command hook -> runs FIRST, before deny/ask/mode/allow, and can inspect the
#                   whole tool input (not just the primary path field). Best for
#                   logic a glob can't express.
# Exam Domain 3 (Task 3.2) and Domain 1 (Task 1.4) both hinge on knowing that
# programmatic enforcement beats a prompt instruction. Keep both layers.
#
# Contract: read the hook payload on stdin, print a JSON decision on stdout,
# exit 0. (Exit 2 with a message on stderr would also block, without JSON.)

set -euo pipefail

payload="$(cat)"

decision="$(
  PAYLOAD="$payload" /usr/bin/env python3 <<'PY'
import json, os, re, sys

try:
    data = json.loads(os.environ["PAYLOAD"])
except Exception:
    # Malformed payload: stay out of the way rather than blocking everything.
    print("{}")
    sys.exit(0)

tool_input = data.get("tool_input") or {}
target = (
    tool_input.get("file_path")
    or tool_input.get("notebook_path")
    or ""
)

blocked = re.search(r"(^|/)\.env($|\.)", target) or "/secrets/" in target

if blocked:
    print(json.dumps({
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "deny",
            "permissionDecisionReason": (
                f"Refusing to write to {target!r}. Secrets live in .env, which is "
                "gitignored and denied in .claude/settings.json. Put the variable "
                "name in .env.example instead and reference it from code."
            ),
        }
    }))
else:
    print("{}")
PY
)"

printf '%s\n' "$decision"
exit 0
