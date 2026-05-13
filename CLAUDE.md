# CLAUDE.md — Project invariants for Claude Code sessions

## Critical config flags (never lose these in merges)

### `newArchEnabled: false` in app.json
**Why:** React Native 0.81 enables New Architecture (TurboModules + Fabric) by
default. On iOS 26 this causes an immediate launch crash: EXC_CRASH (SIGABRT)
via RCTFatal at ~400ms, before `appUptimeMillis` is even set.

**History:** Added in `be34b40`, silently dropped in merge `f221339` (git
auto-resolved the app.json conflict by taking the branch version that lacked
the flag), re-introduced in `61c332b`. This has crashed TestFlight twice.

**Check before every merge that touches app.json:**
```sh
node -e "const a=require('./app.json'); console.log(a.expo.newArchEnabled)"
# must print: false
```

### `expo-file-system/legacy` in Settings.js
**Why:** expo-file-system v19 (SDK 54) moved `cacheDirectory`,
`writeAsStringAsync`, `readAsStringAsync`, and `EncodingType` to a `/legacy`
sub-path. The root import crashes JSON backup/restore at runtime.

**Check:**
```sh
grep "expo-file-system" src/screens/Settings.js
# must show /legacy
```

### `@react-native-voice/voice` must stay removed
**Why:** Incompatible with New Architecture (TurboModules). Caused the original
launch crash. Removed in `71de95d`.

---

## Merge checklist

Before running `git merge` or `git push` after a merge:

1. **Diff app.json** against the previous commit:
   ```sh
   git diff HEAD~1 -- app.json
   ```
   Verify `newArchEnabled: false` is still present.

2. **Run the pre-push hook manually** if you want to check before pushing:
   ```sh
   .git/hooks/pre-push
   ```

3. **After any large branch merge**, explicitly confirm the three guards above
   are intact — don't assume git resolved conflicts correctly.

---

## Worktree setup — node_modules junction + entry point

Git worktrees do not get their own `node_modules`. Two steps are needed to run
Expo from a worktree.

### Step 1 — node_modules junction

**After creating any new worktree**, run this once in PowerShell to create a
directory junction (no files copied, no admin rights needed):

```powershell
New-Item -ItemType Junction `
  -Path  "D:\My Documents\AI VibeCoding\Persona investment journal app\investment-journal-app\.claude\worktrees\<worktree-name>\node_modules" `
  -Target "D:\My Documents\AI VibeCoding\Persona investment journal app\investment-journal-app\node_modules"
```

Replace `<worktree-name>` with the actual worktree folder name.

### Step 2 — local entry point

The junction makes `node_modules` physically live in the main repo. That means
`expo/AppEntry.js`'s built-in `../../App` import resolves to the **main repo's**
`App.js`, not the worktree's — Metro then errors with "Unable to resolve App".

Fix: the worktree must have its own `index.js` entry point and `"main": "index.js"`
in `package.json`. Both files already exist on this branch (`claude/friendly-wu-473261`).
When creating a future worktree, copy them from here.

---

## Architecture

- **Entry:** `node_modules/expo/AppEntry.js` → `App.js`
- **Error boundary hierarchy:**
  - `RootErrorBoundary` (outermost, in `App.js`) — catches hook-level errors
    from `AppContent`, prevents them reaching `RCTFatal`
  - `AppErrorBoundary` (inner) — catches screen-level render errors after
    bootstrap
- **DB:** `src/db.js` — expo-sqlite async API (SDK 51+); WAL mode; migrations
  are idempotent try/catch ALTER TABLE calls
- **State:** all in `App.js` `AppContent()`, passed via `AppCtx`
- **New Architecture:** disabled (`newArchEnabled: false`); re-enable only after
  verifying all native modules support TurboModules

---

## Known crash history

| Build | Cause | Fix commit |
|-------|-------|------------|
| early | `@react-native-voice/voice` not TurboModule-compatible | `71de95d` |
| build 8 | `newArchEnabled` missing + no root error boundary | `be34b40` |
| build 9 | `newArchEnabled` lost in merge `f221339` | `61c332b` |
