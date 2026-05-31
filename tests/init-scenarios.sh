#!/usr/bin/env bash
# Integration scenarios for `weave init` / `weave sync` against real git repos.
# Builds the CLI, then runs each scenario in an isolated tmpdir using a local
# bare repo as the "remote". No test framework — just bash + git + assertions.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WEAVE=(node "$REPO_ROOT/dist/index.js")

echo "Building..."
(cd "$REPO_ROOT" && npm run build >/dev/null)

TMP="$(mktemp -d -t weave-test.XXXXXX)"
trap 'rm -rf "$TMP"' EXIT

# Set up a local bare repo as the upstream "remote", with two branches:
#   main:    "main content"
#   develop: "develop content"
# Threads in scenarios point at the develop branch, so we can verify that
# clones land on the requested branch rather than the remote's default HEAD.
REMOTE="$TMP/remote.git"
WORK="$TMP/work-remote"
git init --bare -q -b main "$REMOTE"
git clone -q "$REMOTE" "$WORK"
git -C "$WORK" config user.email test@example
git -C "$WORK" config user.name test
echo "main content" > "$WORK/file.txt"
git -C "$WORK" add file.txt
git -C "$WORK" commit -qm "initial on main"
git -C "$WORK" push -q origin main
git -C "$WORK" checkout -qb develop
echo "develop content" > "$WORK/file.txt"
git -C "$WORK" commit -qam "develop content"
git -C "$WORK" push -q origin develop

setup_parent() {
  local name="$1"
  local parent="$TMP/parent-$name"
  rm -rf "$parent"
  mkdir -p "$parent/services"
  git -C "$parent" init -q -b main
  git -C "$parent" config user.email test@example
  git -C "$parent" config user.name test
  cat > "$parent/services/api.thread" <<EOF
{
  "repo": "$REMOTE",
  "branch": "develop"
}
EOF
  cat > "$parent/weave.json" <<EOF
{ "scan": ["services"] }
EOF
  echo "$parent"
}

PASS=0
FAIL=0

assert() {
  local label="$1"; shift
  if "$@"; then
    echo "  PASS  $label"
    PASS=$((PASS+1))
  else
    echo "  FAIL  $label"
    FAIL=$((FAIL+1))
  fi
}

assert_grep() {
  local label="$1" needle="$2" haystack="$3"
  if grep -qF "$needle" <<< "$haystack"; then
    echo "  PASS  $label"
    PASS=$((PASS+1))
  else
    echo "  FAIL  $label  (missing: $needle)"
    FAIL=$((FAIL+1))
  fi
}

assert_not_grep() {
  local label="$1" needle="$2" haystack="$3"
  if ! grep -qF "$needle" <<< "$haystack"; then
    echo "  PASS  $label"
    PASS=$((PASS+1))
  else
    echo "  FAIL  $label  (unexpected: $needle)"
    FAIL=$((FAIL+1))
  fi
}

# ---- A: no child dir at all ----
echo
echo "Scenario A — no child dir: should clone on the requested branch"
parent="$(setup_parent A)"
output=$(cd "$parent" && "${WEAVE[@]}" init 2>&1)
assert "child cloned" test -d "$parent/services/api/.git"
branch=$(git -C "$parent/services/api" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "?")
assert "on develop branch (was $branch)" test "$branch" = "develop"
assert "develop content present" grep -qF "develop content" "$parent/services/api/file.txt"

# ---- B: empty child dir (the reported bug) ----
echo
echo "Scenario B — empty child dir: should remove placeholder and clone"
parent="$(setup_parent B)"
mkdir -p "$parent/services/api"
# Make the parent dirty to amplify the old bug: simple-git would have
# walked up to this repo's .git and reported its dirty state on the child.
echo "untracked" > "$parent/parent-untracked.txt"
output=$(cd "$parent" && "${WEAVE[@]}" init 2>&1) || true
assert "child cloned despite empty placeholder" test -d "$parent/services/api/.git"
branch=$(git -C "$parent/services/api" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "?")
assert "on develop branch (was $branch)" test "$branch" = "develop"
assert_not_grep "no false uncommitted-changes report" "uncommitted-changes" "$output"
assert_not_grep "no skipped status" "skipped" "$output"

