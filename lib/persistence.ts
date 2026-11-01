import type { User } from "@supabase/supabase-js";
import {
  DEFAULT_QUEST,
  DEFAULT_TASKS,
  DEFAULT_USER_PROFILE,
} from "@/lib/game";
import type {
  AppState,
  BenchmarkLog,
  BlockBenchmarkRun,
  BlockDayOverride,
  BlockProject,
  BlockRecoveryCheck,
  ParkingLotIdea,
  QuestTemplate,
  SeasonQuest,
  SkateBlockSnapshot,
  SkatePracticeLog,
  TrainingCheckIn,
  WorkoutSession,
} from "@/lib/state-types";
import type { StatKey, Task } from "@/lib/game";
import { getCurrentDateKey } from "@/lib/game";
import { supabase } from "@/lib/supabase";

export async function loadUserState(user: User): Promise<Partial<AppState>> {
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const { error: initializeProgramError } = await supabase.rpc("initialize_training_program");
  if (initializeProgramError) {
    throw new Error(initializeProgramError.message);
  }

  const today = getCurrentDateKey();
  const skateBlockRequest = loadSkateBlock(user);
  const results = await Promise.all([
      supabase.from("profiles").select("display_name, skating_start_date").eq("id", user.id).maybeSingle(),
      supabase.from("tasks").select("id, name, description, stat, xp, active, frequency").eq("active", true).order("created_at"),
      supabase.from("daily_completions").select("task_id, completion_date, xp_awarded").eq("user_id", user.id),
      supabase.from("quests").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
      supabase.from("skate_sessions").select("hours").eq("user_id", user.id),
      supabase.from("quest_templates").select("id, name, description, target_hours, completion_bonus_xp").eq("active", true).order("sort_order"),
      supabase.from("training_check_ins").select("check_in_date, knee_score, energy_score, co2_tolerance_seconds, workout_plan, skated, workout_completed, pm_recon_completed, sleep_hours").eq("user_id", user.id).order("check_in_date"),
      supabase.from("workout_sessions").select("id, plan, completed_at, exercises").eq("user_id", user.id).order("completed_at", { ascending: false }),
      supabase.from("training_programs").select("accumulated_focus_hours").eq("user_id", user.id).single(),
      supabase.from("training_quests").select("id, sort_order, name, description, target_focus_minutes, focused_minutes, status, started_at, completed_at").eq("user_id", user.id).order("sort_order"),
      supabase.from("skate_practice_logs").select("id, session_date, skate_minutes, focused_minutes, notes").eq("user_id", user.id).order("session_date", { ascending: false }),
      supabase.from("benchmark_logs").select("id, season_order, metric, value, notes, tested_at").eq("user_id", user.id).order("tested_at", { ascending: false }),
    ]);

  const [profileResult, tasksResult, completionsResult, questResult, sessionsResult, questTemplatesResult, checkInsResult, workoutSessionsResult, trainingProgramResult, seasonQuestsResult, skatePracticeLogsResult, benchmarkLogsResult] = results;
  const firstError = [...results].find(
    (result) => result.error,
  );
  if (firstError?.error) {
    throw new Error(firstError.error.message);
  }

  const skateBlock = await skateBlockRequest;
  const completions = completionsResult.data ?? [];
  const tasks = (tasksResult.data?.length ? tasksResult.data : DEFAULT_TASKS) as Task[];
  const statXp = Object.fromEntries(
    tasks.map((task) => [task.stat as StatKey, 0]),
  ) as AppState["statXp"];

  let totalXp = 0;
  for (const completion of completions) {
    totalXp += completion.xp_awarded;
    const task = tasks.find((candidate) => candidate.id === completion.task_id);
    if (task) {
      statXp[task.stat] = (statXp[task.stat] ?? 0) + completion.xp_awarded;
    }
  }

  const profile = profileResult.data;
  const questTemplates: QuestTemplate[] = (questTemplatesResult.data ?? []).map((template) => ({
    id: template.id,
    name: template.name,
    description: template.description,
    targetHours: Number(template.target_hours),
    completionBonusXp: template.completion_bonus_xp,
  }));
  const completedQuestXp = (questResult.data ?? [])
    .filter((candidate) => candidate.status === "completed")
    .reduce((sum, completedQuest) => sum + completedQuest.completion_bonus_xp, 0);
  const quest = (questResult.data ?? []).find((candidate) => candidate.status === "active") ?? null;

  return {
    displayName: profile?.display_name ?? user.email?.split("@")[0] ?? DEFAULT_USER_PROFILE.displayName,
    skatingStartDate: profile?.skating_start_date ?? DEFAULT_USER_PROFILE.skatingStartDate,
    totalXp: totalXp + completedQuestXp,
    statXp,
    tasks,
    completedToday: Object.fromEntries(
      completions
        .filter((completion) => completion.completion_date === today)
        .map((completion) => [completion.task_id, true]),
    ),
    completedDates: [...new Set(completions.map((completion) => completion.completion_date))],
    quest: quest
      ? {
          id: quest.id,
          name: quest.name,
          description: quest.description,
          targetHours: Number(quest.target_hours),
          completedHours: Number(quest.completed_hours),
          startedAt: quest.started_at,
          status: quest.status,
          completionBonusXp: quest.completion_bonus_xp,
        }
      : { ...DEFAULT_QUEST },
    totalSkateHours:
      (sessionsResult.data ?? []).reduce((sum, session) => sum + Number(session.hours), 0) +
      (skatePracticeLogsResult.data ?? []).reduce((sum, session) => sum + session.skate_minutes / 60, 0),
    questBonusAwarded: Boolean(quest?.status === "completed"),
    questTemplates,
    trainingCheckIns: (checkInsResult.data ?? []).map((checkIn): TrainingCheckIn => ({
      date: checkIn.check_in_date,
      kneeScore: checkIn.knee_score,
      energyScore: checkIn.energy_score,
      co2ToleranceSeconds: checkIn.co2_tolerance_seconds,
      sleepHours: checkIn.sleep_hours === null ? null : Number(checkIn.sleep_hours),
      skated: checkIn.skated,
      workoutCompleted: checkIn.workout_completed,
      pmReconCompleted: checkIn.pm_recon_completed,
      workoutPlan: checkIn.workout_plan,
    })),
    workoutSessions: (workoutSessionsResult.data ?? []).map((session): WorkoutSession => ({
      id: session.id,
      plan: session.plan,
      completedAt: session.completed_at,
      exercises: session.exercises,
    })),
    seasonQuests: (seasonQuestsResult.data ?? []).map((quest): SeasonQuest => ({
      id: quest.id,
      sortOrder: quest.sort_order,
      name: quest.name,
      description: quest.description,
      targetFocusMinutes: quest.target_focus_minutes,
      focusedMinutes: quest.focused_minutes,
      status: quest.status,
      startedAt: quest.started_at,
      completedAt: quest.completed_at,
    })),
    accumulatedFocusMinutes: Math.round(Number(trainingProgramResult.data?.accumulated_focus_hours ?? 0) * 60),
    skatePracticeLogs: (skatePracticeLogsResult.data ?? []).map((log): SkatePracticeLog => ({
      id: log.id,
      sessionDate: log.session_date,
      skateMinutes: log.skate_minutes,
      focusedMinutes: log.focused_minutes,
      notes: log.notes,
    })),
    benchmarkLogs: (benchmarkLogsResult.data ?? []).map((log): BenchmarkLog => ({
      id: log.id,
      seasonOrder: log.season_order,
      metric: log.metric,
      value: Number(log.value),
      notes: log.notes,
      testedAt: log.tested_at,
    })),
    skateBlock,
  };
}

