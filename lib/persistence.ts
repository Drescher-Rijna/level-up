import type { User } from "@supabase/supabase-js";
import {
  DEFAULT_QUEST,
  DEFAULT_TASKS,
  DEFAULT_USER_PROFILE,
} from "@/lib/game";
import type {
  AppState,
  BenchmarkLog,
  QuestTemplate,
  SeasonQuest,
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
  };
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