# ---- C: non-empty non-git child dir ----
echo
echo "Scenario C — non-empty non-git dir: should abort without touching data"
parent="$(setup_parent C)"
mkdir -p "$parent/services/api"
echo "do not delete" > "$parent/services/api/local-file.txt"
output=$(cd "$parent" && "${WEAVE[@]}" init 2>&1) || true
assert "stray file preserved" test -f "$parent/services/api/local-file.txt"
assert "no .git created in child path" test ! -d "$parent/services/api/.git"
assert_grep "output explains why" "not a git repo" "$output"

# ---- D: existing clone gets updated on sync ----
echo
echo "Scenario D — existing clone: sync should fetch and update"
parent="$(setup_parent D)"
(cd "$parent" && "${WEAVE[@]}" init >/dev/null 2>&1)
git -C "$WORK" checkout -q develop
echo "second commit" >> "$WORK/file.txt"
git -C "$WORK" commit -qam "second commit"
git -C "$WORK" push -q origin develop
output=$(cd "$parent" && "${WEAVE[@]}" sync 2>&1)
assert "child picked up second commit" grep -qF "second commit" "$parent/services/api/file.txt"

# ---- E: recursive scan finds .thread files in subdirs with scan ["."] ----
echo
echo "Scenario E — recursive scan: default scan ['.'] finds nested .thread files"
parent="$TMP/parent-E"
rm -rf "$parent"
mkdir -p "$parent/services" "$parent/packages/ui"
git -C "$parent" init -q -b main
git -C "$parent" config user.email test@example
git -C "$parent" config user.name test
cat > "$parent/services/api.thread" <<EOF
{ "repo": "$REMOTE", "branch": "develop" }
EOF
cat > "$parent/packages/ui/lib.thread" <<EOF
{ "repo": "$REMOTE", "branch": "main" }
EOF
# No weave.json — defaults to scan ["."]
output=$(cd "$parent" && "${WEAVE[@]}" init 2>&1)
assert "services/api cloned" test -d "$parent/services/api/.git"
assert "packages/ui/lib cloned" test -d "$parent/packages/ui/lib/.git"
api_branch=$(git -C "$parent/services/api" rev-parse --abbrev-ref HEAD)
lib_branch=$(git -C "$parent/packages/ui/lib" rev-parse --abbrev-ref HEAD)
assert "api on develop (was $api_branch)" test "$api_branch" = "develop"
assert "lib on main (was $lib_branch)" test "$lib_branch" = "main"

# ---- F: scan skips nested git repos ----
echo
echo "Scenario F — recursive scan: nested git repos are not descended"
parent="$TMP/parent-F"
rm -rf "$parent"
mkdir -p "$parent"
git -C "$parent" init -q -b main
git -C "$parent" config user.email test@example
git -C "$parent" config user.name test
# Create a nested directory that is its own git repo with a .thread inside.
# Recursive scan must NOT pick up unrelated.thread from inside the nested repo.
mkdir -p "$parent/external-repo"
git -C "$parent/external-repo" init -q -b main
cat > "$parent/external-repo/unrelated.thread" <<EOF
{ "repo": "should-not-be-scanned", "branch": "main" }
EOF
# A real top-level thread that SHOULD be found
cat > "$parent/top.thread" <<EOF
{ "repo": "$REMOTE", "branch": "main" }
EOF
output=$(cd "$parent" && "${WEAVE[@]}" debug 2>&1)
assert_grep "top.thread discovered" "top.thread" "$output"
assert_not_grep "nested repo thread skipped" "unrelated.thread" "$output"

