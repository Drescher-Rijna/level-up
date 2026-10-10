"use client";

import { useState } from "react";
import type {
  WorkoutExerciseLog,
  WorkoutPlan,
  WorkoutSession,
  WorkoutSet,
} from "@/lib/state-types";
import { WORKOUT_PLANS } from "@/lib/workouts";

function getDisplayValue(value: number, unit: WorkoutExerciseLog["unit"]) {
  return unit === "seconds" ? `${value}s` : `${value} reps`;
}

function makeExerciseLogs(
  plan: WorkoutPlan,
  previousSession?: WorkoutSession,
): WorkoutExerciseLog[] {
  const definition = WORKOUT_PLANS.find((candidate) => candidate.id === plan);
  if (!definition) return [];

  const previousByExercise = new Map(
    previousSession?.exercises.map((exercise) => [exercise.id, exercise]) ?? [],
  );

  return definition.exercises.map((exercise) => {
    const previous = previousByExercise.get(exercise.id);
    const loggedSets: WorkoutSet[] = Array.from({ length: exercise.sets }, (_, index) => {
      const previousSet = previous?.loggedSets[index];
      return {
        reps: previousSet?.reps ?? exercise.target,
        weightKg: previousSet?.weightKg ?? null,
        completed: false,
      };
    });

    return { ...exercise, loggedSets };
  });
}

function formatSessionDate(date: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(date));
}

