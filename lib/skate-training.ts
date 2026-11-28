import {
  getProgressionSupabaseClient,
} from "@/lib/progression-supabase";

export type SkateFamily = {
  id: string;
  name: string;
  sort_order: number;
};

export type SkateTrick = {
  id: string;
  family_id: string;
  name: string;
  sort_order: number;
};

export type SkateStance = {
  id: "Regular" | "Switch" | "Nollie" | "Fakie";
  sort_order: number;
};

export type SkateMetaSkill = {
  id: string;
  name: string;
  sort_order: number;
};

export type SkateLevelLabel = {
  id: string;
  name: string;
};

export type SkateEligibility = {
  id: string;
  trick_id: string;
  stance_id: SkateStance["id"];
  eligible: boolean;
};

export type SkateProgressionStage = {
  id: string;
  trick_id: string;
  stance_id: SkateStance["id"];
  label_id: string;
  position: number;
};

export type SkateTrickStanceProgress = {
  trick_id: string;
  stance_id: SkateStance["id"];
  current_stage_id: string | null;
};

export type SkateTrainingSettings = {
  sets_per_trick: number;
  attempts_per_set: number;
  benchmark_landed: number;
};

export type SkateCycle = {
  id: string;
  meta_skill_id: string;
  status: "draft" | "active" | "completed";
  eligible_combinations: number;
  created_at: string;
  confirmed_at: string | null;
  completed_at: string | null;
};

export type SkateCycleEligibleCombination = {
  trick_id: string;
  stance_id: SkateStance["id"];
};

export type SkateCycleSession = {
  id: string;
  session_number: number;
  status: "planned" | "completed";
  completed_at: string | null;
};

export type SkateCycleSessionTrick = {
  id: string;
  cycle_session_id: string;
  superset: "A" | "B";
  stance_id: SkateStance["id"];
  trick_id: string | null;
  progression_stage_id: string | null;
  progression_label_snapshot: string | null;
  next_stage_id: string | null;
  next_label_snapshot: string | null;
};

export type SkatePracticeSession = {
  id: string;
  cycle_id: string;
  cycle_session_id: string;
  duration_minutes: number;
  notes: string;
  completed_at: string;
};

export type SkateSetResult = {
  id: string;
  practice_session_id: string;
  cycle_session_trick_id: string;
  set_number: number;
  attempts: number;
  landed: number;
};

export type SkateProgressionHistory = {
  id: string;
  trick_id: string;
  stance_id: SkateStance["id"];
  from_label: string | null;
  to_label: string;
  practice_session_id: string;
  advanced_at: string;
};

export type SkateSessionDraftResult = {
  assignment_id: string;
  sets: number[];
};

export type SkateCycleSessionDraft = {
  cycle_session_id: string;
  set_results: SkateSessionDraftResult[];
  duration_minutes: number;
  notes: string;
};

export type SkateTrainingData = {
  families: SkateFamily[];
  tricks: SkateTrick[];
  stances: SkateStance[];
  metaSkills: SkateMetaSkill[];
  labels: SkateLevelLabel[];
  eligibility: SkateEligibility[];
  stages: SkateProgressionStage[];
  progress: SkateTrickStanceProgress[];
  settings: SkateTrainingSettings;
  cycle: SkateCycle | null;
  cycleEligibleCombinations: SkateCycleEligibleCombination[];
  cycleSessions: SkateCycleSession[];
  cycleSessionTricks: SkateCycleSessionTrick[];
  sessionDrafts: SkateCycleSessionDraft[];
  practices: SkatePracticeSession[];
  setResults: SkateSetResult[];
  progressionHistory: SkateProgressionHistory[];
};

function getClient() {
  const client = getProgressionSupabaseClient();
  if (!client) {
    throw new Error("Supabase is not configured. Add the required values to .env.local.");
  }
  return client;
}