// PostgREST and Postgres codes for a table that has not been created yet.
const MISSING_TABLE_ERROR_CODES = ["PGRST205", "42P01"];

// Loads the most recent block; reports "unavailable" until supabase/skate-block.sql has been run.
export async function loadSkateBlock(user: User): Promise<SkateBlockSnapshot> {
  if (!supabase) throw new Error("Supabase is not configured.");

  const { data: block, error: blockError } = await supabase
    .from("skate_blocks")
    .select("id, season_quest_id, start_date, review_date, benchmark_weeks, is_locked, focus_cue, benchmark_spot, gym_days, reviewed_at")
    .eq("user_id", user.id)
    .order("start_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (blockError) {
    if (MISSING_TABLE_ERROR_CODES.includes(blockError.code)) return { status: "unavailable" };
    throw new Error(blockError.message);
  }
  if (!block) return { status: "not-started" };

  const results = await Promise.all([
    supabase.from("block_projects").select("id, sort_order, name, role, location, trains, metric").eq("block_id", block.id).order("sort_order"),
    supabase.from("block_benchmark_runs").select("id, project_id, week, tested_on, attempts, value, conditions, video_url, block_projects!inner(block_id)").eq("block_projects.block_id", block.id).order("created_at"),
    supabase.from("block_day_overrides").select("override_date, session_kind, reason").eq("block_id", block.id),
    supabase.from("block_parking_lot").select("id, idea, created_at, decision").eq("block_id", block.id).order("created_at"),
    supabase.from("block_recovery_checks").select("session_date, lower_back_soreness, has_pain, note").eq("block_id", block.id).order("session_date"),
  ]);
  const [projectsResult, benchmarkRunsResult, dayOverridesResult, parkingLotResult, recoveryChecksResult] = results;
  const firstError = results.find((result) => result.error);
  if (firstError?.error) throw new Error(firstError.error.message);

  return {
    status: "ready",
    block: {
      id: block.id,
      seasonQuestId: block.season_quest_id,
      startDate: block.start_date,
      reviewDate: block.review_date,
      benchmarkWeeks: block.benchmark_weeks,
      isLocked: block.is_locked,
      focusCue: block.focus_cue,
      benchmarkSpot: block.benchmark_spot,
      gymDays: block.gym_days,
      reviewedAt: block.reviewed_at,
    },
    projects: (projectsResult.data ?? []).map((project): BlockProject => ({
      id: project.id,
      sortOrder: project.sort_order,
      name: project.name,
      role: project.role,
      location: project.location,
      trains: project.trains,
      metric: project.metric,
    })),
    benchmarkRuns: (benchmarkRunsResult.data ?? []).map((run): BlockBenchmarkRun => ({
      id: run.id,
      projectId: run.project_id,
      week: run.week,
      testedOn: run.tested_on,
      attempts: run.attempts,
      value: run.value === null ? null : Number(run.value),
      conditions: run.conditions,
      videoUrl: run.video_url,
    })),
    dayOverrides: (dayOverridesResult.data ?? []).map((override): BlockDayOverride => ({
      date: override.override_date,
      sessionKind: override.session_kind,
      reason: override.reason,
    })),
    parkingLot: (parkingLotResult.data ?? []).map((idea): ParkingLotIdea => ({
      id: idea.id,
      idea: idea.idea,
      createdAt: idea.created_at,
      decision: idea.decision,
    })),
    recoveryChecks: (recoveryChecksResult.data ?? []).map((check): BlockRecoveryCheck => ({
      sessionDate: check.session_date,
      lowerBackSoreness: check.lower_back_soreness,
      hasPain: check.has_pain,
      note: check.note,
    })),
  };
}

