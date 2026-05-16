// expo-background-task wiring for the research pipeline.
//
// What this does: iOS / Android occasionally grant the app a short window of
// background time (typically every ~15 min, on charger + Wi-Fi for iOS).
// During that window the registered task runs and tries to finish any
// "generating" memos that got orphaned by a previous app suspension or
// force-quit.
//
// Importing this file for side effects ensures the task is defined before
// the OS tries to invoke it (TaskManager.defineTask must be called at module
// load time, not lazily). Registration is explicit via registerResearchBackgroundTask().

import * as TaskManager from "expo-task-manager";
import * as BackgroundTask from "expo-background-task";

import { resumeOrphanedMemos } from "./pipeline";

export const RESEARCH_RESUME_TASK = "research-resume-task-v1";

// Minimum interval the OS will try to honor between invocations. iOS treats
// this as a hint and may run the task less frequently (or not at all) based
// on the user's app usage patterns, battery state, and Background App Refresh
// settings.
const MIN_INTERVAL_MIN = 15;

TaskManager.defineTask(RESEARCH_RESUME_TASK, async () => {
  try {
    const { resumed, total } = await resumeOrphanedMemos();
    if (__DEV__) console.log(`[bg] research-resume: resumed ${resumed}/${total}`);
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch (e) {
    if (__DEV__) console.warn(`[bg] research-resume failed:`, e?.message);
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

// Call once during app boot. Safe to call repeatedly — idempotent.
export async function registerResearchBackgroundTask() {
  try {
    const status = await BackgroundTask.getStatusAsync();
    if (status === BackgroundTask.BackgroundTaskStatus.Restricted) return;
    const already = await TaskManager.isTaskRegisteredAsync(RESEARCH_RESUME_TASK);
    if (already) return;
    await BackgroundTask.registerTaskAsync(RESEARCH_RESUME_TASK, {
      minimumInterval: MIN_INTERVAL_MIN,
    });
  } catch (e) {
    // Non-fatal: background fetch may be disabled by the user or unsupported
    // on the current platform. The keep-awake + foreground-orphan-retry path
    // still works.
    if (__DEV__) console.warn("registerResearchBackgroundTask:", e?.message);
  }
}