function requireData<T>(
  result: { data: T | null; error: { message: string } | null },
  resource: string,
): T {
  if (result.error) {
    throw new Error(`Could not load ${resource}: ${result.error.message}`);
  }
  return result.data as T;
}

function requireSuccess(result: { error: { message: string } | null }, operation: string) {
  if (result.error) {
    throw new Error(`${operation}: ${result.error.message}`);
  }
}

const SUPABASE_PAGE_SIZE = 1000;

async function loadAllPages<T>(
  resource: string,
  fetchPage: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const rows: T[] = [];

  for (let from = 0; ; from += SUPABASE_PAGE_SIZE) {
    const page = requireData<T[]>(
      await fetchPage(from, from + SUPABASE_PAGE_SIZE - 1),
      resource,
    );
    rows.push(...page);
    if (page.length < SUPABASE_PAGE_SIZE) return rows;
  }
}

export async function loadSkateTrainingData(userId: string): Promise<SkateTrainingData> {
  const client = getClient();
  const [
    familiesResult,
    tricksResult,
    stancesResult,
    metaSkillsResult,
    labelsResult,
    eligibilityResult,
    stages,
    progressResult,
    settingsResult,
    cycleResult,
    practicesResult,
    progressionHistory,
  ] = await Promise.all([
    client.from("skate_trick_families").select("id, name, sort_order").order("sort_order"),
    client.from("skate_tricks").select("id, family_id, name, sort_order").order("sort_order"),
    client.from("skate_stances").select("id, sort_order").order("sort_order"),
    client.from("skate_meta_skills").select("id, name, sort_order").eq("user_id", userId).order("sort_order"),
    client.from("skate_level_labels").select("id, name").eq("user_id", userId).order("name"),
    client.from("skate_trick_stance_eligibility").select("id, trick_id, stance_id, eligible").eq("user_id", userId),
    loadAllPages<SkateProgressionStage>(
      "trick progression stages",
      (from, to) => client.from("skate_progression_stages")
        .select("id, trick_id, stance_id, label_id, position")
        .eq("user_id", userId)
        .order("trick_id")
        .order("stance_id")
        .order("position")
        .order("id")
        .range(from, to),
    ),
    client.from("skate_trick_stance_progress").select("trick_id, stance_id, current_stage_id").eq("user_id", userId),
    client.from("skate_training_settings").select("sets_per_trick, attempts_per_set, benchmark_landed").eq("user_id", userId).maybeSingle(),
    client.from("skate_cycles").select("id, meta_skill_id, status, eligible_combinations, created_at, confirmed_at, completed_at").eq("user_id", userId).in("status", ["draft", "active"]).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    client.from("skate_practice_sessions").select("id, cycle_id, cycle_session_id, duration_minutes, notes, completed_at").eq("user_id", userId).order("completed_at", { ascending: false }).limit(30),
    loadAllPages<SkateProgressionHistory>(
      "progression history",
      (from, to) => client.from("skate_progression_history")
        .select("id, trick_id, stance_id, from_label, to_label, practice_session_id, advanced_at")
        .eq("user_id", userId)
        .order("advanced_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, to),
    ),
  ]);

  const cycle = requireData<SkateCycle | null>(cycleResult, "the current cycle");
  const practices = requireData<SkatePracticeSession[]>(practicesResult, "practice history");
  const cycleSessionsResult = cycle
    ? await client.from("skate_cycle_sessions")
      .select("id, session_number, status, completed_at")
      .eq("cycle_id", cycle.id)
      .order("session_number")
    : { data: [] as SkateCycleSession[], error: null };
  const cycleEligibilityResult = cycle
    ? await client.from("skate_cycle_eligible_combinations")
      .select("trick_id, stance_id")
      .eq("cycle_id", cycle.id)
    : { data: [] as SkateCycleEligibleCombination[], error: null };
  const cycleSessions = requireData<SkateCycleSession[]>(cycleSessionsResult, "cycle sessions");
  const sessionIds = cycleSessions.map((session) => session.id);
  const practiceIds = practices.map((session) => session.id);
  const [assignmentsResult, draftsResult, setResultsResult] = await Promise.all([
    sessionIds.length
      ? client.from("skate_cycle_session_tricks")
        .select("id, cycle_session_id, superset, stance_id, trick_id, progression_stage_id, progression_label_snapshot, next_stage_id, next_label_snapshot")
        .in("cycle_session_id", sessionIds)
      : Promise.resolve({ data: [] as SkateCycleSessionTrick[], error: null }),
    sessionIds.length
      ? client.from("skate_cycle_session_drafts")
        .select("cycle_session_id, set_results, duration_minutes, notes")
        .eq("user_id", userId)
        .in("cycle_session_id", sessionIds)
      : Promise.resolve({ data: [] as SkateCycleSessionDraft[], error: null }),
    practiceIds.length
      ? client.from("skate_set_results")
        .select("id, practice_session_id, cycle_session_trick_id, set_number, attempts, landed")
        .in("practice_session_id", practiceIds)
      : Promise.resolve({ data: [] as SkateSetResult[], error: null }),
  ]);

  const settings = requireData<SkateTrainingSettings | null>(settingsResult, "training settings");
  if (!settings) {
    throw new Error("Training settings are missing. Re-run the skate training database setup.");
  }

  return {
    families: requireData<SkateFamily[]>(familiesResult, "trick families"),
    tricks: requireData<SkateTrick[]>(tricksResult, "tricks"),
    stances: requireData<SkateStance[]>(stancesResult, "stances"),
    metaSkills: requireData<SkateMetaSkill[]>(metaSkillsResult, "meta-skills"),
    labels: requireData<SkateLevelLabel[]>(labelsResult, "level labels"),
    eligibility: requireData<SkateEligibility[]>(eligibilityResult, "trick eligibility"),
    stages,
    progress: requireData<SkateTrickStanceProgress[]>(progressResult, "trick progression"),
    settings,
    cycle,
    cycleEligibleCombinations: requireData<SkateCycleEligibleCombination[]>(
      cycleEligibilityResult,
      "cycle eligibility snapshot",
    ),
    cycleSessions,
    cycleSessionTricks: requireData<SkateCycleSessionTrick[]>(assignmentsResult, "cycle assignments"),
    sessionDrafts: requireData<SkateCycleSessionDraft[]>(draftsResult, "session drafts"),
    practices,
    setResults: requireData<SkateSetResult[]>(setResultsResult, "set results"),
    progressionHistory,
  };
}

export async function createSkateCycleDraft(
  metaSkillId: string,
  sessions: unknown[],
): Promise<string> {
  const { data, error } = await getClient().rpc("create_skate_cycle_draft", {
    p_meta_skill_id: metaSkillId,
    p_sessions: sessions,
  });
  if (error) throw new Error(`Could not generate cycle: ${error.message}`);
  if (typeof data !== "string") throw new Error("Could not generate cycle: no cycle ID was returned.");
  return data;
}

export async function regenerateSkateCycleDraft(cycleId: string, sessions: unknown[]) {
  const result = await getClient().rpc("regenerate_skate_cycle_draft", {
    p_cycle_id: cycleId,
    p_sessions: sessions,
  });
  requireSuccess(result, "Could not rearrange cycle");
}

export async function confirmSkateCycle(cycleId: string) {
  const result = await getClient().rpc("confirm_skate_cycle", { p_cycle_id: cycleId });
  requireSuccess(result, "Could not confirm cycle");
}

export async function deleteSkateCycleDraft(cycleId: string) {
  const result = await getClient().rpc("delete_skate_cycle_draft", { p_cycle_id: cycleId });
  requireSuccess(result, "Could not delete cycle draft");
}

export async function saveSkateSessionDraft(
  cycleSessionId: string,
  results: SkateSessionDraftResult[],
  durationMinutes: number,
  notes: string,
) {
  const result = await getClient().rpc("save_skate_session_draft", {
    p_cycle_session_id: cycleSessionId,
    p_results: results,
    p_duration_minutes: durationMinutes,
    p_notes: notes,
  });
  requireSuccess(result, "Could not save session progress");
}

export async function completeSkateSession(input: {
  cycleSessionId: string;
  durationMinutes: number;
  notes: string;
  results: SkateSessionDraftResult[];
}) {
  const { data, error } = await getClient().rpc("complete_skate_session", {
    p_cycle_session_id: input.cycleSessionId,
    p_duration_minutes: input.durationMinutes,
    p_notes: input.notes,
    p_results: input.results,
  });
  if (error) throw new Error(`Could not finish session: ${error.message}`);
  return data as {
    practice_session_id: string;
    cycle_completed: boolean;
    total_landed: number;
    progression_advancements: number;
  };
}

export async function saveSkateProgressionStages(input: {
  trickId: string;
  stanceId: string;
  labelIds: string[];
  confirmStageChange: boolean;
}) {
  const result = await getClient().rpc("save_skate_progression_stages", {
    p_trick_id: input.trickId,
    p_stance_id: input.stanceId,
    p_label_ids: input.labelIds,
    p_confirm_stage_change: input.confirmStageChange,
  });
  requireSuccess(result, "Could not save trick progression");
}

export async function setSkateEligibility(
  userId: string,
  trickId: string,
  stanceId: SkateStance["id"],
  eligible: boolean,
) {
  const result = await getClient()
    .from("skate_trick_stance_eligibility")
    .update({ eligible, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("trick_id", trickId)
    .eq("stance_id", stanceId)
    .select("id")
    .single();
  requireSuccess(result, "Could not update trick eligibility");
}

export async function setWholeTrickEligibility(
  trickId: string,
  eligible: boolean,
) {
  const result = await getClient().rpc("set_skate_trick_eligibility", {
    p_trick_id: trickId,
    p_eligible: eligible,
  });
  requireSuccess(result, "Could not update trick eligibility");
}

export async function createSkateMetaSkill(userId: string, name: string, sortOrder: number) {
  const result = await getClient().from("skate_meta_skills").insert({
    user_id: userId,
    name,
    sort_order: sortOrder,
  });
  requireSuccess(result, "Could not create meta-skill");
}

export async function renameSkateMetaSkill(id: string, userId: string, name: string) {
  const result = await getClient().from("skate_meta_skills").update({ name }).eq("id", id).eq("user_id", userId).select("id").single();
  requireSuccess(result, "Could not rename meta-skill");
}

export async function deleteSkateMetaSkill(id: string, userId: string) {
  const result = await getClient().from("skate_meta_skills").delete().eq("id", id).eq("user_id", userId).select("id").single();
  requireSuccess(result, "Could not delete meta-skill");
}

export async function createSkateLevelLabel(userId: string, name: string) {
  const result = await getClient().from("skate_level_labels").insert({ user_id: userId, name });
  requireSuccess(result, "Could not create level label");
}

export async function renameSkateLevelLabel(id: string, userId: string, name: string) {
  const result = await getClient().from("skate_level_labels").update({ name }).eq("id", id).eq("user_id", userId).select("id").single();
  requireSuccess(result, "Could not rename level label");
}

export async function deleteSkateLevelLabel(id: string, userId: string) {
  const result = await getClient().from("skate_level_labels").delete().eq("id", id).eq("user_id", userId).select("id").single();
  requireSuccess(result, "Could not delete level label");
}

export async function saveSkateTrainingSettings(
  userId: string,
  settings: SkateTrainingSettings,
) {
  const result = await getClient().from("skate_training_settings").update({
    ...settings,
    updated_at: new Date().toISOString(),
  }).eq("user_id", userId).select("user_id").single();
  requireSuccess(result, "Could not save training settings");
}
