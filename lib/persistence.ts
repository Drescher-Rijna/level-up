import type { User } from "@supabase/supabase-js";
import {
  DEFAULT_QUEST,
  DEFAULT_TASKS,
  DEFAULT_USER_PROFILE,
} from "@/lib/game";
import type { AppState } from "@/lib/state-types";
import type { QuestTemplate } from "@/lib/state-types";
import type { StatKey, Task } from "@/lib/game";
import { getCurrentDateKey } from "@/lib/game";
import { supabase } from "@/lib/supabase";

export async function loadUserState(user: User): Promise<Partial<AppState>> {
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const today = getCurrentDateKey();
  const results = await Promise.all([
      supabase.from("profiles").select("display_name, skating_start_date").eq("id", user.id).maybeSingle(),
      supabase.from("tasks").select("id, name, description, stat, xp, active, frequency").eq("active", true).order("created_at"),
      supabase.from("daily_completions").select("task_id, completion_date, xp_awarded").eq("user_id", user.id),
      supabase.from("quests").select("*").eq("user_id", user.id).eq("status", "active").order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("skate_sessions").select("hours").eq("user_id", user.id),
      supabase.from("quest_templates").select("id, name, description, target_hours, completion_bonus_xp").eq("active", true).order("sort_order"),
    ]);

  const [profileResult, tasksResult, completionsResult, questResult, sessionsResult, questTemplatesResult] = results;
  const firstError = [profileResult, tasksResult, completionsResult, questResult, sessionsResult, questTemplatesResult].find(
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
  let quest = questResult.data;

  if (!quest) {
    const { data: createdQuest, error: createQuestError } = await supabase
      .from("quests")
      .insert({
        user_id: user.id,
        name: DEFAULT_QUEST.name,
        description: DEFAULT_QUEST.description,
        target_hours: DEFAULT_QUEST.targetHours,
        completed_hours: 0,
        status: "active",
        started_at: getCurrentDateKey(),
        completion_bonus_xp: DEFAULT_QUEST.completionBonusXp,
      })
      .select("*")
      .single();

    if (createQuestError) {
      throw new Error(createQuestError.message);
    }
    quest = createdQuest;
  }

  return {
    displayName: profile?.display_name ?? user.email?.split("@")[0] ?? DEFAULT_USER_PROFILE.displayName,
    skatingStartDate: profile?.skating_start_date ?? DEFAULT_USER_PROFILE.skatingStartDate,
    totalXp,
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
    totalSkateHours: (sessionsResult.data ?? []).reduce((sum, session) => sum + Number(session.hours), 0),
    questBonusAwarded: Boolean(quest?.status === "completed"),
    questTemplates,
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
