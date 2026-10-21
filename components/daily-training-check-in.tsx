"use client";

import { useState } from "react";
import type { TrainingCheckIn } from "@/lib/state-types";

function getCo2Band(seconds: number) {
  if (seconds < 30) return "Needs attention";
  if (seconds <= 60) return "Moderate";
  return "Great";
}

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
  kneeRecoveryFlag,
  saving,
  statusMessage,
  weeklySummary,
  onSave,
}: {
  checkIn?: TrainingCheckIn;
  kneeRecoveryFlag: boolean;
  saving: boolean;
  statusMessage: string;
  weeklySummary: { days: number; knee: number; energy: number; co2Average: number | null } | null;
  onSave: (checkIn: Omit<TrainingCheckIn, "date" | "workoutPlan">) => Promise<void>;
}) {
  const [kneeScore, setKneeScore] = useState<number | null>(checkIn?.kneeScore ?? null);
  const [energyScore, setEnergyScore] = useState<number | null>(checkIn?.energyScore ?? null);
  const [skated, setSkated] = useState(checkIn?.skated ?? false);
  const [workoutCompleted, setWorkoutCompleted] = useState(checkIn?.workoutCompleted ?? false);
  const [pmReconCompleted, setPmReconCompleted] = useState(checkIn?.pmReconCompleted ?? false);
  const [sleepHours, setSleepHours] = useState(
    checkIn?.sleepHours === null || checkIn?.sleepHours === undefined ? "" : String(checkIn.sleepHours),
  );
  const [co2Seconds, setCo2Seconds] = useState(
    checkIn?.co2ToleranceSeconds === null || checkIn?.co2ToleranceSeconds === undefined
      ? ""
      : String(checkIn.co2ToleranceSeconds),
  );
  const parsedCo2Seconds = co2Seconds.trim() ? Number(co2Seconds) : null;
  const invalidCo2Seconds =
    parsedCo2Seconds !== null &&
    (!Number.isInteger(parsedCo2Seconds) || parsedCo2Seconds < 1);
  const parsedSleepHours = sleepHours.trim() ? Number(sleepHours) : null;
  const invalidSleepHours = parsedSleepHours !== null &&
    (!Number.isFinite(parsedSleepHours) || parsedSleepHours < 0 || parsedSleepHours > 24);
  return (
    <section className="rounded-3xl border border-white/10 bg-[#111214] p-5 shadow-xl shadow-black/20">
      <div>
        <p className="text-xs uppercase tracking-[0.3em] text-amber-300">Daily check-in</p>
        <h2 className="mt-2 text-xl font-bold text-white">How ready are you today?</h2>
        <p className="mt-1 text-sm text-slate-300">Before rating your knee, perform exactly two deep bodyweight squats. Your scores never affect XP.</p>
      </div>

      {kneeRecoveryFlag && (
        <div className="mt-4 rounded-2xl border border-rose-400/40 bg-rose-400/10 p-3 text-sm text-rose-100">
          Your knee score has been 1–2 for two days in a row. Reduce high-impact skating and add two Spanish Squat sets before your next session.
        </div>
      )}

      {weeklySummary && (
        <p className="mt-3 text-sm text-slate-300">
          Last 7 days: knee {weeklySummary.knee.toFixed(1)}/5 · energy {weeklySummary.energy.toFixed(1)}/5 · {weeklySummary.days}/7 mornings logged
          {weeklySummary.co2Average !== null && (
            <> · breath-hold check average {weeklySummary.co2Average.toFixed(0)}s ({getCo2Band(weeklySummary.co2Average)})</>
          )}
        </p>
      )}

      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        <ScorePicker
          label="Knee"
          lowLabel="1 · sharp pain / block"
          highLabel="5 · fluid / elastic"
          value={kneeScore}
          onChange={setKneeScore}
        />
        <ScorePicker
          label="Energy (CNS fatigue/readiness)"
          lowLabel="1 · exhausted"
          highLabel="5 · ready"
          value={energyScore}
          onChange={setEnergyScore}
        />
      </div>
      {kneeScore !== null && (
        <p className={`mt-3 rounded-xl border p-3 text-sm ${kneeScore <= 2 ? "border-rose-400/30 bg-rose-400/10 text-rose-100" : "border-white/10 bg-black/15 text-slate-300"}`}>
          {[
            "",
            "1/5 · Sharp pain or hard block: brain restricts depth. Red flag — no skate.",
            "2/5 · Dull ache or asymmetric right-side pull: rehab/rest only.",
            "3/5 · Mild stiffness that opens on rep 2: low-impact manual/flow skate.",
            "4/5 · Smooth tracking, negligible tightness: full tech/pop green light.",
            "5/5 · Fluid, bouncy, no joint awareness: nemesis trick day.",
          ][kneeScore]}
        </p>
      )}

      <fieldset className="mt-5">
        <legend className="text-sm font-semibold text-white">Daily checklist</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          <label className="flex items-start gap-2 rounded-xl border border-white/10 p-3 text-sm text-slate-300">
            <input type="checkbox" checked={skated} onChange={(event) => setSkated(event.target.checked)} className="mt-1 accent-amber-400" />
            <span>Skated <span className="block text-xs text-slate-500">Log session and focus minutes in Calendar.</span></span>
          </label>
          <label className="flex items-start gap-2 rounded-xl border border-white/10 p-3 text-sm text-slate-300">
            <input type="checkbox" checked={workoutCompleted} onChange={(event) => setWorkoutCompleted(event.target.checked)} className="mt-1 accent-amber-400" />
            Workout completed
          </label>
          <label className="flex items-start gap-2 rounded-xl border border-white/10 p-3 text-sm text-slate-300">
            <input type="checkbox" checked={pmReconCompleted} onChange={(event) => setPmReconCompleted(event.target.checked)} className="mt-1 accent-amber-400" />
            PM recon stretch completed
          </label>
        </div>
      </fieldset>

      <div className="mt-5">
        <label htmlFor="sleep-hours" className="text-sm font-semibold text-white">
          Sleep duration
        </label>
        <div className="mt-2 flex items-center gap-3">
          <input
            id="sleep-hours"
            type="number"
            min={0}
            max={24}
            step={0.25}
            value={sleepHours}
            onChange={(event) => setSleepHours(event.target.value)}
            placeholder="Hours"
            className="w-32 rounded-xl border border-white/10 bg-zinc-950 px-4 py-2.5 text-white outline-none placeholder:text-slate-500 focus:border-amber-400"
          />
          <span className="text-sm text-slate-400">hours · Friday target: 8</span>
          {parsedSleepHours !== null && !invalidSleepHours && (
            <span className={`text-sm font-semibold ${parsedSleepHours >= 8 ? "text-emerald-300" : "text-amber-200"}`}>
              {parsedSleepHours >= 8 ? "Target met" : "Below target"}
            </span>
          )}
        </div>
        {invalidSleepHours && <p role="alert" className="mt-1 text-xs text-rose-200">Enter a number from 0 through 24.</p>}
      </div>

      <div className="mt-5">
        <label htmlFor="co2-tolerance-seconds" className="text-sm font-semibold text-white">
          Optional comfortable breath-hold check
        </label>
        <div className="mt-2 flex items-center gap-3">
          <input
            id="co2-tolerance-seconds"
            type="number"
            min={1}
            step={1}
            value={co2Seconds}
            onChange={(event) => setCo2Seconds(event.target.value)}
            placeholder="Seconds"
            className="w-32 rounded-xl border border-white/10 bg-zinc-950 px-4 py-2.5 text-white outline-none placeholder:text-slate-500 focus:border-amber-400"
          />
          <span className="text-sm text-slate-400">seconds</span>
          {parsedCo2Seconds !== null && !invalidCo2Seconds && (
            <span className="text-sm font-semibold text-amber-200">
              {getCo2Band(parsedCo2Seconds)}
            </span>
          )}
        </div>
        {invalidCo2Seconds && (
          <p className="mt-1 text-xs text-rose-200" role="alert">
            Enter a whole number of seconds greater than zero, or leave this optional check blank.
          </p>
        )}
        <p className="mt-2 max-w-2xl text-xs leading-5 text-slate-400">
          Optional rough trend only, not a medical or direct CO₂ measurement. If you choose to log one, stop at the first clear urge to breathe—don’t push for a maximum or hyperventilate. Do it seated, never in water or while driving.
          <span className="mt-1 block">Under 30s: needs attention · 30–60s: moderate · over 60s: great. No XP is awarded.</span>
        </p>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={saving || kneeScore === null || energyScore === null || invalidCo2Seconds || invalidSleepHours}
          onClick={() => {
            if (kneeScore !== null && energyScore !== null) {
              void onSave({
                kneeScore,
                energyScore,
                co2ToleranceSeconds: parsedCo2Seconds,
                sleepHours: parsedSleepHours,
                skated,
                workoutCompleted,
                pmReconCompleted,
              });
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
