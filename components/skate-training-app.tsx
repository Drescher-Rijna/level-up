"use client";

import type { User } from "@supabase/supabase-js";
import type { FormEvent } from "react";
import {
  Activity,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Check,
  ChevronDown,
  Clock3,
  Layers3,
  LogOut,
  Minus,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  generateCycleSessions,
} from "@/lib/cycle-generator";
import type {
  GeneratedCycleSession,
  SkateFamily as CycleFamily,
  SkateStance as CycleStance,
} from "@/lib/cycle-generator";
import {
  completeSkateSession,
  confirmSkateCycle,
  createSkateCycleDraft,
  createSkateLevelLabel,
  createSkateMetaSkill,
  deleteSkateCycleDraft,
  deleteSkateLevelLabel,
  deleteSkateMetaSkill,
  loadSkateTrainingData,
  regenerateSkateCycleDraft,
  renameSkateLevelLabel,
  renameSkateMetaSkill,
  saveSkateProgressionStages,
  saveSkateSessionDraft,
  saveSkateTrainingSettings,
  setSkateEligibility,
  setWholeTrickEligibility,
} from "@/lib/skate-training";
import type {
  SkateCycle,
  SkateCycleSession,
  SkateCycleSessionDraft,
  SkateCycleSessionTrick,
  SkateEligibility,
  SkateLevelLabel,
  SkateProgressionHistory,
  SkateSessionDraftResult,
  SkateTrainingData,
  SkateTrainingSettings,
  SkateTrick,
  SkateStance,
} from "@/lib/skate-training";
import {
  getProgressionSupabaseClient,
  getProgressionSupabaseConfigurationError,
} from "@/lib/progression-supabase";

type Section = "sessions" | "cycles" | "tricks" | "settings";
type StanceId = SkateStance["id"];
type StageDrafts = Record<StanceId, string[]>;
type CycleRpcSession = {
  session_number: number;
  regular_trick_id: string | null;
  switch_trick_id: string | null;
  nollie_trick_id: string | null;
  fakie_trick_id: string | null;
};
type LocalSessionDraft = {
  cycleSessionId: string;
  results: SkateSessionDraftResult[];
  durationMinutes: number;
  notes: string;
};

const STANCES: StanceId[] = ["Regular", "Switch", "Nollie", "Fakie"];
const CYCLE_FAMILIES: CycleFamily[] = ["Flatground", "Grinds", "Slides", "Manuals", "Transition"];
const SECTIONS: { id: Section; label: string; icon: typeof Activity }[] = [
  { id: "sessions", label: "Sessions", icon: Activity },
  { id: "cycles", label: "Cycles", icon: Layers3 },
  { id: "tricks", label: "Tricks", icon: RefreshCw },
  { id: "settings", label: "Settings", icon: Settings2 },
];