export default function WorkoutTracker({
  sessions,
  saving,
  strengthXp,
  strengthXpAlreadyEarned,
  statusMessage,
  onComplete,
}: {
  sessions: WorkoutSession[];
  saving: boolean;
  strengthXp: number;
  strengthXpAlreadyEarned: boolean;
  statusMessage: string;
  onComplete: (session: WorkoutSession) => Promise<{ saved: boolean; message: string }>;
}) {
  const [selectedPlan, setSelectedPlan] = useState<WorkoutPlan | null>(null);
  const [draftId, setDraftId] = useState("");
  const [exercises, setExercises] = useState<WorkoutExerciseLog[]>([]);
  const [completionError, setCompletionError] = useState("");
  const lastSessionByPlan = new Map<WorkoutPlan, WorkoutSession>();
  for (const session of sessions) {
    if (!lastSessionByPlan.has(session.plan)) {
      lastSessionByPlan.set(session.plan, session);
    }
  }

  function startPlan(plan: WorkoutPlan) {
    setSelectedPlan(plan);
    setDraftId(crypto.randomUUID());
    setExercises(makeExerciseLogs(plan, lastSessionByPlan.get(plan)));
    setCompletionError("");
  }

  function updateSet(
    exerciseId: string,
    setIndex: number,
    update: Partial<WorkoutSet>,
  ) {
    setExercises((current) =>
      current.map((exercise) =>
        exercise.id === exerciseId
          ? {
              ...exercise,
              loggedSets: exercise.loggedSets.map((set, index) =>
                index === setIndex ? { ...set, ...update } : set,
              ),
            }
          : exercise,
      ),
    );
  }

  async function finishWorkout() {
    if (!selectedPlan || exercises.length === 0 || exercises.some((exercise) =>
      exercise.loggedSets.some((set) =>
        !set.completed ||
        !Number.isInteger(set.reps) ||
        set.reps < 1 ||
        (set.weightKg !== null && (!Number.isFinite(set.weightKg) || set.weightKg < 0)),
      ),
    )) {
      setCompletionError("Mark each set complete and enter a valid rep or hold time.");
      return;
    }

    const result = await onComplete({
      id: draftId,
      plan: selectedPlan,
      completedAt: new Date().toISOString(),
      exercises,
    });
    if (result.saved) {
      setSelectedPlan(null);
      setExercises([]);
      setDraftId("");
    }
    setCompletionError(result.message);
  }

  const selectedDefinition = WORKOUT_PLANS.find((plan) => plan.id === selectedPlan);

  return (
    <main className="space-y-6">
      <section className="rounded-3xl border border-white/10 bg-[#111214] p-5 shadow-xl shadow-black/20">
        <p className="text-xs uppercase tracking-[0.3em] text-amber-300">Strength training</p>
        <h2 className="mt-2 text-2xl font-black text-white">Workouts</h2>
        <p className="mt-1 text-sm text-slate-300">
          Track sets, reps, and weight. Your last numbers carry forward as a starting point.
        </p>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {WORKOUT_PLANS.map((plan) => (
            <button
              key={plan.id}
              type="button"
              aria-pressed={selectedPlan === plan.id}
              onClick={() => startPlan(plan.id)}
              className={`rounded-2xl border p-4 text-left transition ${
                selectedPlan === plan.id
                  ? "border-amber-300/70 bg-amber-300/10"
                  : "border-white/10 bg-black/15 hover:border-white/30"
              }`}
            >
              <span className="block text-lg font-bold text-white">{plan.name}</span>
              <span className="mt-1 block text-sm text-slate-400">{plan.exercises.length} exercises</span>
              {lastSessionByPlan.has(plan.id) && (
                <span className="mt-2 block text-xs text-amber-200">
                  Last: {formatSessionDate(lastSessionByPlan.get(plan.id)!.completedAt)}
                </span>
              )}
            </button>
          ))}
        </div>
      </section>

      {selectedPlan && selectedDefinition && (
        <section className="rounded-3xl border border-white/10 bg-[#111214] p-5 shadow-xl shadow-black/20">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-amber-300">In progress</p>
              <h3 className="mt-1 text-xl font-bold text-white">{selectedDefinition.name}</h3>
            </div>
            <button
              type="button"
              onClick={() => {
                setSelectedPlan(null);
                setExercises([]);
                setCompletionError("");
              }}
              className="self-start rounded-xl border border-white/10 px-3 py-2 text-sm text-slate-300 hover:text-white"
            >
              Cancel
            </button>
          </div>

          <div className="mt-4 space-y-3">
            {exercises.map((exercise) => {
              const previousExercise = lastSessionByPlan.get(selectedPlan)?.exercises.find(
                (candidate) => candidate.id === exercise.id,
              );

              return (
                <article key={exercise.id} className="rounded-2xl border border-white/10 bg-black/15 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h4 className="font-bold text-white">{exercise.name}</h4>
                      <p className="mt-1 text-xs text-slate-400">
                        {exercise.sets} × {getDisplayValue(exercise.target, exercise.unit)} · Tempo {exercise.tempo}
                        {exercise.note ? ` · ${exercise.note}` : ""}
                      </p>
                      {previousExercise && (
                        <p className="mt-1 text-xs text-amber-200">
                          Last time: {previousExercise.loggedSets.map((set) =>
                            `${getDisplayValue(set.reps, exercise.unit)}${set.weightKg === null ? "" : ` @ ${set.weightKg} kg`}`,
                          ).join(" · ")}
                        </p>
                      )}
                    </div>
                    {exercise.id !== "spanish-squat" && (
                      <span className="text-xs text-slate-400">Weight in kg · leave blank for bodyweight</span>
                    )}
                  </div>

                  <div className="mt-3 space-y-2">
                    {exercise.loggedSets.map((set, setIndex) => (
                      <div key={setIndex} className="grid grid-cols-[auto_1fr_1fr_auto] items-center gap-2">
                        <span className="w-12 text-xs font-semibold text-slate-400">Set {setIndex + 1}</span>
                        <label className="sr-only" htmlFor={`${exercise.id}-${setIndex}-reps`}>
                          {exercise.unit === "seconds" ? "Hold seconds" : "Reps"}
                        </label>
                        <input
                          id={`${exercise.id}-${setIndex}-reps`}
                          type="number"
                          min={1}
                          step={1}
                          value={set.reps}
                          onChange={(event) => updateSet(exercise.id, setIndex, { reps: Number(event.target.value) })}
                          aria-label={exercise.unit === "seconds" ? "Hold seconds" : "Reps"}
                          className="min-w-0 rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-white outline-none focus:border-amber-400"
                        />
                        {exercise.id !== "spanish-squat" ? (
                          <input
                            type="number"
                            min={0}
                            step={0.5}
                            value={set.weightKg ?? ""}
                            onChange={(event) => updateSet(exercise.id, setIndex, {
                              weightKg: event.target.value === "" ? null : Number(event.target.value),
                            })}
                            aria-label="Weight in kilograms"
                            placeholder="kg"
                            className="min-w-0 rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500 focus:border-amber-400"
                          />
                        ) : <span className="text-xs text-slate-500">seconds</span>}
                        <button
                          type="button"
                          aria-label={`Mark set ${setIndex + 1} ${set.completed ? "incomplete" : "complete"}`}
                          aria-pressed={set.completed}
                          onClick={() => updateSet(exercise.id, setIndex, { completed: !set.completed })}
                          className={`h-9 w-9 rounded-lg border font-bold ${
                            set.completed
                              ? "border-emerald-400 bg-emerald-400 text-zinc-950"
                              : "border-white/15 text-slate-400 hover:border-white/40"
                          }`}
                        >
                          {set.completed ? "✓" : "○"}
                        </button>
                      </div>
                    ))}
                  </div>
                </article>
              );
            })}
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={saving}
              onClick={() => void finishWorkout()}
              className="rounded-xl bg-amber-400 px-4 py-2.5 text-sm font-bold text-zinc-950 transition hover:bg-amber-300 disabled:opacity-50"
            >
              {saving ? "Saving workout…" : "Finish workout"}
            </button>
            <span className="text-sm text-slate-400">
              {strengthXpAlreadyEarned ? "Strength XP earned today" : `+${strengthXp} Strength XP on completion`}
            </span>
          </div>
          {completionError && <p role="status" className="mt-3 text-sm text-amber-100">{completionError}</p>}
        </section>
      )}

      {statusMessage && !completionError && <p role="status" className="text-sm text-amber-100">{statusMessage}</p>}

      <section className="rounded-3xl border border-white/10 bg-[#111214] p-5 shadow-xl shadow-black/20">
        <h3 className="text-xl font-bold text-white">Recent sessions</h3>
        {sessions.length === 0 ? (
          <p className="mt-3 text-sm text-slate-400">Completed workouts will show here with their sets, reps, and weights.</p>
        ) : (
          <div className="mt-4 space-y-3">
            {sessions.slice(0, 10).map((session) => (
              <details key={session.id} className="rounded-2xl border border-white/10 bg-black/15 p-4">
                <summary className="cursor-pointer list-none font-semibold text-white">
                  {WORKOUT_PLANS.find((plan) => plan.id === session.plan)?.name ?? `Workout ${session.plan}`}
                  <span className="ml-2 text-sm font-normal text-slate-400">{formatSessionDate(session.completedAt)}</span>
                </summary>
                <div className="mt-3 space-y-2">
                  {session.exercises.map((exercise) => (
                    <p key={exercise.id} className="text-sm text-slate-300">
                      {exercise.name}: {exercise.loggedSets.map((set) =>
                        `${getDisplayValue(set.reps, exercise.unit)}${set.weightKg === null ? "" : ` @ ${set.weightKg} kg`}`,
                      ).join(" · ")}
                    </p>
                  ))}
                </div>
              </details>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
