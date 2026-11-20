import { progressionSupabase } from "@/lib/progression-supabase";
import { DEFAULT_TASKS, DEFAULT_USER_PROFILE, getCurrentDateKey } from "@/lib/game";
import type { Task } from "@/lib/game";

export type TrickCategory = "flat_gap" | "grind_slide";
export type Stance = "Regular" | "Fakie" | "Nollie" | "Switch";
export type QuestSlot = "A" | "B" | "C";
export type StanceComfort = "Beginner" | "Solid" | "Advanced";
export type StanceComfortRatings = Record<Stance, StanceComfort>;

export type Trick = {
  id: string;
  category: TrickCategory;
  name: string;
  direction: "none" | "FS" | "BS";
  stance: Stance;
  sort_order: number;
};

export type TrickProgress = {
  id: string;
  trick_id: string;
  tier: number;
  score: number;
  attempts: number;
  makes: number;
  consecutive_makes: number;
};

export type MicroSkill = {
  id: string;
  name: string;
  drill_description: string;
  overlay_cue: string;
  benchmark_test: string;
  logged_minutes: number;
  benchmark_passed: boolean;
};

export type TrainingCycle = {
  id: string;
  start_date: string;
  end_date: string;
  status: "active" | "completed";
  active_micro_skill_id: string;
  slot_a_progress_id: string;
  slot_b_progress_id: string;
  slot_c_progress_id: string;
};

export type SessionLog = {
  id: string;
  session_date: string;
  duration_minutes: number;
  session_type: string;
  filmed_diagnostic: boolean;
  active_quest_work: boolean;
  warmup_minutes: number;
  overlay_minutes: number;
};

export type VaultEntry = {
  id: string;
  trick_name: string;
  obstacle: string | null;
  parent_tricks: string | null;
  first_landed_at: string;
  is_consistent: boolean;
};

export type ProgressionBaseline = {
  stance_comfort: StanceComfortRatings;
  completed_at: string;
};

export type ProgressionSnapshot = {
  tricks: Trick[];
  progress: TrickProgress[];
  microSkills: MicroSkill[];
  cycle: TrainingCycle | null;
  sessions: SessionLog[];
  vault: VaultEntry[];
  baseline: ProgressionBaseline | null;
};

export type DashboardState = {
  displayName: string;
  totalXp: number;
  tasks: Task[];
  completedToday: Record<string, boolean>;
  completedDates: string[];
};

