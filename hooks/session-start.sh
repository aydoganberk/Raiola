#!/bin/bash
# raiola session start hook
# Loads the meta-skill that explains when Raiola should activate.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
META_SKILL="$REPO_ROOT/skills/using-raiola/SKILL.md"
FALLBACK_SKILL="$REPO_ROOT/skill/SKILL.md"

if [ -f "$META_SKILL" ]; then
  CONTENT="$(cat "$META_SKILL")"
elif [ -f "$FALLBACK_SKILL" ]; then
  CONTENT="$(cat "$FALLBACK_SKILL")"
else
  CONTENT="Raiola hook loaded, but no skill file was found. Use explicit workflow only when the user asks for it."
fi

cat <<EOF
{
  "priority": "IMPORTANT",
  "message": "raiola loaded. Start with the lifecycle facade or the using-raiola meta-skill, and keep workflow explicit opt-in.\\n\\n$CONTENT"
}
EOF