# ---- G: changing thread.branch switches the child on next sync ----
echo
echo "Scenario G — change .thread branch: child switches branches on next sync"
parent="$(setup_parent G)"
(cd "$parent" && "${WEAVE[@]}" init >/dev/null 2>&1)
start_branch=$(git -C "$parent/services/api" rev-parse --abbrev-ref HEAD)
assert "starts on develop (was $start_branch)" test "$start_branch" = "develop"
# Rewrite the .thread to point at main
cat > "$parent/services/api.thread" <<EOF
{ "repo": "$REMOTE", "branch": "main" }
EOF
output=$(cd "$parent" && "${WEAVE[@]}" sync 2>&1)
end_branch=$(git -C "$parent/services/api" rev-parse --abbrev-ref HEAD)
assert "switched to main (was $end_branch)" test "$end_branch" = "main"
assert "main content present" grep -qF "main content" "$parent/services/api/file.txt"

# ---- H: branch switch refuses when child has uncommitted changes ----
echo
echo "Scenario H — change .thread branch with dirty child: sync should skip"
parent="$(setup_parent H)"
(cd "$parent" && "${WEAVE[@]}" init >/dev/null 2>&1)
echo "local edit" >> "$parent/services/api/file.txt"
cat > "$parent/services/api.thread" <<EOF
{ "repo": "$REMOTE", "branch": "main" }
EOF
output=$(cd "$parent" && "${WEAVE[@]}" sync 2>&1)
end_branch=$(git -C "$parent/services/api" rev-parse --abbrev-ref HEAD)
assert "still on develop (was $end_branch)" test "$end_branch" = "develop"
assert_grep "sync reports skipped" "skipped" "$output"
assert "local edit preserved" grep -qF "local edit" "$parent/services/api/file.txt"

# ---- I: weave clean dry-run lists orphans ----
echo
echo "Scenario I — weave clean (dry run): lists orphan but doesn't delete"
parent="$(setup_parent I)"
(cd "$parent" && "${WEAVE[@]}" init >/dev/null 2>&1)
# Remove the .thread file → child is now an orphan
rm "$parent/services/api.thread"
output=$(cd "$parent" && "${WEAVE[@]}" clean 2>&1)
assert "child dir still present" test -d "$parent/services/api/.git"
assert_grep "reports dry-run" "dry run" "$output"
assert_grep "lists the orphan as clean" "clean" "$output"
assert_grep "shows would-remove action" "would remove" "$output"

# ---- J: weave clean --apply removes a clean orphan ----
echo
echo "Scenario J — weave clean --apply: removes a clean orphan"
parent="$(setup_parent J)"
(cd "$parent" && "${WEAVE[@]}" init >/dev/null 2>&1)
rm "$parent/services/api.thread"
output=$(cd "$parent" && "${WEAVE[@]}" clean --apply 2>&1)
assert "child dir removed" test ! -d "$parent/services/api"
assert_grep "reports removed action" "→ removed" "$output"
# Exclude block should be rebuilt with no entries
exclude_after=$(grep -A 100 "weave managed" "$parent/.git/info/exclude" || true)
assert_not_grep "exclude no longer mentions services/api" "services/api" "$exclude_after"

# ---- K: weave clean --apply refuses a dirty orphan ----
echo
echo "Scenario K — weave clean --apply: refuses dirty orphan without --force"
parent="$(setup_parent K)"
(cd "$parent" && "${WEAVE[@]}" init >/dev/null 2>&1)
echo "local work" >> "$parent/services/api/file.txt"
rm "$parent/services/api.thread"
output=$(cd "$parent" && "${WEAVE[@]}" clean --apply 2>&1)
assert "dirty orphan still on disk" test -d "$parent/services/api/.git"
assert "local edit preserved" grep -qF "local work" "$parent/services/api/file.txt"
assert_grep "explains --force" "force" "$output"

# ---- L: weave clean --force removes a dirty orphan ----
echo
echo "Scenario L — weave clean --force: removes dirty orphan"
parent="$(setup_parent L)"
(cd "$parent" && "${WEAVE[@]}" init >/dev/null 2>&1)
echo "local work" >> "$parent/services/api/file.txt"
rm "$parent/services/api.thread"
output=$(cd "$parent" && "${WEAVE[@]}" clean --force 2>&1)
assert "dirty orphan removed" test ! -d "$parent/services/api"