function getClient() {
  if (!progressionSupabase) {
    throw new Error("Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  }
  return progressionSupabase;
}

function throwOnError(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

export async function loadProgressionSnapshot(userId: string): Promise<ProgressionSnapshot> {
  const client = getClient();
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - 6);
  const startDate = [
    weekStart.getFullYear(),
    String(weekStart.getMonth() + 1).padStart(2, "0"),
    String(weekStart.getDate()).padStart(2, "0"),
  ].join("-");

  const [tricksResult, progressResult, skillsResult, cycleResult, sessionsResult, vaultResult, baselineResult] =
    await Promise.all([
      client.from("tricks_catalog").select("id, category, name, direction, stance, sort_order").order("sort_order"),
      client.from("user_trick_progress").select("id, trick_id, tier, score, attempts, makes, consecutive_makes").eq("user_id", userId),
      client.from("micro_skills").select("id, name, drill_description, overlay_cue, benchmark_test, logged_minutes, benchmark_passed").eq("user_id", userId).order("name"),
      client.from("training_cycles").select("id, start_date, end_date, status, active_micro_skill_id, slot_a_progress_id, slot_b_progress_id, slot_c_progress_id").eq("user_id", userId).eq("status", "active").order("start_date", { ascending: false }).limit(1).maybeSingle(),
      client.from("session_logs").select("id, session_date, duration_minutes, session_type, filmed_diagnostic, active_quest_work, warmup_minutes, overlay_minutes").eq("user_id", userId).gte("session_date", startDate).order("session_date", { ascending: false }),
      client.from("playtime_vault").select("id, trick_name, obstacle, parent_tricks, first_landed_at, is_consistent").eq("user_id", userId).order("created_at", { ascending: false }),
      client.from("user_progression_baselines").select("stance_comfort, completed_at").eq("user_id", userId).maybeSingle(),
    ]);

  const firstError = [
    tricksResult.error,
    progressResult.error,
    skillsResult.error,
    cycleResult.error,
    sessionsResult.error,
    vaultResult.error,
    baselineResult.error,
  ].find(Boolean);
  throwOnError(firstError ?? null);

  return {
    tricks: (tricksResult.data ?? []) as Trick[],
    progress: (progressResult.data ?? []) as TrickProgress[],
    microSkills: (skillsResult.data ?? []) as MicroSkill[],
    cycle: cycleResult.data as TrainingCycle | null,
    sessions: (sessionsResult.data ?? []) as SessionLog[],
    vault: (vaultResult.data ?? []) as VaultEntry[],
    baseline: baselineResult.data as ProgressionBaseline | null,
  };
}

export async function loadDashboardState(userId: string, userEmail?: string | null): Promise<DashboardState> {
  const client = getClient();
  const [profileResult, tasksResult, completionsResult, questsResult] = await Promise.all([
    client.from("profiles").select("display_name").eq("id", userId).maybeSingle(),
    client.from("tasks").select("id, name, description, stat, xp, active, frequency").eq("active", true).order("created_at"),
    client.from("daily_completions").select("task_id, completion_date, xp_awarded").eq("user_id", userId),
    client.from("quests").select("completion_bonus_xp").eq("user_id", userId).eq("status", "completed"),
  ]);
  const firstError = [profileResult.error, tasksResult.error, completionsResult.error, questsResult.error].find(Boolean);
  throwOnError(firstError ?? null);

  const completions = completionsResult.data ?? [];
  const today = getCurrentDateKey();
  return {
    displayName: profileResult.data?.display_name ?? userEmail?.split("@")[0] ?? DEFAULT_USER_PROFILE.displayName,
    totalXp: completions.reduce((sum, completion) => sum + completion.xp_awarded, 0) +
      (questsResult.data ?? []).reduce((sum, quest) => sum + quest.completion_bonus_xp, 0),
    tasks: (tasksResult.data?.length ? tasksResult.data : DEFAULT_TASKS) as Task[],
    completedToday: Object.fromEntries(
      completions
        .filter((completion) => completion.completion_date === today)
        .map((completion) => [completion.task_id, true]),
    ),
    completedDates: [...new Set(completions.map((completion) => completion.completion_date))],
  };
}

export async function completeDashboardTask(userId: string, taskId: string, date: string) {
  const client = getClient();
  const { data: task, error: taskError } = await client.from("tasks").select("xp").eq("id", taskId).maybeSingle();
  throwOnError(taskError);
  if (!task) throw new Error("The selected checklist task is not configured.");

  const { error } = await client.from("daily_completions").insert({
    user_id: userId,
    task_id: taskId,
    completion_date: date,
    xp_awarded: task.xp,
  });
  if (error && error.code !== "23505") throw new Error(error.message);
}

export function eligibleProgress(
  snapshot: Pick<ProgressionSnapshot, "tricks" | "progress">,
  slot: QuestSlot,
  excludedIds: string[] = [],
) {
  const tricksById = new Map(snapshot.tricks.map((trick) => [trick.id, trick]));
  const scores = new Map(
    snapshot.progress.map((progress) => [`${progress.trick_id}:${progress.tier}`, progress.score]),
  );

  return snapshot.progress
    .filter((progress) => {
      const trick = tricksById.get(progress.trick_id);
      if (!trick || progress.score >= 3 || excludedIds.includes(progress.id)) return false;
      if (slot === "A" && trick.category !== "flat_gap") return false;
      if (slot === "B" && trick.category !== "grind_slide") return false;
      if (slot === "C" && trick.stance === "Regular") return false;
      return progress.tier === 1 || scores.get(`${progress.trick_id}:${progress.tier - 1}`) === 3;
    })
    .sort((first, second) => {
      const firstTrick = tricksById.get(first.trick_id);
      const secondTrick = tricksById.get(second.trick_id);
      return (
        second.score - first.score ||
        first.tier - second.tier ||
        (firstTrick?.sort_order ?? 0) - (secondTrick?.sort_order ?? 0)
      );
    });
}

export function getTrickLabel(trick: Trick) {
  return `${trick.direction === "none" ? "" : `${trick.direction} `}${trick.name} · ${trick.stance}`;
}

export function getProgressionError(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

export async function createTrainingCycle(input: {
  activeMicroSkillId: string;
  slotAProgressId: string;
  slotBProgressId: string;
  slotCProgressId: string;
}) {
  const { data, error } = await getClient().rpc("create_training_cycle", {
    p_active_micro_skill_id: input.activeMicroSkillId,
    p_slot_a_progress_id: input.slotAProgressId,
    p_slot_b_progress_id: input.slotBProgressId,
    p_slot_c_progress_id: input.slotCProgressId,
  });
  throwOnError(error);
  return data as string;
}

export async function completeProgressionBaseline(input: {
  stanceComfort: StanceComfortRatings;
  trickAssessments: {
    trickId: string;
    highestTier: number;
    workingOnNext: boolean;
  }[];
  microSkillHours: {
    microSkillId: string;
    hours: number;
  }[];
}) {
  const { error } = await getClient().rpc("complete_progression_baseline", {
    p_stance_comfort: input.stanceComfort,
    p_trick_assessments: input.trickAssessments.map((assessment) => ({
      trick_id: assessment.trickId,
      highest_tier: assessment.highestTier,
      working_on_next: assessment.workingOnNext,
    })),
    p_skill_hours: input.microSkillHours.map((skill) => ({
      micro_skill_id: skill.microSkillId,
      hours: skill.hours,
    })),
  });
  throwOnError(error);
}

export async function replaceTrainingCycleSlot(cycleId: string, slot: QuestSlot, progressId: string) {
  const { error } = await getClient().rpc("replace_training_cycle_slot", {
    p_cycle_id: cycleId,
    p_slot: slot,
    p_progress_id: progressId,
  });
  throwOnError(error);
}

export async function recordProgressionMake(cycleId: string, progressId: string, qualityConfirmed: boolean) {
  const { data, error } = await getClient().rpc("record_progression_make", {
    p_cycle_id: cycleId,
    p_progress_id: progressId,
    p_quality_confirmed: qualityConfirmed,
  });
  throwOnError(error);
  return data as {
    score: number;
    consecutive_makes: number;
    slot: QuestSlot;
    cycle_completed: boolean;
  };
}

export async function recordProgressionMiss(cycleId: string, progressId: string) {
  const { error } = await getClient().rpc("record_progression_miss", {
    p_cycle_id: cycleId,
    p_progress_id: progressId,
  });
  throwOnError(error);
}

export async function logProgressionSession(input: {
  durationMinutes: number;
  sessionType: string;
  filmedDiagnostic: boolean;
  activeQuestWork: boolean;
  notes: string;
}) {
  const { error } = await getClient().rpc("log_progression_session", {
    p_duration_minutes: input.durationMinutes,
    p_session_type: input.sessionType,
    p_film_diagnostic: input.filmedDiagnostic,
    p_active_quest_work: input.activeQuestWork,
    p_notes: input.notes,
  });
  throwOnError(error);
}

export async function setMicroSkillBenchmark(microSkillId: string, passed: boolean) {
  const { error } = await getClient().rpc("set_micro_skill_benchmark", {
    p_micro_skill_id: microSkillId,
    p_passed: passed,
  });
  throwOnError(error);
}

export async function addVaultEntry(input: {
  userId: string;
  trickName: string;
  obstacle: string;
  parentTricks: string;
  firstLandedAt: string;
}) {
  const { data, error } = await getClient()
    .from("playtime_vault")
    .insert({
      user_id: input.userId,
      trick_name: input.trickName.trim(),
      obstacle: input.obstacle.trim() || null,
      parent_tricks: input.parentTricks.trim() || null,
      first_landed_at: input.firstLandedAt,
    })
    .select("id, trick_name, obstacle, parent_tricks, first_landed_at, is_consistent")
    .single();
  throwOnError(error);
  return data as VaultEntry;
}

export async function updateVaultConsistency(entryId: string, consistent: boolean) {
  const { error } = await getClient().from("playtime_vault").update({ is_consistent: consistent }).eq("id", entryId);
  throwOnError(error);
}

export async function deleteVaultEntry(entryId: string) {
  const { error } = await getClient().from("playtime_vault").delete().eq("id", entryId);
  throwOnError(error);
}