export async function createSkateBlock(block: {
  startDate: string;
  focusCue: string;
  benchmarkSpot: string;
  gymDays: number[];
}) {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { error } = await supabase.rpc("create_skate_block", {
    p_start_date: block.startDate,
    p_focus_cue: block.focusCue,
    p_benchmark_spot: block.benchmarkSpot,
    p_gym_days: block.gymDays,
  });
  if (error) throw new Error(error.message);
}

export async function logBlockBenchmark(run: Omit<BlockBenchmarkRun, "id">) {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { error } = await supabase.rpc("log_block_benchmark", {
    p_project_id: run.projectId,
    p_week: run.week,
    p_tested_on: run.testedOn,
    p_attempts: run.attempts,
    p_value: run.value,
    p_conditions: run.conditions,
    p_video_url: run.videoUrl,
  });
  if (error) throw new Error(error.message);
}

export async function setBlockDayOverride(
  blockId: string,
  date: string,
  sessionKind: BlockDayOverride["sessionKind"] | null,
  reason: string,
) {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { error } = await supabase.rpc("set_block_day_override", {
    p_block_id: blockId,
    p_override_date: date,
    p_session_kind: sessionKind,
    p_reason: reason,
  });
  if (error) throw new Error(error.message);
}

export async function addParkingLotIdea(blockId: string, idea: string) {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { error } = await supabase.rpc("add_parking_lot_idea", { p_block_id: blockId, p_idea: idea });
  if (error) throw new Error(error.message);
}

export async function logBlockRecoveryCheck(blockId: string, check: BlockRecoveryCheck) {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { error } = await supabase.rpc("log_block_recovery_check", {
    p_block_id: blockId,
    p_session_date: check.sessionDate,
    p_lower_back_soreness: check.lowerBackSoreness,
    p_has_pain: check.hasPain,
    p_note: check.note,
  });
  if (error) throw new Error(error.message);
}

export async function completeBlockReview(blockId: string, adoptedIdeaId: string | null) {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { error } = await supabase.rpc("complete_block_review", {
    p_block_id: blockId,
    p_adopted_idea_id: adoptedIdeaId,
  });
  if (error) throw new Error(error.message);
}

export async function ensureUserProfile(user: User, displayName: string, skatingStartDate: string) {
  if (!supabase) throw new Error("Supabase is not configured.");

  const { error } = await supabase.from("profiles").upsert({
    id: user.id,
    display_name: displayName,
    skating_start_date: skatingStartDate,
  });
  if (error) throw new Error(error.message);
}