function messageFromError(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

function getLocalDraftKey(userId: string, sessionId: string) {
  return `skate-training:${userId}:${sessionId}`;
}

function readLocalDraft(userId: string, sessionId: string): LocalSessionDraft | null {
  try {
    const raw = window.localStorage.getItem(getLocalDraftKey(userId, sessionId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const draft = parsed as Partial<LocalSessionDraft>;
    if (
      draft.cycleSessionId !== sessionId ||
      !Array.isArray(draft.results) ||
      typeof draft.durationMinutes !== "number" ||
      typeof draft.notes !== "string"
    ) return null;
    return draft as LocalSessionDraft;
  } catch {
    return null;
  }
}

function writeLocalDraft(userId: string, draft: LocalSessionDraft) {
  window.localStorage.setItem(
    getLocalDraftKey(userId, draft.cycleSessionId),
    JSON.stringify(draft),
  );
}

function defaultSessionResults(
  assignments: SkateCycleSessionTrick[],
  settings: SkateTrainingSettings,
): SkateSessionDraftResult[] {
  return assignments
    .filter((assignment) => assignment.trick_id !== null)
    .map((assignment) => ({
      assignment_id: assignment.id,
      sets: Array.from({ length: settings.sets_per_trick }, () => 0),
    }));
}

function normalizeSessionResults(
  results: SkateSessionDraftResult[] | undefined,
  assignments: SkateCycleSessionTrick[],
  settings: SkateTrainingSettings,
): SkateSessionDraftResult[] {
  const saved = new Map(
    (Array.isArray(results) ? results : []).map((result) => [result.assignment_id, result.sets]),
  );
  return defaultSessionResults(assignments, settings).map((result) => {
    const priorSets = saved.get(result.assignment_id);
    return {
      ...result,
      sets: result.sets.map((_, index) => {
        const value = priorSets?.[index];
        return typeof value === "number"
          ? Math.min(settings.attempts_per_set, Math.max(0, Math.floor(value)))
          : 0;
      }),
    };
  });
}

function cyclePayload(sessions: GeneratedCycleSession[]): CycleRpcSession[] {
  return sessions.map((session) => ({
    session_number: session.sessionNumber,
    regular_trick_id: session.supersetA.regular?.trickId ?? null,
    switch_trick_id: session.supersetA.switch?.trickId ?? null,
    nollie_trick_id: session.supersetB.nollie?.trickId ?? null,
    fakie_trick_id: session.supersetB.fakie?.trickId ?? null,
  }));
}

function makeGeneratorAssignments(
  data: SkateTrainingData,
  combinations: { trick_id: string; stance_id: StanceId }[],
) {
  return combinations.map((combination) => {
    const trick = data.tricks.find((candidate) => candidate.id === combination.trick_id);
    const family = data.families.find((candidate) => candidate.id === trick?.family_id);
    if (!trick || !family || !CYCLE_FAMILIES.includes(family.name as CycleFamily)) {
      throw new Error("A cycle trick or family is missing from the catalog. Reload the page and try again.");
    }
    return {
      trickId: trick.id,
      family: family.name as CycleFamily,
      stance: combination.stance_id as CycleStance,
      sortOrder: trick.sort_order,
    };
  });
}

function getTrick(data: SkateTrainingData, trickId: string | null | undefined) {
  return data.tricks.find((trick) => trick.id === trickId);
}

function getFamilyName(data: SkateTrainingData, trick: SkateTrick | undefined) {
  return data.families.find((family) => family.id === trick?.family_id)?.name ?? "Unknown family";
}

function getStageLabel(
  data: SkateTrainingData,
  trickId: string,
  stanceId: StanceId,
) {
  const progress = data.progress.find((row) => row.trick_id === trickId && row.stance_id === stanceId);
  const stage = data.stages.find((row) => row.id === progress?.current_stage_id);
  return data.labels.find((label) => label.id === stage?.label_id)?.name ?? "No stage set";
}

function Stat({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <article className="skate-stat-card">
      <span>{label}</span>
      <strong>{value}</strong>
      {detail ? <small>{detail}</small> : null}
    </article>
  );
}

function ProgressMeter({ value, max }: { value: number; max: number }) {
  const percent = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div
      className="skate-progress-meter"
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-label="Cycle session progress"
    >
      <span style={{ width: `${percent}%` }} />
    </div>
  );
}

function TrickSummary({
  data,
  trickId,
  stanceId,
  label,
}: {
  data: SkateTrainingData;
  trickId: string | null;
  stanceId: StanceId;
  label?: string | null;
}) {
  const trick = getTrick(data, trickId);
  return (
    <div className={`skate-assignment${trick ? "" : " is-empty"}`}>
      <span className="skate-assignment-stance">{stanceId}</span>
      {trick ? (
        <>
          <strong>{trick.name}</strong>
          <small>{label || getStageLabel(data, trick.id, stanceId)}</small>
        </>
      ) : (
        <strong>No trick scheduled</strong>
      )}
    </div>
  );
}

function CycleSchedule({
  data,
  sessions,
  assignments,
  compact = false,
}: {
  data: SkateTrainingData;
  sessions: SkateCycleSession[];
  assignments: SkateCycleSessionTrick[];
  compact?: boolean;
}) {
  return (
    <div className={`skate-schedule${compact ? " is-compact" : ""}`}>
      {sessions.map((session) => {
        const slots = assignments.filter((assignment) => assignment.cycle_session_id === session.id);
        const getSlot = (stance: StanceId) => slots.find((assignment) => assignment.stance_id === stance);
        return (
          <details className="skate-schedule-session" key={session.id}>
            <summary>
              <span>Session {session.session_number}</span>
              <span className={`skate-status-chip${session.status === "completed" ? " is-done" : ""}`}>
                {session.status === "completed" ? "Completed" : "Planned"}
              </span>
              <ChevronDown size={17} aria-hidden="true" />
            </summary>
            <div className="skate-schedule-supersets">
              <section>
                <h4>Superset A</h4>
                <TrickSummary data={data} trickId={getSlot("Regular")?.trick_id ?? null} stanceId="Regular" label={getSlot("Regular")?.progression_label_snapshot} />
                <TrickSummary data={data} trickId={getSlot("Switch")?.trick_id ?? null} stanceId="Switch" label={getSlot("Switch")?.progression_label_snapshot} />
              </section>
              <section>
                <h4>Superset B</h4>
                <TrickSummary data={data} trickId={getSlot("Nollie")?.trick_id ?? null} stanceId="Nollie" label={getSlot("Nollie")?.progression_label_snapshot} />
                <TrickSummary data={data} trickId={getSlot("Fakie")?.trick_id ?? null} stanceId="Fakie" label={getSlot("Fakie")?.progression_label_snapshot} />
              </section>
            </div>
          </details>
        );
      })}
    </div>
  );
}

function SessionLogger({
  userId,
  data,
  cycle,
  cycleSession,
  sessionDraft,
  assignments,
  busy,
  onComplete,
  onError,
}: {
  userId: string;
  data: SkateTrainingData;
  cycle: SkateCycle;
  cycleSession: SkateCycleSession;
  sessionDraft?: SkateCycleSessionDraft;
  assignments: SkateCycleSessionTrick[];
  busy: boolean;
  onComplete: (input: {
    cycleSessionId: string;
    durationMinutes: number;
    notes: string;
    results: SkateSessionDraftResult[];
  }) => Promise<void>;
  onError: (message: string) => void;
}) {
  const [initialDraft] = useState(() => {
    const localDraft = readLocalDraft(userId, cycleSession.id);
    return localDraft ?? (sessionDraft ? {
      cycleSessionId: sessionDraft.cycle_session_id,
      results: sessionDraft.set_results,
      durationMinutes: sessionDraft.duration_minutes,
      notes: sessionDraft.notes,
    } : null);
  });
  const [results, setResults] = useState(() =>
    normalizeSessionResults(initialDraft?.results, assignments, data.settings),
  );
  const [durationMinutes, setDurationMinutes] = useState(initialDraft?.durationMinutes ?? 60);
  const [notes, setNotes] = useState(initialDraft?.notes ?? "");
  const [readySessionId] = useState(cycleSession.id);
  const [saveState, setSaveState] = useState<"saved" | "saving">("saved");
  const [finishing, setFinishing] = useState(false);
  const metaSkillName = data.metaSkills.find((skill) => skill.id === cycle.meta_skill_id)?.name ?? "Meta-skill";
  const benchmarkSetsRequired = Math.ceil(data.settings.sets_per_trick * 2 / 3);

  useEffect(() => {
    if (readySessionId !== cycleSession.id || finishing || results.length === 0) return;
    const save = window.setTimeout(() => {
      setSaveState("saving");
      void saveSkateSessionDraft(cycleSession.id, results, durationMinutes, notes)
        .then(() => setSaveState("saved")).catch((error: unknown) => {
        setSaveState("saved");
        onError(messageFromError(error));
      });
    }, 350);
    return () => window.clearTimeout(save);
  }, [cycleSession.id, durationMinutes, finishing, notes, onError, readySessionId, results]);

  const persistLocal = useCallback((nextResults: SkateSessionDraftResult[], nextDuration: number, nextNotes: string) => {
    try {
      writeLocalDraft(userId, {
        cycleSessionId: cycleSession.id,
        results: nextResults,
        durationMinutes: nextDuration,
        notes: nextNotes,
      });
    } catch (error) {
      onError(`Could not save a local session backup: ${messageFromError(error)}`);
    }
  }, [cycleSession.id, onError, userId]);

  function changeResult(assignmentId: string, setIndex: number, delta: number) {
    const next = results.map((result) => {
      if (result.assignment_id !== assignmentId) return result;
      const sets = [...result.sets];
      sets[setIndex] = Math.min(
        data.settings.attempts_per_set,
        Math.max(0, sets[setIndex] + delta),
      );
      return { ...result, sets };
    });
    setResults(next);
    persistLocal(next, durationMinutes, notes);
  }

  function updateDuration(value: number) {
    const next = Math.min(600, Math.max(1, value || 1));
    setDurationMinutes(next);
    persistLocal(results, next, notes);
  }

  function updateNotes(value: string) {
    setNotes(value);
    persistLocal(results, durationMinutes, value);
  }

  async function finishSession() {
    if (!window.confirm("Finish this session and save all set results?")) return;
    setFinishing(true);
    try {
      await onComplete({
        cycleSessionId: cycleSession.id,
        durationMinutes,
        notes,
        results,
      });
      window.localStorage.removeItem(getLocalDraftKey(userId, cycleSession.id));
    } catch (error) {
      onError(messageFromError(error));
      setFinishing(false);
    }
  }

  function renderSetRow(stanceA: StanceId, stanceB: StanceId, setIndex: number) {
    const first = assignments.find((assignment) => assignment.stance_id === stanceA);
    const second = assignments.find((assignment) => assignment.stance_id === stanceB);
    const renderAttempt = (assignment: SkateCycleSessionTrick | undefined) => {
      if (!assignment?.trick_id) {
        return (
          <div className="skate-attempt-cell is-empty">
            <span>No trick scheduled</span>
          </div>
        );
      }
      const trick = getTrick(data, assignment.trick_id);
      const attemptResult = results.find((result) => result.assignment_id === assignment.id);
      const landed = attemptResult?.sets[setIndex] ?? 0;
      return (
        <div className="skate-attempt-cell">
          <div className="skate-attempt-name">
            <span>{assignment.stance_id}</span>
            <strong>{trick?.name ?? "Trick unavailable"}</strong>
            <small>{assignment.progression_label_snapshot ?? "No progression stage"}</small>
          </div>
          <div className="skate-count-control">
            <button
              type="button"
              aria-label={`Decrease ${trick?.name ?? "trick"} ${assignment.stance_id} set ${setIndex + 1}`}
              disabled={landed <= 0 || busy || finishing}
              onClick={() => changeResult(assignment.id, setIndex, -1)}
            >
              <Minus size={17} />
            </button>
            <strong>{landed}<span>/{data.settings.attempts_per_set}</span></strong>
            <button
              type="button"
              aria-label={`Increase ${trick?.name ?? "trick"} ${assignment.stance_id} set ${setIndex + 1}`}
              disabled={landed >= data.settings.attempts_per_set || busy || finishing}
              onClick={() => changeResult(assignment.id, setIndex, 1)}
            >
              <Plus size={17} />
            </button>
          </div>
        </div>
      );
    };

    return (
      <div className="skate-set-row" key={`${stanceA}-${setIndex}`}>
        <span className="skate-set-number">Set {setIndex + 1}</span>
        {renderAttempt(first)}
        {renderAttempt(second)}
      </div>
    );
  }

  const assignmentsA = assignments.filter((assignment) => assignment.superset === "A");
  const assignmentsB = assignments.filter((assignment) => assignment.superset === "B");

  return (
    <section className="skate-card skate-session-logger">
      <div className="skate-session-heading">
        <div>
          <p className="skate-eyebrow">Session {cycleSession.session_number}</p>
          <h2>{metaSkillName}</h2>
        </div>
        <span className="skate-save-state">
          <span className={saveState === "saving" ? "is-saving" : ""} />
          {saveState === "saving" ? "Saving" : "Saved"}
        </span>
      </div>
      <p className="skate-helper-text">
        Log landed attempts for each set. A trick progresses when at least {benchmarkSetsRequired} of {data.settings.sets_per_trick} sets meet the benchmark.
      </p>
      <section className="skate-superset-card">
        <div className="skate-superset-heading"><span>A</span><h3>Superset A</h3><small>Regular + Switch</small></div>
        {Array.from({ length: data.settings.sets_per_trick }, (_, index) => renderSetRow("Regular", "Switch", index))}
        <div className="skate-superset-trick-names" aria-hidden="true">
          {assignmentsA.length === 0 ? "No assignments" : ""}
        </div>
      </section>
      <section className="skate-superset-card">
        <div className="skate-superset-heading"><span>B</span><h3>Superset B</h3><small>Nollie + Fakie</small></div>
        {Array.from({ length: data.settings.sets_per_trick }, (_, index) => renderSetRow("Nollie", "Fakie", index))}
        <div className="skate-superset-trick-names" aria-hidden="true">
          {assignmentsB.length === 0 ? "No assignments" : ""}
        </div>
      </section>
      <div className="skate-session-extra-fields">
        <label>
          Session duration (minutes)
          <input
            type="number"
            min={1}
            max={600}
            value={durationMinutes}
            onChange={(event) => updateDuration(Number(event.target.value))}
          />
        </label>
        <label>
          Notes (optional)
          <textarea value={notes} onChange={(event) => updateNotes(event.target.value)} rows={2} />
        </label>
      </div>
      <button
        className="skate-button skate-button-primary skate-finish-session"
        type="button"
        disabled={busy || finishing || results.length !== assignments.filter((assignment) => assignment.trick_id).length}
        onClick={() => void finishSession()}
      >
        <Check size={19} />
        {finishing || busy ? "Saving session..." : "Finish session"}
      </button>
    </section>
  );
}

function EditableNameRow({
  id,
  name,
  deleteLabel,
  onSave,
  onDelete,
}: {
  id: string;
  name: string;
  deleteLabel: string;
  onSave: (id: string, name: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [value, setValue] = useState(name);
  const [saving, setSaving] = useState(false);
  return (
    <form
      className="skate-editable-name"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!value.trim() || value.trim() === name) return;
        setSaving(true);
        try {
          await onSave(id, value.trim());
        } finally {
          setSaving(false);
        }
      }}
    >
      <input aria-label={name} value={value} onChange={(event) => setValue(event.target.value)} maxLength={80} />
      <button className="skate-button skate-button-secondary" type="submit" disabled={saving || !value.trim() || value.trim() === name}>
        Save
      </button>
      <button className="skate-icon-button is-danger" type="button" aria-label={deleteLabel} onClick={() => void onDelete(id)}>
        <Trash2 size={17} />
      </button>
    </form>
  );
}

function TrainingSettingsForm({
  settings,
  busy,
  onSave,
}: {
  settings: SkateTrainingSettings;
  busy: boolean;
  onSave: (settings: SkateTrainingSettings) => Promise<void>;
}) {
  const [values, setValues] = useState(settings);
  const benchmarkSetsRequired = Math.ceil(values.sets_per_trick * 2 / 3);
  return (
    <form
      className="skate-card skate-settings-form"
      onSubmit={(event) => {
        event.preventDefault();
        void onSave({
          ...values,
          benchmark_landed: Math.min(values.attempts_per_set, values.benchmark_landed),
        });
      }}
    >
      <div className="skate-section-heading">
        <div><p className="skate-eyebrow">General training</p><h2>Session defaults</h2></div>
      </div>
      <div className="skate-settings-grid">
        <label>Sets per trick<input type="number" min={1} max={10} value={values.sets_per_trick} onChange={(event) => setValues({ ...values, sets_per_trick: Number(event.target.value) })} /></label>
        <label>Attempts per set<input type="number" min={1} max={20} value={values.attempts_per_set} onChange={(event) => setValues({ ...values, attempts_per_set: Number(event.target.value) })} /></label>
        <label>Benchmark landed<input type="number" min={1} max={values.attempts_per_set} value={Math.min(values.benchmark_landed, values.attempts_per_set)} onChange={(event) => setValues({ ...values, benchmark_landed: Number(event.target.value) })} /></label>
      </div>
      <p className="skate-helper-text">A trick advances after the benchmark is reached in at least {benchmarkSetsRequired} of {values.sets_per_trick} sets. Defaults are 3 sets, 5 attempts and 3 landed.</p>
      <button className="skate-button skate-button-primary" type="submit" disabled={busy}>Save settings</button>
    </form>
  );
}

export default function SkateTrainingApp({
  initialSection = "sessions",
}: {
  initialSection?: Section;
}) {
  const supabaseClient = getProgressionSupabaseClient();
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(() => !supabaseClient);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [createAccount, setCreateAccount] = useState(false);
  const [authMessage, setAuthMessage] = useState("");
  const [data, setData] = useState<SkateTrainingData | null>(null);
  const [dataUserId, setDataUserId] = useState<string | null>(null);
  const [dataLoadFailed, setDataLoadFailed] = useState(false);
  const [section, setSection] = useState<Section>(initialSection);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [notice, setNotice] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [selectedMetaSkill, setSelectedMetaSkill] = useState("");
  const [trickSearch, setTrickSearch] = useState("");
  const [familyFilter, setFamilyFilter] = useState("all");
  const [editingTrickId, setEditingTrickId] = useState<string | null>(null);
  const [stageDrafts, setStageDrafts] = useState<StageDrafts>({
    Regular: [], Switch: [], Nollie: [], Fakie: [],
  });
  const [pendingLabels, setPendingLabels] = useState<Record<StanceId, string>>({
    Regular: "", Switch: "", Nollie: "", Fakie: "",
  });
  const [newMetaSkill, setNewMetaSkill] = useState("");
  const [newLabel, setNewLabel] = useState("");

  const configurationError = getProgressionSupabaseConfigurationError();

  useEffect(() => {
    if (!supabaseClient) return;
    let active = true;
    void supabaseClient.auth.getSession().then(({ data: sessionData, error }) => {
      if (!active) return;
      if (error) setAuthMessage(error.message);
      setUser(sessionData.session?.user ?? null);
      setAuthReady(true);
    }).catch((error: unknown) => {
      if (!active) return;
      setAuthMessage(messageFromError(error));
      setAuthReady(true);
    });
    const { data: subscription } = supabaseClient.auth.onAuthStateChange((_event, session) => {
      setData(null);
      setDataUserId(null);
      setDataLoadFailed(false);
      setUser(session?.user ?? null);
    });
    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, [supabaseClient]);

  const refreshData = useCallback(async (userId: string) => {
    const refreshed = await loadSkateTrainingData(userId);
    setData(refreshed);
    setDataUserId(userId);
    return refreshed;
  }, []);

  useEffect(() => {
    if (!user) return;
    let active = true;
    void loadSkateTrainingData(user.id).then((nextData) => {
      if (!active) return;
      setData(nextData);
      setDataUserId(user.id);
      setDataLoadFailed(false);
      setSelectedMetaSkill((current) =>
        nextData.metaSkills.some((skill) => skill.id === current)
          ? current
          : nextData.metaSkills[0]?.id ?? "",
      );
    }).catch((error: unknown) => {
      if (active) {
        setErrorMessage(messageFromError(error));
        setDataLoadFailed(true);
      }
    });
    return () => { active = false; };
  }, [refreshData, user]);

  async function runMutation<T>(
    action: () => Promise<T>,
    successMessage: string | ((result: T) => string),
  ) {
    if (!user) return;
    setBusy(true);
    setErrorMessage("");
    setNotice("");
    try {
      const result = await action();
      await refreshData(user.id);
      setNotice(typeof successMessage === "string" ? successMessage : successMessage(result));
    } catch (error) {
      setErrorMessage(messageFromError(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleAuthSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabaseClient) return;
    setAuthBusy(true);
    setAuthMessage("");
    try {
      const result = createAccount
        ? await supabaseClient.auth.signUp({ email: authEmail.trim(), password: authPassword })
        : await supabaseClient.auth.signInWithPassword({ email: authEmail.trim(), password: authPassword });
      if (result.error) throw new Error(result.error.message);
      if (createAccount && !result.data.session) {
        setAuthMessage("Check your email to confirm your account, then sign in.");
      }
    } catch (error) {
      setAuthMessage(messageFromError(error));
    } finally {
      setAuthBusy(false);
    }
  }

  async function signOut() {
    if (!supabaseClient) return;
    setAuthBusy(true);
    try {
      const { error } = await supabaseClient.auth.signOut();
      if (error) throw new Error(error.message);
    } catch (error) {
      setErrorMessage(messageFromError(error));
    } finally {
      setAuthBusy(false);
    }
  }

  const currentCycle = data?.cycle ?? null;
  const activeCycle = currentCycle?.status === "active" ? currentCycle : null;
  const draftCycle = currentCycle?.status === "draft" ? currentCycle : null;
  const nextSession = activeCycle
    ? data?.cycleSessions.find((session) => session.status === "planned") ?? null
    : null;
  const selectedTrick = data?.tricks.find((trick) => trick.id === editingTrickId);
  const trickHistory = data?.progressionHistory.filter((entry) => entry.trick_id === editingTrickId) ?? [];
  const eligibleCombinationCount = data?.eligibility.filter((row) => row.eligible).length ?? 0;
  const eligibleTrickCount = data
    ? new Set(data.eligibility.filter((row) => row.eligible).map((row) => row.trick_id)).size
    : 0;
  const excludedCombinationCount = data ? data.eligibility.length - eligibleCombinationCount : 0;
  const excludedTrickCount = data
    ? data.tricks.filter((trick) => !data.eligibility.some((row) => row.trick_id === trick.id && row.eligible)).length
    : 0;
  const configuredProgressCount = data
    ? data.progress.filter((progress) => progress.current_stage_id !== null).length
    : 0;

  const filteredTricks = useMemo(() => {
    if (!data) return [];
    const search = trickSearch.trim().toLowerCase();
    return data.tricks.filter((trick) => {
      const familyMatches = familyFilter === "all" || trick.family_id === familyFilter;
      const nameMatches = !search || trick.name.toLowerCase().includes(search);
      return familyMatches && nameMatches;
    });
  }, [data, familyFilter, trickSearch]);

  function openTrickEditor(trickId: string) {
    if (!data) return;
    setEditingTrickId(trickId);
    const drafts = Object.fromEntries(STANCES.map((stance) => [
      stance,
      data.stages
        .filter((stage) => stage.trick_id === trickId && stage.stance_id === stance)
        .sort((a, b) => a.position - b.position)
        .map((stage) => stage.label_id),
    ])) as StageDrafts;
    setStageDrafts(drafts);
  }

  async function generateCycle(isRegeneration: boolean) {
    if (!data || !user) return;
    const selectedSkill = draftCycle?.meta_skill_id ?? selectedMetaSkill;
    if (!selectedSkill) {
      setErrorMessage("Add or choose a meta-skill before generating a cycle.");
      return;
    }
    setBusy(true);
    setErrorMessage("");
    setNotice("");
    try {
      const sourceCombinations = isRegeneration && draftCycle
        ? data.cycleEligibleCombinations
        : data.eligibility.filter((row) => row.eligible);
      const generated = generateCycleSessions(makeGeneratorAssignments(data, sourceCombinations));
      if (generated.length === 0) throw new Error("There are no eligible trick and stance combinations to schedule.");
      const payload = cyclePayload(generated);
      if (isRegeneration && draftCycle) {
        await regenerateSkateCycleDraft(draftCycle.id, payload);
      } else {
        await createSkateCycleDraft(selectedSkill, payload);
      }
      await refreshData(user.id);
      setSection("cycles");
      setNotice(isRegeneration ? "Cycle arrangement regenerated. Its eligible combinations are unchanged." : "Cycle generated. Review it before confirming.");
    } catch (error) {
      setErrorMessage(messageFromError(error));
    } finally {
      setBusy(false);
    }
  }

  async function completeSession(input: {
    cycleSessionId: string;
    durationMinutes: number;
    notes: string;
    results: SkateSessionDraftResult[];
  }) {
    if (!user) return;
    setBusy(true);
    setErrorMessage("");
    setNotice("");
    try {
      const result = await completeSkateSession(input);
      await refreshData(user.id);
      setNotice(result.cycle_completed
        ? `Cycle complete. ${result.total_landed} attempts landed; ${result.progression_advancements} progression${result.progression_advancements === 1 ? "" : "s"} advanced.`
        : `Session saved with ${result.total_landed} landed attempts; ${result.progression_advancements} progression${result.progression_advancements === 1 ? "" : "s"} advanced.`);
    } catch (error) {
      throw error;
    } finally {
      setBusy(false);
    }
  }

  async function saveProgressionForStance(stance: StanceId) {
    if (!data || !selectedTrick) return;
    const nextLabels = stageDrafts[stance];
    const currentLabels = data.stages
      .filter((stage) => stage.trick_id === selectedTrick.id && stage.stance_id === stance)
      .sort((a, b) => a.position - b.position)
      .map((stage) => stage.label_id);
    const changed = currentLabels.length !== nextLabels.length
      || currentLabels.some((labelId, index) => labelId !== nextLabels[index]);
    const progress = data.progress.find((row) => row.trick_id === selectedTrick.id && row.stance_id === stance);
    const currentStageLabelId = data.stages.find((stage) => stage.id === progress?.current_stage_id)?.label_id;
    const oldCurrentIndex = currentStageLabelId ? currentLabels.indexOf(currentStageLabelId) : -1;
    const newCurrentIndex = currentStageLabelId ? nextLabels.indexOf(currentStageLabelId) : -1;
    const activeStageAffected = currentStageLabelId !== undefined && (
      newCurrentIndex < 0
      || oldCurrentIndex !== newCurrentIndex
      || currentLabels[oldCurrentIndex + 1] !== nextLabels[newCurrentIndex + 1]
    );
    const activeCycleUses = Boolean(activeCycle && data.cycleSessionTricks.some(
      (assignment) => assignment.trick_id === selectedTrick.id && assignment.stance_id === stance,
    ));
    const requiresConfirmation = changed && (activeStageAffected || activeCycleUses);
    if (requiresConfirmation && !window.confirm(
      "This change affects the current progression or a confirmed cycle. The cycle schedule will stay unchanged. Save this progression change?",
    )) return;
    await runMutation(() => saveSkateProgressionStages({
      trickId: selectedTrick.id,
      stanceId: stance,
      labelIds: nextLabels,
      confirmStageChange: requiresConfirmation,
    }), `${stance} progression saved.`);
  }

  function moveStage(stance: StanceId, index: number, offset: number) {
    const nextIndex = index + offset;
    if (nextIndex < 0 || nextIndex >= stageDrafts[stance].length) return;
    const labels = [...stageDrafts[stance]];
    [labels[index], labels[nextIndex]] = [labels[nextIndex], labels[index]];
    setStageDrafts({ ...stageDrafts, [stance]: labels });
  }

  function addStage(stance: StanceId) {
    const labelId = pendingLabels[stance];
    if (!labelId || stageDrafts[stance].includes(labelId)) return;
    setStageDrafts({ ...stageDrafts, [stance]: [...stageDrafts[stance], labelId] });
    setPendingLabels({ ...pendingLabels, [stance]: "" });
  }

  async function saveMetaSkillName(id: string, name: string) {
    if (!user) return;
    await runMutation(() => renameSkateMetaSkill(id, user.id, name), "Meta-skill updated.");
  }

  async function removeMetaSkill(id: string) {
    if (!user || !window.confirm("Delete this meta-skill? A skill already used by a cycle cannot be deleted.")) return;
    await runMutation(() => deleteSkateMetaSkill(id, user.id), "Meta-skill deleted.");
  }

  async function saveLevelLabelName(id: string, name: string) {
    if (!user) return;
    await runMutation(() => renameSkateLevelLabel(id, user.id, name), "Level label updated.");
  }

  async function removeLevelLabel(label: SkateLevelLabel) {
    if (!user || !data) return;
    const usageCount = data.stages.filter((stage) => stage.label_id === label.id).length;
    const prompt = usageCount
      ? `This label appears in ${usageCount} progression stage${usageCount === 1 ? "" : "s"}. Deleting it removes it from those sequences; saved history and confirmed cycle labels remain. Continue?`
      : `Delete "${label.name}"?`;
    if (!window.confirm(prompt)) return;
    await runMutation(() => deleteSkateLevelLabel(label.id, user.id), "Level label deleted.");
  }

  async function toggleEligibility(row: SkateEligibility) {
    if (!user) return;
    await runMutation(
      () => setSkateEligibility(user.id, row.trick_id, row.stance_id, !row.eligible),
      row.eligible ? "Stance excluded from future cycles." : "Stance included in future cycles.",
    );
  }

  async function toggleWholeTrick(trickId: string, currentlyIncluded: boolean) {
    await runMutation(
      () => setWholeTrickEligibility(trickId, !currentlyIncluded),
      currentlyIncluded
        ? "Trick excluded from future cycles; confirmed schedules are unchanged."
        : "Trick included in all stances for future cycles.",
    );
  }

  if (!authReady || (user && dataUserId !== user.id && !dataLoadFailed)) {
    return (
      <main className="progression-app skate-training-app">
        <div className="skate-training-content skate-loading"><span className="skate-spinner" />Loading skate training...</div>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="progression-app progression-auth-shell skate-training-app">
        <section className="progression-auth-card">
          <p className="progression-eyebrow">DELIBERATE PRACTICE</p>
          <h1>Skate training</h1>
          <p>Sign in to manage your tricks, build complete cycles and save every practice session.</p>
          {configurationError ? <p className="skate-error">{configurationError}</p> : null}
          <form className="progression-stack" onSubmit={(event) => void handleAuthSubmit(event)}>
            <label>Email<input type="email" autoComplete="email" value={authEmail} onChange={(event) => setAuthEmail(event.target.value)} required /></label>
            <label>Password<input type="password" autoComplete={createAccount ? "new-password" : "current-password"} value={authPassword} onChange={(event) => setAuthPassword(event.target.value)} minLength={8} required /></label>
            <button className="skate-button skate-button-primary" type="submit" disabled={authBusy || !supabaseClient}>
              {authBusy ? "Please wait..." : createAccount ? "Create account" : "Sign in"}
            </button>
          </form>
          {authMessage ? <p className="skate-auth-message" role="status">{authMessage}</p> : null}
          <button className="skate-text-button" type="button" onClick={() => setCreateAccount(!createAccount)}>
            {createAccount ? "Already have an account? Sign in" : "Create an account"}
          </button>
        </section>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="progression-app skate-training-app">
        <div className="skate-training-content">
          {errorMessage ? <p className="skate-error" role="alert">{errorMessage}</p> : null}
          <button className="skate-button skate-button-secondary" onClick={() => {
            setDataLoadFailed(false);
            void refreshData(user.id).catch((error: unknown) => {
              setErrorMessage(messageFromError(error));
              setDataLoadFailed(true);
            });
          }}>
            Retry loading skate training
          </button>
        </div>
      </main>
    );
  }

  const completedSessions = data.cycleSessions.filter((session) => session.status === "completed").length;
  const currentCycleMeta = data.metaSkills.find((skill) => skill.id === currentCycle?.meta_skill_id);
  const scheduleSessions = data.cycleSessions;
  const assignmentsBySession = data.cycleSessionTricks;

  return (
    <main className="progression-app skate-training-app">
      <div className="skate-training-content">
        <header className="skate-training-header">
          <div className="skate-brand">
            <span className="skate-brand-mark"><Activity size={21} /></span>
            <div><p className="skate-eyebrow">DELIBERATE PRACTICE</p><h1>{SECTIONS.find((item) => item.id === section)?.label}</h1></div>
          </div>
          <button className="skate-icon-button" type="button" aria-label="Sign out" disabled={authBusy} onClick={() => void signOut()}>
            <LogOut size={18} />
          </button>
        </header>

        <nav className="skate-section-nav" aria-label="Skate training sections">
          {SECTIONS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              className={section === id ? "is-active" : ""}
              aria-current={section === id ? "page" : undefined}
              onClick={() => { setSection(id); setErrorMessage(""); setNotice(""); }}
            >
              <Icon size={18} />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        {errorMessage ? <p className="skate-error" role="alert">{errorMessage}</p> : null}
        {notice ? <p className="skate-notice" role="status">{notice}</p> : null}

        {section === "sessions" ? (
          <div className="skate-page-stack">
            <section className="skate-cycle-overview">
              <div>
                <p className="skate-eyebrow">{activeCycle ? "ACTIVE CYCLE" : "CYCLE STATUS"}</p>
                <h2>{activeCycle ? currentCycleMeta?.name ?? "Training cycle" : "Ready to skate?"}</h2>
                <p>{activeCycle
                  ? `${completedSessions} of ${data.cycleSessions.length} sessions completed`
                  : draftCycle ? "Review and confirm your generated cycle." : "Build a complete cycle from every eligible trick and stance."}</p>
              </div>
              {activeCycle ? (
                <div className="skate-cycle-progress-ring"><strong>{data.cycleSessions.length ? Math.round((completedSessions / data.cycleSessions.length) * 100) : 0}%</strong><span>done</span></div>
              ) : (
                <button className="skate-button skate-button-primary" type="button" onClick={() => setSection("cycles")}>
                  {draftCycle ? "Review cycle" : "Create cycle"} <ArrowRight size={17} />
                </button>
              )}
              {activeCycle ? <ProgressMeter value={completedSessions} max={data.cycleSessions.length} /> : null}
              {activeCycle ? <p className="skate-cycle-focus">Focus: <strong>{currentCycleMeta?.name ?? "Meta-skill unavailable"}</strong></p> : null}
            </section>

            {activeCycle && nextSession ? (
              <SessionLogger
                key={nextSession.id}
                userId={user.id}
                data={data}
                cycle={activeCycle}
                cycleSession={nextSession}
                sessionDraft={data.sessionDrafts.find((draft) => draft.cycle_session_id === nextSession.id)}
                assignments={data.cycleSessionTricks.filter((assignment) => assignment.cycle_session_id === nextSession.id)}
                busy={busy}
                onComplete={completeSession}
                onError={setErrorMessage}
              />
            ) : activeCycle ? (
              <section className="skate-card skate-empty-state">
                <Check size={24} /><h2>Cycle complete</h2>
                <p>Every scheduled trick and stance has been practised. Start another cycle when you are ready.</p>
                <button className="skate-button skate-button-primary" onClick={() => setSection("cycles")}>Start a new cycle</button>
              </section>
            ) : (
              <section className="skate-card skate-empty-state">
                <Clock3 size={24} /><h2>No active session</h2>
                <p>Generate and confirm a cycle to get a complete, ready-to-log session.</p>
                <button className="skate-button skate-button-primary" onClick={() => setSection("cycles")}>Open cycles</button>
              </section>
            )}

            <section className="skate-card">
              <div className="skate-section-heading"><div><p className="skate-eyebrow">TRAINING OVERVIEW</p><h2>Where you stand</h2></div></div>
              <div className="skate-stats-grid">
                <Stat label="Eligible tricks" value={`${eligibleTrickCount} / ${data.tricks.length}`} detail={`${eligibleCombinationCount} combinations`} />
                <Stat label="Fully excluded" value={`${excludedTrickCount}`} detail={`${excludedCombinationCount} stance combinations`} />
                <Stat label="Progressions set" value={`${configuredProgressCount} / ${data.progress.length}`} detail="trick + stance sequences" />
              </div>
              <div className="skate-stance-overview">
                {STANCES.map((stance) => {
                  const eligible = data.eligibility.filter((row) => row.stance_id === stance && row.eligible).length;
                  const progressed = data.progress.filter((row) => row.stance_id === stance && row.current_stage_id).length;
                  return <div key={stance}><span>{stance}</span><strong>{progressed} / {eligible}</strong><small>with a current stage</small></div>;
                })}
              </div>
            </section>

            <section className="skate-card">
              <div className="skate-section-heading"><div><p className="skate-eyebrow">RECENT PRACTICE</p><h2>Completed sessions</h2></div></div>
              {data.practices.length ? (
                <div className="skate-recent-list">
                  {data.practices.slice(0, 5).map((practice) => {
                    const cycleSession = data.cycleSessions.find((session) => session.id === practice.cycle_session_id);
                    return (
                      <article key={practice.id}>
                        <div><strong>{cycleSession ? `Session ${cycleSession.session_number}` : "Skate session"}</strong><small>{new Date(practice.completed_at).toLocaleDateString()}</small></div>
                        <span>{practice.duration_minutes} min</span>
                      </article>
                    );
                  })}
                </div>
              ) : <p className="skate-helper-text">Completed practice sessions will appear here.</p>}
            </section>
          </div>
        ) : null}

        {section === "cycles" ? (
          <div className="skate-page-stack">
            <section className="skate-page-intro">
              <p className="skate-eyebrow">COMPLETE ROTATION</p>
              <h2>Build your cycle</h2>
              <p>Every eligible trick and stance is scheduled once. The selected meta-skill stays with the entire cycle.</p>
            </section>
            {activeCycle ? (
              <section className="skate-card">
                <div className="skate-section-heading">
                  <div><p className="skate-eyebrow">ACTIVE CYCLE</p><h2>{currentCycleMeta?.name ?? "Meta-skill"}</h2></div>
                  <span className="skate-status-chip is-active">Confirmed</span>
                </div>
                <p className="skate-helper-text">Eligibility and progression edits do not change this confirmed schedule.</p>
                <ProgressMeter value={completedSessions} max={data.cycleSessions.length} />
                <p className="skate-cycle-count">{completedSessions} of {data.cycleSessions.length} sessions complete · {activeCycle.eligible_combinations} combinations</p>
                <CycleSchedule data={data} sessions={scheduleSessions} assignments={assignmentsBySession} />
              </section>
            ) : draftCycle ? (
              <section className="skate-card">
                <div className="skate-section-heading">
                  <div><p className="skate-eyebrow">DRAFT CYCLE</p><h2>{data.metaSkills.find((skill) => skill.id === draftCycle.meta_skill_id)?.name ?? "Meta-skill"}</h2></div>
                  <span className="skate-status-chip">Draft</span>
                </div>
                <p className="skate-helper-text">Review all sessions. Regenerating changes only the arrangement, not the eligible combinations or progression.</p>
                <p className="skate-cycle-count">{draftCycle.eligible_combinations} eligible combinations · {data.cycleSessions.length} sessions</p>
                <CycleSchedule data={data} sessions={scheduleSessions} assignments={assignmentsBySession} />
                <div className="skate-action-row">
                  <button className="skate-button skate-button-secondary" type="button" disabled={busy} onClick={() => void generateCycle(true)}>
                    <RefreshCw size={17} /> Regenerate arrangement
                  </button>
                  <button
                    className="skate-button skate-button-primary"
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      if (window.confirm("Confirm this cycle? Its scheduled tricks and progression labels will stay fixed.")) {
                        void runMutation(() => confirmSkateCycle(draftCycle.id), "Cycle confirmed. Your next session is ready.");
                      }
                    }}
                  >
                    <Check size={17} /> Confirm cycle
                  </button>
                </div>
                <button
                  className="skate-text-button is-danger"
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    if (window.confirm("Delete this cycle draft? No practice history will be deleted.")) {
                      void runMutation(() => deleteSkateCycleDraft(draftCycle.id), "Cycle draft deleted.");
                    }
                  }}
                >
                  Delete draft
                </button>
              </section>
            ) : (
              <section className="skate-card skate-cycle-builder">
                <div className="skate-section-heading"><div><p className="skate-eyebrow">1 · CHOOSE A FOCUS</p><h2>Meta-skill</h2></div></div>
                {data.metaSkills.length ? (
                  <>
                    <select aria-label="Select cycle meta-skill" value={selectedMetaSkill} onChange={(event) => setSelectedMetaSkill(event.target.value)}>
                      {data.metaSkills.map((skill) => <option key={skill.id} value={skill.id}>{skill.name}</option>)}
                    </select>
                    <div className="skate-cycle-explanation">
                      <strong>{eligibleCombinationCount} eligible combinations</strong>
                      <span>Distributed into complete sessions, including empty stance slots when counts are uneven.</span>
                    </div>
                    <button className="skate-button skate-button-primary" type="button" disabled={busy || eligibleCombinationCount === 0} onClick={() => void generateCycle(false)}>
                      <Layers3 size={18} /> {busy ? "Generating..." : "Generate complete cycle"}
                    </button>
                    {eligibleCombinationCount === 0 ? <p className="skate-helper-text">Include at least one trick/stance combination in Tricks before generating.</p> : null}
                  </>
                ) : (
                  <p className="skate-helper-text">Create a meta-skill in Settings before generating a cycle.</p>
                )}
              </section>
            )}
          </div>
        ) : null}

        {section === "tricks" ? (
          <div className="skate-page-stack">
            <section className="skate-page-intro">
              <p className="skate-eyebrow">CATALOGUE & PROGRESSION</p>
              <h2>Tricks</h2>
              <p>Eligibility is independent for every stance. Each progression is ordered separately and keeps its history.</p>
            </section>
            <section className="skate-card skate-trick-tools">
              <label className="skate-search-field"><Search size={17} /><input value={trickSearch} onChange={(event) => setTrickSearch(event.target.value)} placeholder="Search tricks" /></label>
              <select aria-label="Filter by family" value={familyFilter} onChange={(event) => setFamilyFilter(event.target.value)}>
                <option value="all">All families</option>
                {data.families.map((family) => <option key={family.id} value={family.id}>{family.name}</option>)}
              </select>
            </section>
            {data.families.filter((family) => familyFilter === "all" || family.id === familyFilter).map((family) => {
              const familyTricks = filteredTricks.filter((trick) => trick.family_id === family.id);
              if (!familyTricks.length) return null;
              return (
                <section className="skate-card skate-family-section" key={family.id}>
                  <div className="skate-section-heading"><div><p className="skate-eyebrow">TRICK FAMILY</p><h2>{family.name}</h2></div><span className="skate-count-chip">{familyTricks.length}</span></div>
                  <div className="skate-trick-list">
                    {familyTricks.map((trick) => {
                      const trickEligibility = data.eligibility.filter((row) => row.trick_id === trick.id);
                      const eligibleCount = trickEligibility.filter((row) => row.eligible).length;
                      return (
                        <article className="skate-trick-row" key={trick.id}>
                          <button className="skate-trick-open" type="button" onClick={() => openTrickEditor(trick.id)}>
                            <span><strong>{trick.name}</strong><small>{eligibleCount}/4 stances eligible · Manage progression</small></span>
                            <ArrowRight size={18} />
                          </button>
                          <div className="skate-eligibility-chips">
                            {STANCES.map((stance) => {
                              const row = trickEligibility.find((eligibility) => eligibility.stance_id === stance);
                              return (
                                <button
                                  key={stance}
                                  type="button"
                                  className={`skate-stance-chip${row?.eligible ? " is-eligible" : ""}`}
                                  aria-pressed={Boolean(row?.eligible)}
                                  disabled={busy || !row}
                                  onClick={() => row && void toggleEligibility(row)}
                                >
                                  {stance}
                                </button>
                              );
                            })}
                          </div>
                          <button
                            className="skate-text-button skate-trick-eligibility-action"
                            type="button"
                            disabled={busy}
                            onClick={() => void toggleWholeTrick(trick.id, eligibleCount > 0)}
                          >
                            {eligibleCount > 0 ? "Exclude trick" : "Include all stances"}
                          </button>
                        </article>
                      );
                    })}
                  </div>
                </section>
              );
            })}
            {filteredTricks.length === 0 ? <section className="skate-card skate-empty-state"><Search size={21} /><p>No tricks match this search.</p></section> : null}
          </div>
        ) : null}

        {section === "settings" ? (
          <div className="skate-page-stack">
            <section className="skate-page-intro">
              <p className="skate-eyebrow">PERSONALIZE YOUR PRACTICE</p>
              <h2>Settings</h2>
              <p>Manage the technical focus, reusable level labels and session defaults.</p>
            </section>
            <section className="skate-card">
              <div className="skate-section-heading"><div><p className="skate-eyebrow">TECHNICAL FOCUS</p><h2>Meta-skills</h2></div></div>
              <div className="skate-editable-list">
                {data.metaSkills.map((skill) => (
                  <EditableNameRow key={`${skill.id}-${skill.name}`} id={skill.id} name={skill.name} deleteLabel={`Delete ${skill.name}`} onSave={saveMetaSkillName} onDelete={removeMetaSkill} />
                ))}
              </div>
              <form className="skate-add-form" onSubmit={(event) => {
                event.preventDefault();
                if (!newMetaSkill.trim()) return;
                void runMutation(async () => {
                  await createSkateMetaSkill(user.id, newMetaSkill.trim(), Math.max(0, ...data.metaSkills.map((skill) => skill.sort_order)) + 1);
                  setNewMetaSkill("");
                }, "Meta-skill added.");
              }}>
                <input aria-label="New meta-skill" placeholder="Add a meta-skill" value={newMetaSkill} onChange={(event) => setNewMetaSkill(event.target.value)} maxLength={80} />
                <button className="skate-button skate-button-secondary" type="submit" disabled={busy || !newMetaSkill.trim()}><Plus size={17} /> Add</button>
              </form>
            </section>

            <section className="skate-card">
              <div className="skate-section-heading"><div><p className="skate-eyebrow">REUSABLE LEVEL NAMES</p><h2>Level labels</h2></div></div>
              <p className="skate-helper-text">Labels have no built-in difficulty. Their order is defined separately in each trick and stance progression.</p>
              <div className="skate-editable-list">
                {data.labels.map((label) => (
                  <EditableNameRow key={`${label.id}-${label.name}`} id={label.id} name={label.name} deleteLabel={`Delete ${label.name}`} onSave={saveLevelLabelName} onDelete={async (id) => {
                    const row = data.labels.find((candidate) => candidate.id === id);
                    if (row) await removeLevelLabel(row);
                  }} />
                ))}
              </div>
              <form className="skate-add-form" onSubmit={(event) => {
                event.preventDefault();
                if (!newLabel.trim()) return;
                void runMutation(async () => {
                  await createSkateLevelLabel(user.id, newLabel.trim());
                  setNewLabel("");
                }, "Level label added.");
              }}>
                <input aria-label="New level label" placeholder="Add a label, e.g. Rolling" value={newLabel} onChange={(event) => setNewLabel(event.target.value)} maxLength={80} />
                <button className="skate-button skate-button-secondary" type="submit" disabled={busy || !newLabel.trim()}><Plus size={17} /> Add</button>
              </form>
            </section>

            <TrainingSettingsForm key={`${data.settings.sets_per_trick}-${data.settings.attempts_per_set}-${data.settings.benchmark_landed}`} settings={data.settings} busy={busy} onSave={(settings) => runMutation(
              () => saveSkateTrainingSettings(user.id, settings),
              "Training defaults saved.",
            )} />
          </div>
        ) : null}

        {selectedTrick && section === "tricks" ? (
          <div className="skate-drawer-backdrop" role="presentation" onMouseDown={(event) => {
            if (event.target === event.currentTarget) setEditingTrickId(null);
          }}>
            <section className="skate-trick-drawer" role="dialog" aria-modal="true" aria-labelledby="skate-trick-drawer-title">
              <div className="skate-drawer-heading">
                <div><p className="skate-eyebrow">{getFamilyName(data, selectedTrick)}</p><h2 id="skate-trick-drawer-title">{selectedTrick.name}</h2></div>
                <button className="skate-icon-button" type="button" aria-label="Close trick editor" onClick={() => setEditingTrickId(null)}><X size={20} /></button>
              </div>
              <p className="skate-helper-text">Edit eligibility and a separate progression sequence for each stance.</p>
              <div className="skate-drawer-stances">
                {STANCES.map((stance) => {
                  const eligibility = data.eligibility.find((row) => row.trick_id === selectedTrick.id && row.stance_id === stance);
                  const progress = data.progress.find((row) => row.trick_id === selectedTrick.id && row.stance_id === stance);
                  const currentStage = data.stages.find((stage) => stage.id === progress?.current_stage_id);
                  const currentLabel = data.labels.find((label) => label.id === currentStage?.label_id)?.name;
                  const entries = trickHistory.filter((entry) => entry.stance_id === stance).slice(0, 5);
                  return (
                    <section className="skate-drawer-stance" key={stance}>
                      <div className="skate-drawer-stance-heading">
                        <div><span className="skate-assignment-stance">{stance}</span><strong>{currentLabel ?? "No current stage"}</strong></div>
                        <button
                          className={`skate-toggle${eligibility?.eligible ? " is-on" : ""}`}
                          type="button"
                          aria-pressed={Boolean(eligibility?.eligible)}
                          onClick={() => eligibility && void toggleEligibility(eligibility)}
                          disabled={busy || !eligibility}
                        >
                          {eligibility?.eligible ? "Included" : "Excluded"}
                        </button>
                      </div>
                      <ol className="skate-stage-list">
                        {stageDrafts[stance].map((labelId, index) => {
                          const label = data.labels.find((candidate) => candidate.id === labelId);
                          return (
                            <li key={`${labelId}-${index}`}>
                              <span><i>{index + 1}</i>{label?.name ?? "Missing label"}</span>
                              <div>
                                <button className="skate-icon-button" type="button" aria-label={`Move ${label?.name} up`} disabled={index === 0} onClick={() => moveStage(stance, index, -1)}><ArrowUp size={15} /></button>
                                <button className="skate-icon-button" type="button" aria-label={`Move ${label?.name} down`} disabled={index === stageDrafts[stance].length - 1} onClick={() => moveStage(stance, index, 1)}><ArrowDown size={15} /></button>
                                <button className="skate-icon-button is-danger" type="button" aria-label={`Remove ${label?.name}`} onClick={() => setStageDrafts({
                                  ...stageDrafts,
                                  [stance]: stageDrafts[stance].filter((id) => id !== labelId),
                                })}><X size={15} /></button>
                              </div>
                            </li>
                          );
                        })}
                      </ol>
                      <div className="skate-stage-add">
                        <select
                          aria-label={`Choose a label for ${stance}`}
                          value={pendingLabels[stance]}
                          onChange={(event) => setPendingLabels({ ...pendingLabels, [stance]: event.target.value })}
                        >
                          <option value="">Choose level label</option>
                          {data.labels.filter((label) => !stageDrafts[stance].includes(label.id)).map((label) => <option key={label.id} value={label.id}>{label.name}</option>)}
                        </select>
                        <button className="skate-button skate-button-secondary" type="button" disabled={!pendingLabels[stance]} onClick={() => addStage(stance)}><Plus size={16} /> Add</button>
                      </div>
                      <button className="skate-button skate-button-primary skate-save-stage" type="button" disabled={busy} onClick={() => void saveProgressionForStance(stance)}>Save {stance} progression</button>
                      {entries.length ? (
                        <div className="skate-history-list">
                          <strong>Recent progression history</strong>
                          {entries.map((entry: SkateProgressionHistory) => (
                            <span key={entry.id}>{entry.from_label ?? "Started"} → {entry.to_label} · {new Date(entry.advanced_at).toLocaleDateString()}</span>
                          ))}
                        </div>
                      ) : <p className="skate-muted-small">No progression history yet.</p>}
                    </section>
                  );
                })}
              </div>
            </section>
          </div>
        ) : null}

        <footer className="skate-training-footer">
          <span>{user.email}</span>
          <span>{data.tricks.length} tricks · {data.labels.length} labels</span>
        </footer>
      </div>
    </main>
  );
}