# ---- M: weave clean leaves non-git orphan dirs alone without --force ----
echo
echo "Scenario M — weave clean: non-git orphan dir is preserved without --force"
parent="$(setup_parent M)"
(cd "$parent" && "${WEAVE[@]}" init >/dev/null 2>&1)
# Simulate someone replacing the child with their own files
rm -rf "$parent/services/api"
mkdir -p "$parent/services/api"
echo "personal notes" > "$parent/services/api/notes.txt"
rm "$parent/services/api.thread"
output=$(cd "$parent" && "${WEAVE[@]}" clean --apply 2>&1)
assert "user files preserved" test -f "$parent/services/api/notes.txt"
assert_grep "skipped with reason" "not a git repo" "$output"

# ---- N: weave lock refuses unpushed commits ----
echo
echo "Scenario N — weave lock: refuses to pin an unpushed commit"
parent="$(setup_parent N)"
(cd "$parent" && "${WEAVE[@]}" init >/dev/null 2>&1)
# Make a local commit in the child that hasn't been pushed
git -C "$parent/services/api" config user.email child@example
git -C "$parent/services/api" config user.name child
echo "local only" >> "$parent/services/api/file.txt"
git -C "$parent/services/api" commit -qam "local-only commit"
output=$(cd "$parent" && "${WEAVE[@]}" lock 2>&1)
assert_grep "lock failed" "failed" "$output"
assert_grep "explains push first" "push first" "$output"
# .thread file should NOT have a hash field
assert_not_grep ".thread untouched" "\"hash\"" "$(cat "$parent/services/api.thread")"

# ---- O: weave lock --force pins anyway ----
echo
echo "Scenario O — weave lock --force: pins unpushed commit anyway"
parent="$(setup_parent O)"
(cd "$parent" && "${WEAVE[@]}" init >/dev/null 2>&1)
git -C "$parent/services/api" config user.email child@example
git -C "$parent/services/api" config user.name child
echo "local only" >> "$parent/services/api/file.txt"
git -C "$parent/services/api" commit -qam "local-only commit"
local_head=$(git -C "$parent/services/api" rev-parse HEAD)
output=$(cd "$parent" && "${WEAVE[@]}" lock --force 2>&1)
assert_grep ".thread now has hash" "\"hash\"" "$(cat "$parent/services/api.thread")"
assert_grep ".thread pinned to local HEAD" "$local_head" "$(cat "$parent/services/api.thread")"

# ---- P: weave lock succeeds on pushed commit ----
echo
echo "Scenario P — weave lock: succeeds when HEAD is on a remote branch"
parent="$(setup_parent P)"
(cd "$parent" && "${WEAVE[@]}" init >/dev/null 2>&1)
# HEAD is at the upstream tip (origin/develop), no local commits beyond it
output=$(cd "$parent" && "${WEAVE[@]}" lock 2>&1)
assert_grep ".thread now has hash" "\"hash\"" "$(cat "$parent/services/api.thread")"
assert_not_grep "no failures" "failed" "$output"

# ---- Q: post-checkout hook guards on branch-checkout flag ----
echo
echo "Scenario Q — post-checkout hook: only runs sync on branch checkout"
parent="$(setup_parent Q)"
(cd "$parent" && "${WEAVE[@]}" init >/dev/null 2>&1)
hook="$parent/.git/hooks/post-checkout"
assert "post-checkout hook installed" test -x "$hook"
assert_grep "hook guards on \$3" '"$3" = "1"' "$(cat "$hook")"
# Sanity: invoking the hook with flag=0 (file checkout) should not run weave sync.
# We can't easily detect "did not run"; instead check that the hook script
# exits without invoking sync visibly by inspecting its behavior in isolation.
fake_output=$(sh "$hook" 0000 1111 0 2>&1 || true)
assert_not_grep "no sync on file checkout (flag=0)" "weave sync" "$fake_output"

echo
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