export async function completeTask(user: User, taskId: string, date: string) {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data: task, error: taskError } = await supabase.from("tasks").select("xp").eq("id", taskId).single();
  if (taskError) throw new Error(taskError.message);

  const { error } = await supabase.from("daily_completions").insert({
    user_id: user.id,
    task_id: taskId,
    completion_date: date,
    xp_awarded: task.xp,
  });
  if (error && error.code !== "23505") throw new Error(error.message);
}

export async function saveTrainingCheckIn(
  user: User,
  checkIn: TrainingCheckIn,
) {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { error } = await supabase.from("training_check_ins").upsert(
    {
      user_id: user.id,
      check_in_date: checkIn.date,
      knee_score: checkIn.kneeScore,
      energy_score: checkIn.energyScore,
      co2_tolerance_seconds: checkIn.co2ToleranceSeconds,
      workout_plan: checkIn.workoutPlan,
      skated: checkIn.skated,
      workout_completed: checkIn.workoutCompleted,
      pm_recon_completed: checkIn.pmReconCompleted,
      sleep_hours: checkIn.sleepHours,
    },
    { onConflict: "user_id,check_in_date" },
  );
  if (error) throw new Error(error.message);
}

export async function reorderTrainingQuests(ids: string[]) {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { error } = await supabase.rpc("reorder_training_quests", { p_order: ids });
  if (error) throw new Error(error.message);
}

export async function renameTrainingQuest(id: string, name: string, description: string) {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { error } = await supabase.rpc("rename_training_quest", {
    p_quest_id: id,
    p_name: name,
    p_description: description,
  });
  if (error) throw new Error(error.message);
}

export async function startTrainingQuest(id: string) {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { error } = await supabase.rpc("start_training_quest", { p_quest_id: id });
  if (error) throw new Error(error.message);
}

export async function logSkatePractice(
  session: Omit<SkatePracticeLog, "id">,
) {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase.rpc("log_skate_practice", {
    p_session_date: session.sessionDate,
    p_skate_minutes: session.skateMinutes,
    p_focused_minutes: session.focusedMinutes,
    p_notes: session.notes,
  });
  if (error) throw new Error(error.message);
  return data;
}

export async function logBenchmark(
  entry: Omit<BenchmarkLog, "id"> & { questId: string },
) {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase.rpc("log_benchmark", {
    p_quest_id: entry.questId,
    p_metric: entry.metric,
    p_value: entry.value,
    p_notes: entry.notes,
    p_tested_at: entry.testedAt,
  });
  if (error) throw new Error(error.message);
  return data;
}

export async function saveWorkoutSession(user: User, session: WorkoutSession) {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { error } = await supabase.from("workout_sessions").upsert(
    {
      id: session.id,
      user_id: user.id,
      plan: session.plan,
      completed_at: session.completedAt,
      exercises: session.exercises,
    },
    { onConflict: "id" },
  );
  if (error) throw new Error(error.message);
}

export async function logQuestHours(user: User, questId: string, hours: number) {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data: quest, error: questError } = await supabase.from("quests").select("*").eq("id", questId).eq("user_id", user.id).single();
  if (questError) throw new Error(questError.message);

  const completedHours = Math.min(Number(quest.completed_hours) + hours, Number(quest.target_hours));
  const isComplete = completedHours >= Number(quest.target_hours);
  const { error } = await supabase
    .from("quests")
    .update({
      completed_hours: completedHours,
      status: isComplete ? "completed" : "active",
      completed_at: isComplete ? new Date().toISOString() : null,
    })
    .eq("id", questId)
    .eq("user_id", user.id);
  if (error) throw new Error(error.message);
}

export async function logSkateHours(user: User, hours: number) {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { error } = await supabase.from("skate_sessions").insert({
    user_id: user.id,
    hours,
    session_date: getCurrentDateKey(),
  });
  if (error) throw new Error(error.message);
}

export async function startQuestFromTemplate(user: User, template: QuestTemplate) {
  if (!supabase) throw new Error("Supabase is not configured.");

  const { data: quest, error } = await supabase
    .from("quests")
    .insert({
      user_id: user.id,
      name: template.name,
      description: template.description,
      target_hours: template.targetHours,
      completed_hours: 0,
      status: "active",
      started_at: getCurrentDateKey(),
      completion_bonus_xp: template.completionBonusXp,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  return {
    id: quest.id,
    name: quest.name,
    description: quest.description,
    targetHours: Number(quest.target_hours),
    completedHours: Number(quest.completed_hours),
    startedAt: quest.started_at,
    status: quest.status,
    completionBonusXp: quest.completion_bonus_xp,
  };
}
