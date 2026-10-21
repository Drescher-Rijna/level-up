"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import type { SeasonQuest, SkatePracticeLog, TrainingCheckIn, WorkoutSession } from "@/lib/state-types";
import { getCurrentDateKey } from "@/lib/game";
import { TRAINING_WEEK } from "@/lib/training-program";
import { SEASON_MODIFIERS } from "@/lib/workouts";

function getSessionDate(session: WorkoutSession) {
  const date = new Date(session.completedAt);
  return getCurrentDateKey(date);
}

export default function TrainingCalendar({
  practiceLogs,
  checkIns,
  workoutSessions,
  totalSkateHours,
  activeQuest,
  seasonNumber,
  todayKneeScore,
  onLogPractice,
}: {
  practiceLogs: SkatePracticeLog[];
  checkIns: TrainingCheckIn[];
  workoutSessions: WorkoutSession[];
  totalSkateHours: number;
  activeQuest?: SeasonQuest;
  seasonNumber: number;
  todayKneeScore?: number;
  onLogPractice: (entry: Omit<SkatePracticeLog, "id">) => Promise<void>;
}) {
  const today = getCurrentDateKey();
  const [sessionDate, setSessionDate] = useState(today);
  const [skateMinutes, setSkateMinutes] = useState("90");
  const [focusedMinutes, setFocusedMinutes] = useState("0");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const weekStart = new Date(`${today}T00:00:00`);
  weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
  const dateKeys = TRAINING_WEEK.map((_, index) => {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + index);
    return getCurrentDateKey(date);
  });
  const checkInByDate = new Map(checkIns.map((entry) => [entry.date, entry]));

  async function submitPractice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const skateDuration = Number(skateMinutes);
    const focusedDuration = Number(focusedMinutes);
    if (!Number.isInteger(skateDuration) || skateDuration <= 0) {
      setMessage("Enter skate minutes as a positive whole number.");
      return;
    }
    if (!Number.isInteger(focusedDuration) || focusedDuration < 0 || focusedDuration > skateDuration) {
      setMessage("Focused minutes must be a whole number from zero through skate minutes.");
      return;
    }
    if (focusedDuration > 0 && !activeQuest) {
      setMessage("Start the next quest before logging focused practice.");
      return;
    }
    if (sessionDate === today && (todayKneeScore ?? 5) <= 2) {
      setMessage("Knee score is 1–2 today: do not skate; choose rehab/rest only.");
      return;
    }

    setSaving(true);
    setMessage("");
    try {
      await onLogPractice({
        sessionDate,
        skateMinutes: skateDuration,
        focusedMinutes: focusedDuration,
        notes: notes.trim(),
      });
      setMessage("Skate session saved.");
      setSkateMinutes("90");
      setFocusedMinutes("0");
      setNotes("");
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="space-y-6">
      <section className="rounded-3xl border border-white/10 bg-[#111214] p-5">
        <p className="text-xs uppercase tracking-[0.3em] text-amber-300">Week of {dateKeys[0]}</p>
        <h2 className="mt-2 text-2xl font-black text-white">Training calendar</h2>
        <p className="mt-1 text-sm text-slate-300">Plan by weekday and date. No time-of-day schedule.</p>
        <p className="mt-2 text-sm text-amber-200">{totalSkateHours.toFixed(1)} total skate hours logged across historical and new sessions.</p>
        {todayKneeScore !== undefined && todayKneeScore <= 2 && (
          <p role="alert" className="mt-3 rounded-xl border border-rose-400/30 bg-rose-400/10 p-3 text-sm text-rose-100">
            Knee score {todayKneeScore}/5: no skate session today. Follow your rehab/rest plan.
          </p>
        )}
        <div className="mt-5 space-y-3">
          {TRAINING_WEEK.map((day, index) => {
            const date = dateKeys[index];
            const logs = practiceLogs.filter((log) => log.sessionDate === date);
            const checkIn = checkInByDate.get(date);
            const workoutDone = Boolean(checkIn?.workoutCompleted || workoutSessions.some((session) => getSessionDate(session) === date));
            const reconDone = Boolean(checkIn?.pmReconCompleted);
            const skated = logs.length > 0 || Boolean(checkIn?.skated);
            const totalMinutes = logs.reduce((sum, log) => sum + log.skateMinutes, 0);
            return (
              <article key={date} className={`rounded-2xl border p-4 ${date === today ? "border-amber-300/30 bg-amber-300/5" : "border-white/10 bg-black/15"}`}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="font-bold text-white">{day.name} <span className="ml-1 text-sm font-normal text-slate-400">{date}</span></h3>
                  {totalMinutes > 0 && <span className="text-sm text-amber-200">{(totalMinutes / 60).toFixed(1)} skate hours logged</span>}
                </div>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {day.activities.map((activity) => (
                    <li key={activity} className="rounded-full border border-white/10 px-2.5 py-1 text-xs text-slate-300">{activity}</li>
                  ))}
                </ul>
                {day.recon && <p className="mt-3 text-sm text-slate-300">{day.recon}</p>}
                {day.mission && <p className="mt-3 text-sm leading-6 text-slate-300">{day.mission}</p>}
                {day.mission && SEASON_MODIFIERS[seasonNumber].cues.map((cue) => (
                  <p key={cue} className="mt-2 text-sm text-amber-100">Season {seasonNumber} mission cue: {cue}</p>
                ))}
                {day.mission && SEASON_MODIFIERS[seasonNumber].warmup.map((cue) => (
                  <p key={cue} className="mt-1 text-sm text-amber-100">Season {seasonNumber} warmup: {cue}</p>
                ))}
                {day.break && <p className="mt-2 text-sm text-amber-100">Break: {day.break}</p>}
                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs">
                  <span className={skated ? "text-emerald-300" : "text-slate-500"}>{skated ? "☑" : "☐"} Skated</span>
                  <span className={workoutDone ? "text-emerald-300" : "text-slate-500"}>{workoutDone ? "☑" : "☐"} Workout completed</span>
                  <span className={reconDone ? "text-emerald-300" : "text-slate-500"}>{reconDone ? "☑" : "☐"} PM recon stretch</span>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="rounded-3xl border border-white/10 bg-[#111214] p-5">
        <p className="text-xs uppercase tracking-[0.3em] text-amber-300">Session log</p>
        <h2 className="mt-2 text-xl font-bold text-white">Log skate minutes & focused practice</h2>
        <p className="mt-1 text-sm text-slate-300">
          Focused time is assigned to the active 100-hour quest. Session overage carries forward to the next season.
        </p>
        <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={(event) => void submitPractice(event)}>
          <label className="text-sm text-slate-300">
            Session date
            <input type="date" max={today} value={sessionDate} onChange={(event) => setSessionDate(event.target.value)} required className="mt-1 block w-full rounded-xl border border-white/10 bg-zinc-950 px-3 py-2 text-base text-white" />
          </label>
          <label className="text-sm text-slate-300">
            Skate minutes
            <input type="number" min={1} step={1} value={skateMinutes} onChange={(event) => setSkateMinutes(event.target.value)} required className="mt-1 block w-full rounded-xl border border-white/10 bg-zinc-950 px-3 py-2 text-base text-white" />
          </label>
          <label className="text-sm text-slate-300">
            Focused minutes
            <input type="number" min={0} step={1} max={skateMinutes} value={focusedMinutes} onChange={(event) => setFocusedMinutes(event.target.value)} required className="mt-1 block w-full rounded-xl border border-white/10 bg-zinc-950 px-3 py-2 text-base text-white" />
          </label>
          <label className="text-sm text-slate-300">
            Session notes
            <input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Optional" className="mt-1 block w-full rounded-xl border border-white/10 bg-zinc-950 px-3 py-2 text-base text-white" />
          </label>
          <div className="sm:col-span-2">
            <button type="submit" disabled={saving || (sessionDate === today && (todayKneeScore ?? 5) <= 2)} className="rounded-xl bg-amber-400 px-4 py-2.5 font-bold text-zinc-950 disabled:opacity-50">{saving ? "Saving…" : "Save skate session"}</button>
            {message && <p role="status" className="mt-2 text-sm text-slate-300">{message}</p>}
          </div>
        </form>
        <div className="mt-5">
          <h3 className="font-semibold text-white">Recent sessions</h3>
          {practiceLogs.length === 0 ? (
            <p className="mt-2 text-sm text-slate-400">No new skate sessions logged yet.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {practiceLogs.slice(0, 12).map((log) => (
                <li key={log.id} className="flex flex-wrap justify-between gap-2 rounded-xl border border-white/10 px-3 py-2 text-sm">
                  <span className="text-white">{log.sessionDate} · {(log.skateMinutes / 60).toFixed(1)} skate hours</span>
                  <span className="text-amber-200">{(log.focusedMinutes / 60).toFixed(1)} focused hours</span>
                  {log.notes && <span className="w-full text-slate-400">{log.notes}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </main>
  );
}
