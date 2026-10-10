"use client";

import { useState } from "react";
import type { TrainingCheckIn, WorkoutPlan } from "@/lib/state-types";

const WORKOUT_PLANS: { id: WorkoutPlan; name: string }[] = [
  { id: "1", name: "Deadlift + split squat" },
  { id: "2", name: "Single-leg RDL + press" },
  { id: "3", name: "Squat + Nordic curls" },
];

function ScorePicker({
  label,
  lowLabel,
  highLabel,
  value,
  onChange,
}: {
  label: string;
  lowLabel: string;
  highLabel: string;
  value: number | null;
  onChange: (score: number) => void;
}) {
  return (
    <fieldset>
      <legend className="text-sm font-semibold text-white">{label}</legend>
      <div className="mt-2 flex gap-2" role="group" aria-label={label}>
        {[1, 2, 3, 4, 5].map((score) => (
          <button
            key={score}
            type="button"
            aria-pressed={value === score}
            onClick={() => onChange(score)}
            className={`h-10 w-10 rounded-xl border text-sm font-bold transition ${
              value === score
                ? "border-amber-300 bg-amber-300 text-zinc-950"
                : "border-white/10 bg-black/20 text-slate-300 hover:border-white/30"
            }`}
          >
            {score}
          </button>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-xs text-slate-400">
        <span>{lowLabel}</span>
        <span>{highLabel}</span>
      </div>
    </fieldset>
  );
}

export default function DailyTrainingCheckIn({
  checkIn,
  strengthXp,
  strengthXpAlreadyEarned,
  kneeRecoveryFlag,
  saving,
  statusMessage,
  weeklySummary,
  onSave,
}: {
  checkIn?: TrainingCheckIn;
  strengthXp: number;
  strengthXpAlreadyEarned: boolean;
  kneeRecoveryFlag: boolean;
  saving: boolean;
  statusMessage: string;
  weeklySummary: { days: number; knee: number; energy: number } | null;
  onSave: (checkIn: Omit<TrainingCheckIn, "date">) => Promise<void>;
}) {
  const [kneeScore, setKneeScore] = useState<number | null>(checkIn?.kneeScore ?? null);
  const [energyScore, setEnergyScore] = useState<number | null>(checkIn?.energyScore ?? null);
  const [workoutPlan, setWorkoutPlan] = useState<TrainingCheckIn["workoutPlan"]>(
    checkIn?.workoutPlan ?? null,
  );

  return (
    <section className="rounded-3xl border border-white/10 bg-[#111214] p-5 shadow-xl shadow-black/20">
      <div>
        <p className="text-xs uppercase tracking-[0.3em] text-amber-300">Daily check-in</p>
        <h2 className="mt-2 text-xl font-bold text-white">How ready are you today?</h2>
        <p className="mt-1 text-sm text-slate-300">A quick morning check. Your scores never affect XP.</p>
      </div>

      {kneeRecoveryFlag && (
        <div className="mt-4 rounded-2xl border border-rose-400/40 bg-rose-400/10 p-3 text-sm text-rose-100">
          Your knee score has been 1–2 for two days in a row. Reduce high-impact skating and add two Spanish Squat sets before your next session.
        </div>
      )}

      {weeklySummary && (
        <p className="mt-3 text-sm text-slate-300">
          Last 7 days: knee {weeklySummary.knee.toFixed(1)}/5 · energy {weeklySummary.energy.toFixed(1)}/5 · {weeklySummary.days}/7 mornings logged
        </p>
      )}

      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        <ScorePicker
          label="Knee"
          lowLabel="1 · sharp pain"
          highLabel="5 · pain-free"
          value={kneeScore}
          onChange={setKneeScore}
        />
        <ScorePicker
          label="Energy"
          lowLabel="1 · exhausted"
          highLabel="5 · ready"
          value={energyScore}
          onChange={setEnergyScore}
        />
      </div>

      <fieldset className="mt-5">
        <legend className="text-sm font-semibold text-white">Workout completed today?</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {WORKOUT_PLANS.map((plan) => (
            <button
              key={plan.id}
              type="button"
              aria-pressed={workoutPlan === plan.id}
              onClick={() => setWorkoutPlan(plan.id)}
              className={`rounded-xl border px-3 py-2 text-left text-sm transition ${
                workoutPlan === plan.id
                  ? "border-amber-300/70 bg-amber-300/10 text-amber-100"
                  : "border-white/10 bg-black/20 text-slate-300 hover:border-white/30"
              }`}
            >
              <span className="font-bold">Plan {plan.id}</span>
              <span className="ml-2">{plan.name}</span>
            </button>
          ))}
          <button
            type="button"
            aria-pressed={workoutPlan === "rest"}
            onClick={() => setWorkoutPlan("rest")}
            className={`rounded-xl border px-3 py-2 text-left text-sm transition ${
              workoutPlan === "rest"
                ? "border-amber-300/70 bg-amber-300/10 text-amber-100"
                : "border-white/10 bg-black/20 text-slate-300 hover:border-white/30"
            }`}
          >
            Rest day
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-400">
          Select a plan only after completing it. Keep sets and reps in Strong or Hevy. A completed plan earns your existing Strength XP once per day.
          {strengthXpAlreadyEarned ? " Strength XP is already earned today." : ` (+${strengthXp} XP)`}
        </p>
      </fieldset>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={saving || kneeScore === null || energyScore === null}
          onClick={() => {
            if (kneeScore !== null && energyScore !== null) {
              void onSave({ kneeScore, energyScore, workoutPlan });
            }
          }}
          className="rounded-xl bg-amber-400 px-4 py-2.5 text-sm font-bold text-zinc-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Saving…" : checkIn ? "Update check-in" : "Save check-in"}
        </button>
        {statusMessage && <p role="status" className="text-sm text-slate-300">{statusMessage}</p>}
      </div>
    </section>
  );
}
