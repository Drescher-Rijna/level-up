"use client";

import Link from "next/link";
import { useState } from "react";
import type { FormEvent } from "react";
import type {
  BenchmarkAttempt,
  BlockBenchmarkRun,
  BlockDayOverride,
  BlockRecoveryCheck,
  SkateBlockSnapshot,
  SkatePracticeLog,
} from "@/lib/state-types";
import {
  BLOCK_DEFAULTS,
  CLEAN_ATTEMPT_DEFINITION,
  PROJECT_ROLE_LABELS,
  RAIL_LADDER_RUNGS,
  SESSION_KIND_LABELS,
  STANDARD_SESSION_TEMPLATE,
  WEEKDAY_NAMES,
  addDaysToDateKey,
  formatBenchmarkResult,
  getBlockDayPlan,
  getBlockWeekDates,
  getBlockWeekNumber,
  getLatestRunByWeek,
  getPendingRecoverySaturday,
} from "@/lib/skate-block";

type ReadyBlockSnapshot = Extract<SkateBlockSnapshot, { status: "ready" }>;
type BlockTab = "today" | "week" | "projects" | "benchmark" | "review";

export type SkateBlockActions = {
  onCreate: (block: { startDate: string; focusCue: string; benchmarkSpot: string; gymDays: number[] }) => Promise<void>;
  onLogBenchmark: (run: Omit<BlockBenchmarkRun, "id">) => Promise<void>;
  onSetDayOverride: (date: string, sessionKind: BlockDayOverride["sessionKind"] | null, reason: string) => Promise<void>;
  onAddParkingLotIdea: (idea: string) => Promise<void>;
  onLogRecoveryCheck: (check: BlockRecoveryCheck) => Promise<void>;
  onCompleteReview: (adoptedIdeaId: string | null) => Promise<void>;
};

const BLOCK_TABS: { id: BlockTab; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "week", label: "Week" },
  { id: "projects", label: "Projects" },
  { id: "benchmark", label: "Benchmark" },
  { id: "review", label: "Lock & review" },
];

const PANEL_CLASS = "rounded-3xl border border-white/10 bg-[#111214] p-5";
const INPUT_CLASS = "mt-1 block w-full rounded-xl border border-white/10 bg-zinc-950 px-3 py-2 text-base text-white";
const PRIMARY_BUTTON_CLASS = "rounded-xl bg-amber-400 px-4 py-2.5 font-bold text-zinc-950 disabled:opacity-50";
const SECONDARY_BUTTON_CLASS = "rounded-xl border border-white/15 px-3 py-2 text-sm text-slate-200 hover:border-white/40 disabled:opacity-50";

// Runs a save, surfacing its error text instead of throwing into React.
function useSaveAction() {
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

  async function runSave(save: () => Promise<void>, successMessage: string) {
    setIsSaving(true);
    setStatusMessage("");
    try {
      await save();
      setStatusMessage(successMessage);
      return true;
    } catch (error) {
      setStatusMessage((error as Error).message);
      return false;
    } finally {
      setIsSaving(false);
    }
  }

  return { isSaving, statusMessage, runSave };
}

function getRecentPainCheck(snapshot: ReadyBlockSnapshot, today: string) {
  const oneWeekAgo = addDaysToDateKey(today, -7);
  return [...snapshot.recoveryChecks]
    .reverse()
    .find((check) => check.hasPain && check.sessionDate >= oneWeekAgo);
}

export function SkateBlockTodayCard({ snapshot, today }: { snapshot: SkateBlockSnapshot; today: string }) {
  if (snapshot.status === "unavailable") return null;
  if (snapshot.status === "not-started") {
    return (
      <Link href="/block" className="block rounded-2xl border border-amber-300/40 bg-amber-300/10 p-4 text-amber-100">
        Set up the 6-week skate block starting Tue 3 Nov →
      </Link>
    );
  }

  const dayPlan = getBlockDayPlan(snapshot.block, today, snapshot.dayOverrides);
  const hasRecentPain = Boolean(getRecentPainCheck(snapshot, today));
  const blockHasStarted = today >= snapshot.block.startDate;
  return (
    <Link href="/block" className="app-quest-preview">
      <div className="app-quest-preview-top">
        <span>{blockHasStarted ? `Skate block · week ${Math.min(6, dayPlan.week)} of 6` : `Skate block starts ${snapshot.block.startDate}`}</span>
        <strong>{snapshot.block.isLocked ? "Locked" : "Reviewed"}</strong>
      </div>
      <h2>{dayPlan.isInBlock ? `${dayPlan.weekdayName}: ${SESSION_KIND_LABELS[dayPlan.kind]}` : "Open the block plan"}</h2>
      <p>
        {dayPlan.isInBlock && dayPlan.kind !== "rest" ? `${dayPlan.durationLabel} · ` : ""}
        {dayPlan.isBenchmarkDay ? "Benchmark session today · " : ""}
        {hasRecentPain ? "Pain flagged: adjust the plan · " : ""}
        Benchmarks decide progress, not the hour bar.
      </p>
    </Link>
  );
}

function BlockSetup({ onCreate }: { onCreate: SkateBlockActions["onCreate"] }) {
  const [startDate, setStartDate] = useState(BLOCK_DEFAULTS.startDate);
  const [focusCue, setFocusCue] = useState(BLOCK_DEFAULTS.focusCue);
  const [benchmarkSpot, setBenchmarkSpot] = useState(BLOCK_DEFAULTS.benchmarkSpot);
  const [gymDays, setGymDays] = useState<number[]>(BLOCK_DEFAULTS.gymDays);
  const { isSaving, statusMessage, runSave } = useSaveAction();

  function toggleGymDay(weekdayIndex: number) {
    setGymDays((current) =>
      current.includes(weekdayIndex)
        ? current.filter((day) => day !== weekdayIndex)
        : [...current, weekdayIndex].sort(),
    );
  }

  return (
    <section className={PANEL_CLASS}>
      <p className="text-xs uppercase tracking-[0.3em] text-amber-300">New block</p>
      <h2 className="mt-2 text-2xl font-black text-white">Set up the 6-week block</h2>
      <p className="mt-1 text-sm text-slate-300">
        The block sits inside your active season. Once started, the plan is locked until the review 40 days later; new ideas go to the parking lot.
      </p>
      <form
        className="mt-4 grid gap-3 sm:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          void runSave(() => onCreate({ startDate, focusCue, benchmarkSpot, gymDays }), "Block started and locked.");
        }}
      >
        <label className="text-sm text-slate-300">
          Start date
          <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} required className={INPUT_CLASS} />
        </label>
        <label className="text-sm text-slate-300">
          Benchmark spot
          <input value={benchmarkSpot} onChange={(event) => setBenchmarkSpot(event.target.value)} className={INPUT_CLASS} />
        </label>
        <label className="text-sm text-slate-300 sm:col-span-2">
          Floating focus for this block
          <input value={focusCue} onChange={(event) => setFocusCue(event.target.value)} className={INPUT_CLASS} />
        </label>
        <fieldset className="text-sm text-slate-300 sm:col-span-2">
          <legend>Gym days</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {WEEKDAY_NAMES.map((weekdayName, weekdayIndex) => (
              <button
                key={weekdayName}
                type="button"
                aria-pressed={gymDays.includes(weekdayIndex)}
                onClick={() => toggleGymDay(weekdayIndex)}
                className={`rounded-full border px-3 py-1.5 text-sm ${gymDays.includes(weekdayIndex) ? "border-amber-300 bg-amber-300/15 text-amber-100" : "border-white/15 text-slate-300"}`}
              >
                {weekdayName.slice(0, 3)}
              </button>
            ))}
          </div>
        </fieldset>
        <div className="sm:col-span-2">
          <button type="submit" disabled={isSaving} className={PRIMARY_BUTTON_CLASS}>{isSaving ? "Starting…" : "Start and lock block"}</button>
          {statusMessage && <p role="status" className="mt-2 text-sm text-slate-300">{statusMessage}</p>}
        </div>
      </form>
    </section>
  );
}

function SessionTemplate() {
  return (
    <ol className="mt-3 space-y-2">
      {STANDARD_SESSION_TEMPLATE.map((templateBlock) => (
        <li key={templateBlock.name} className="rounded-xl border border-white/10 bg-black/15 px-3 py-2 text-sm">
          <div className="flex flex-wrap justify-between gap-2">
            <span className="font-semibold text-white">{templateBlock.name}</span>
            <span className="text-amber-200">{templateBlock.longSessionMinutes} min · {templateBlock.shortSessionMinutes} min on a 90-min day</span>
          </div>
          <p className="mt-1 text-slate-400">{templateBlock.detail}</p>
        </li>
      ))}
    </ol>
  );
}

function DaySwapButtons({
  dateKey,
  override,
  plannedKind,
  onSetDayOverride,
}: {
  dateKey: string;
  override?: BlockDayOverride;
  plannedKind: string;
  onSetDayOverride: SkateBlockActions["onSetDayOverride"];
}) {
  const { isSaving, statusMessage, runSave } = useSaveAction();
  if (plannedKind === "rest" && !override) return null;

  return (
    <div className="mt-3">
      <div className="flex flex-wrap gap-2">
        {override ? (
          <button type="button" disabled={isSaving} onClick={() => void runSave(() => onSetDayOverride(dateKey, null, ""), "Back to the planned session.")} className={SECONDARY_BUTTON_CLASS}>
            Undo swap
          </button>
        ) : (
          <>
            {plannedKind !== "free" && (
              <button type="button" disabled={isSaving} onClick={() => void runSave(() => onSetDayOverride(dateKey, "free", "Bad day"), "Swapped to a free session. No guilt.")} className={SECONDARY_BUTTON_CLASS}>
                Swap to free session
              </button>
            )}
            <button type="button" disabled={isSaving} onClick={() => void runSave(() => onSetDayOverride(dateKey, "rest", "Pain or injury"), "Swapped to rest. Pain overrides the lock.")} className={SECONDARY_BUTTON_CLASS}>
              Rest (pain/injury)
            </button>
          </>
        )}
      </div>
      {statusMessage && <p role="status" className="mt-2 text-sm text-slate-300">{statusMessage}</p>}
    </div>
  );
}

function RecoveryCheckForm({
  saturdayDate,
  onLogRecoveryCheck,
}: {
  saturdayDate: string;
  onLogRecoveryCheck: SkateBlockActions["onLogRecoveryCheck"];
}) {
  const [lowerBackSoreness, setLowerBackSoreness] = useState(0);
  const [hasPain, setHasPain] = useState(false);
  const [note, setNote] = useState("");
  const { isSaving, statusMessage, runSave } = useSaveAction();

  return (
    <section className={PANEL_CLASS}>
      <p className="text-xs uppercase tracking-[0.3em] text-amber-300">Recovery check</p>
      <h3 className="mt-2 text-xl font-bold text-white">After Saturday {saturdayDate}</h3>
      <form
        className="mt-3 space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          void runSave(
            () => onLogRecoveryCheck({ sessionDate: saturdayDate, lowerBackSoreness, hasPain, note: note.trim() }),
            hasPain ? "Pain logged. It overrides the lock: swap upcoming sessions to rest." : "Recovery check saved.",
          );
        }}
      >
        <label className="block text-sm text-slate-300">
          Lower-back soreness: <strong className="text-white">{lowerBackSoreness}/5</strong>
          <input type="range" min={0} max={5} step={1} value={lowerBackSoreness} onChange={(event) => setLowerBackSoreness(Number(event.target.value))} className="mt-2 block w-full accent-amber-400" />
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input type="checkbox" checked={hasPain} onChange={(event) => setHasPain(event.target.checked)} className="h-5 w-5 accent-rose-400" />
          Pain or injury (not just soreness)
        </label>
        <label className="block text-sm text-slate-300">
          Note
          <input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Optional" className={INPUT_CLASS} />
        </label>
        <button type="submit" disabled={isSaving} className={PRIMARY_BUTTON_CLASS}>{isSaving ? "Saving…" : "Save recovery check"}</button>
        {statusMessage && <p role="status" className="text-sm text-slate-300">{statusMessage}</p>}
      </form>
    </section>
  );
}

function TodayTab({
  snapshot,
  today,
  practiceLogs,
  actions,
}: {
  snapshot: ReadyBlockSnapshot;
  today: string;
  practiceLogs: SkatePracticeLog[];
  actions: SkateBlockActions;
}) {
  const dayPlan = getBlockDayPlan(snapshot.block, today, snapshot.dayOverrides);
  const recentPainCheck = getRecentPainCheck(snapshot, today);
  const pendingRecoverySaturday = getPendingRecoverySaturday(
    snapshot.block,
    today,
    snapshot.recoveryChecks.map((check) => check.sessionDate),
  );
  const loggedMinutesToday = practiceLogs
    .filter((log) => log.sessionDate === today)
    .reduce((total, log) => total + log.skateMinutes, 0);

  return (
    <div className="space-y-6">
      {recentPainCheck && (
        <p role="alert" className="rounded-2xl border border-rose-400/40 bg-rose-400/10 p-4 text-sm text-rose-100">
          Pain flagged after the {recentPainCheck.sessionDate} session{recentPainCheck.note ? ` (${recentPainCheck.note})` : ""}. Pain overrides the lock: swap sessions to rest until it settles.
        </p>
      )}
      <section className={PANEL_CLASS}>
        <p className="text-xs uppercase tracking-[0.3em] text-amber-300">
          {dayPlan.isInBlock ? `Week ${dayPlan.week} of 6 · ${today}` : today < snapshot.block.startDate ? `Starts ${snapshot.block.startDate}` : "Block finished"}
        </p>
        <h2 className="mt-2 text-2xl font-black text-white">
          {dayPlan.weekdayName}: {SESSION_KIND_LABELS[dayPlan.kind]}
          {dayPlan.kind !== "rest" && <span className="ml-2 text-base font-normal text-slate-400">{dayPlan.durationLabel}</span>}
        </h2>
        {dayPlan.override && <p className="mt-1 text-sm text-amber-200">Swapped from {SESSION_KIND_LABELS[dayPlan.plannedKind]} · {dayPlan.override.reason}</p>}
        <p className="mt-2 text-sm text-slate-300">{dayPlan.note}</p>
        {snapshot.block.focusCue && <p className="mt-2 text-sm text-amber-100">Focus: {snapshot.block.focusCue}</p>}
        {dayPlan.isBenchmarkDay && (
          <p className="mt-3 rounded-xl border border-amber-300/40 bg-amber-300/10 p-3 text-sm text-amber-100">
            Benchmark session ({dayPlan.week === 1 ? "baseline" : dayPlan.week === 6 ? "final" : "midpoint"}) at {snapshot.block.benchmarkSpot || "your benchmark spot"}. {CLEAN_ATTEMPT_DEFINITION}
          </p>
        )}
        {dayPlan.isGymDay && <p className="mt-2 text-sm text-slate-400">Gym day.</p>}
        {dayPlan.kind === "standard" && <SessionTemplate />}
        {dayPlan.isInBlock && (
          <DaySwapButtons dateKey={today} override={dayPlan.override} plannedKind={dayPlan.plannedKind} onSetDayOverride={actions.onSetDayOverride} />
        )}
        <p className="mt-4 text-sm text-slate-400">
          {loggedMinutesToday > 0 ? `${(loggedMinutesToday / 60).toFixed(1)} h logged today. ` : ""}
          Hours still count toward the active season. <Link href="/calendar" className="text-amber-200 underline underline-offset-4">Log session hours →</Link>
        </p>
      </section>
      {pendingRecoverySaturday && (
        <RecoveryCheckForm key={pendingRecoverySaturday} saturdayDate={pendingRecoverySaturday} onLogRecoveryCheck={actions.onLogRecoveryCheck} />
      )}
    </div>
  );
}

function WeekTab({
  snapshot,
  today,
  practiceLogs,
  actions,
}: {
  snapshot: ReadyBlockSnapshot;
  today: string;
  practiceLogs: SkatePracticeLog[];
  actions: SkateBlockActions;
}) {
  const currentWeek = Math.min(6, Math.max(1, getBlockWeekNumber(snapshot.block, today)));
  const [selectedWeek, setSelectedWeek] = useState(currentWeek);
  const weekDates = getBlockWeekDates(snapshot.block, selectedWeek);

  return (
    <section className={PANEL_CLASS}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-amber-300">{weekDates[0]} – {weekDates[6]}</p>
          <h2 className="mt-2 text-2xl font-black text-white">
            Week {selectedWeek} of 6
            {snapshot.block.benchmarkWeeks.includes(selectedWeek) && <span className="ml-2 text-base font-normal text-amber-200">Benchmark week</span>}
          </h2>
        </div>
        <div className="flex gap-2">
          <button type="button" aria-label="Previous week" disabled={selectedWeek <= 1} onClick={() => setSelectedWeek((week) => week - 1)} className={SECONDARY_BUTTON_CLASS}>←</button>
          <button type="button" aria-label="Next week" disabled={selectedWeek >= 6} onClick={() => setSelectedWeek((week) => week + 1)} className={SECONDARY_BUTTON_CLASS}>→</button>
        </div>
      </div>
      <div className="mt-4 space-y-3">
        {weekDates.map((dateKey) => {
          const dayPlan = getBlockDayPlan(snapshot.block, dateKey, snapshot.dayOverrides);
          const loggedMinutes = practiceLogs
            .filter((log) => log.sessionDate === dateKey)
            .reduce((total, log) => total + log.skateMinutes, 0);
          const isUpcomingOrToday = dateKey >= today;
          return (
            <article key={dateKey} className={`rounded-2xl border p-4 ${dateKey === today ? "border-amber-300/30 bg-amber-300/5" : "border-white/10 bg-black/15"} ${dayPlan.isInBlock ? "" : "opacity-50"}`}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-bold text-white">
                  {dayPlan.weekdayName} <span className="ml-1 text-sm font-normal text-slate-400">{dateKey}</span>
                </h3>
                {loggedMinutes > 0 && <span className="text-sm text-emerald-300">{(loggedMinutes / 60).toFixed(1)} h logged</span>}
              </div>
              <ul className="mt-2 flex flex-wrap gap-2 text-xs">
                <li className="rounded-full border border-white/10 px-2.5 py-1 text-slate-200">
                  {SESSION_KIND_LABELS[dayPlan.kind]}{dayPlan.kind !== "rest" ? ` · ${dayPlan.durationLabel}` : ""}
                </li>
                {dayPlan.override && <li className="rounded-full border border-amber-300/40 px-2.5 py-1 text-amber-200">Swapped: {dayPlan.override.reason}</li>}
                {dayPlan.isBenchmarkDay && <li className="rounded-full border border-amber-300/40 bg-amber-300/10 px-2.5 py-1 text-amber-100">Benchmark</li>}
                {dayPlan.isGymDay && <li className="rounded-full border border-white/10 px-2.5 py-1 text-slate-300">Gym</li>}
                {dayPlan.isReviewDay && <li className="rounded-full border border-emerald-300/40 px-2.5 py-1 text-emerald-200">Review day</li>}
              </ul>
              <p className="mt-2 text-sm text-slate-400">{dayPlan.note}</p>
              {dayPlan.isInBlock && isUpcomingOrToday && (
                <DaySwapButtons dateKey={dateKey} override={dayPlan.override} plannedKind={dayPlan.plannedKind} onSetDayOverride={actions.onSetDayOverride} />
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function ProjectsTab({ snapshot }: { snapshot: ReadyBlockSnapshot }) {
  const benchmarkWeeks = snapshot.block.benchmarkWeeks;
  return (
    <section className={PANEL_CLASS}>
      <p className="text-xs uppercase tracking-[0.3em] text-amber-300">{snapshot.block.isLocked ? "Locked for the block" : "Reviewed"}</p>
      <h2 className="mt-2 text-2xl font-black text-white">Projects</h2>
      <p className="mt-1 text-sm text-slate-300">Structure stays fixed; contents vary (different spots, speeds, ledges).</p>
      <div className="mt-4 space-y-3">
        {snapshot.projects.map((project) => {
          const latestRunByWeek = getLatestRunByWeek(project, snapshot.benchmarkRuns);
          return (
            <article key={project.id} className="rounded-2xl border border-white/10 bg-black/15 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-bold text-white">{project.name}</h3>
                <span className="rounded-full border border-white/10 px-2 py-0.5 text-xs text-slate-300">{PROJECT_ROLE_LABELS[project.role]}</span>
              </div>
              <p className="mt-1 text-sm text-slate-400">{project.location} · Trains {project.trains.toLowerCase()}</p>
              {project.metric === "rung" && (
                <ol className="mt-2 list-inside list-decimal text-sm text-slate-400">
                  {RAIL_LADDER_RUNGS.map((rung) => <li key={rung}>{rung}</li>)}
                </ol>
              )}
              <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
                {benchmarkWeeks.map((week) => {
                  const run = latestRunByWeek.get(week);
                  return (
                    <div key={week} className="rounded-xl border border-white/10 px-2 py-2">
                      <dt className="text-xs text-slate-400">Week {week}</dt>
                      <dd className={run ? "font-semibold text-amber-200" : "text-slate-500"}>{run ? formatBenchmarkResult(project, run) : "–"}</dd>
                    </div>
                  );
                })}
              </dl>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function BenchmarkTab({ snapshot, today, onLogBenchmark }: { snapshot: ReadyBlockSnapshot; today: string; onLogBenchmark: SkateBlockActions["onLogBenchmark"] }) {
  const currentWeek = Math.min(6, Math.max(1, getBlockWeekNumber(snapshot.block, today)));
  const [selectedProjectId, setSelectedProjectId] = useState(snapshot.projects[0]?.id ?? "");
  const [week, setWeek] = useState(currentWeek);
  const [testedOn, setTestedOn] = useState(today);
  const [attempts, setAttempts] = useState<BenchmarkAttempt[]>(Array(10).fill("miss"));
  const [measuredValue, setMeasuredValue] = useState("");
  const [conditions, setConditions] = useState(snapshot.block.benchmarkSpot);
  const [videoUrl, setVideoUrl] = useState("");
  const { isSaving, statusMessage, runSave } = useSaveAction();
  const selectedProject = snapshot.projects.find((project) => project.id === selectedProjectId);
  const cleanAttemptCount = attempts.filter((attempt) => attempt === "clean").length;

  async function saveBenchmark(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedProject) return;
    const isAttemptBased = selectedProject.metric === "clean_of_10";
    const wasSaved = await runSave(
      () => onLogBenchmark({
        projectId: selectedProject.id,
        week,
        testedOn,
        attempts: isAttemptBased ? attempts : null,
        value: isAttemptBased ? null : Number(measuredValue),
        conditions,
        videoUrl,
      }),
      "Benchmark saved.",
    );
    if (wasSaved) {
      setAttempts(Array(10).fill("miss"));
      setMeasuredValue("");
      setVideoUrl("");
    }
  }

  return (
    <section className={PANEL_CLASS}>
      <p className="text-xs uppercase tracking-[0.3em] text-amber-300">Weeks {snapshot.block.benchmarkWeeks.join(", ")}</p>
      <h2 className="mt-2 text-2xl font-black text-white">Log a benchmark</h2>
      <p className="mt-1 text-sm text-slate-300">{CLEAN_ATTEMPT_DEFINITION}</p>
      <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={(event) => void saveBenchmark(event)}>
        <label className="text-sm text-slate-300">
          Project
          <select value={selectedProjectId} onChange={(event) => setSelectedProjectId(event.target.value)} className={INPUT_CLASS}>
            {snapshot.projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
          </select>
        </label>
        <label className="text-sm text-slate-300">
          Block week
          <select value={week} onChange={(event) => setWeek(Number(event.target.value))} className={INPUT_CLASS}>
            {[1, 2, 3, 4, 5, 6].map((weekOption) => (
              <option key={weekOption} value={weekOption}>Week {weekOption}{snapshot.block.benchmarkWeeks.includes(weekOption) ? " (benchmark)" : ""}</option>
            ))}
          </select>
        </label>
        {selectedProject?.metric === "clean_of_10" && (
          <fieldset className="text-sm text-slate-300 sm:col-span-2">
            <legend>Attempts · tap to mark clean ({cleanAttemptCount}/10)</legend>
            <div className="mt-2 grid grid-cols-5 gap-2">
              {attempts.map((attempt, attemptIndex) => (
                <button
                  key={attemptIndex}
                  type="button"
                  aria-pressed={attempt === "clean"}
                  aria-label={`Attempt ${attemptIndex + 1}: ${attempt}`}
                  onClick={() => setAttempts((current) => current.map((existing, index) => index === attemptIndex ? (existing === "clean" ? "miss" : "clean") : existing))}
                  className={`h-11 rounded-xl border font-bold ${attempt === "clean" ? "border-emerald-400 bg-emerald-400 text-zinc-950" : "border-white/15 text-slate-400"}`}
                >
                  {attemptIndex + 1}
                </button>
              ))}
            </div>
          </fieldset>
        )}
        {selectedProject?.metric === "distance" && (
          <label className="text-sm text-slate-300">
            Manual distance across the pad (cm)
            <input type="number" min={0} step="any" value={measuredValue} onChange={(event) => setMeasuredValue(event.target.value)} required className={INPUT_CLASS} />
          </label>
        )}
        {selectedProject?.metric === "rung" && (
          <label className="text-sm text-slate-300">
            Current rung
            <select value={measuredValue} onChange={(event) => setMeasuredValue(event.target.value)} required className={INPUT_CLASS}>
              <option value="">Choose a rung</option>
              {RAIL_LADDER_RUNGS.map((rung, rungIndex) => <option key={rung} value={rungIndex + 1}>{rungIndex + 1}. {rung}</option>)}
            </select>
          </label>
        )}
        <label className="text-sm text-slate-300">
          Test date
          <input type="date" value={testedOn} onChange={(event) => setTestedOn(event.target.value)} required className={INPUT_CLASS} />
        </label>
        <label className="text-sm text-slate-300">
          Conditions (spot, speed)
          <input value={conditions} onChange={(event) => setConditions(event.target.value)} className={INPUT_CLASS} />
        </label>
        <label className="text-sm text-slate-300">
          Video link
          <input type="url" value={videoUrl} onChange={(event) => setVideoUrl(event.target.value)} placeholder="Optional" className={INPUT_CLASS} />
        </label>
        <div className="sm:col-span-2">
          <button type="submit" disabled={isSaving || !selectedProject} className={PRIMARY_BUTTON_CLASS}>{isSaving ? "Saving…" : "Save benchmark"}</button>
          {statusMessage && <p role="status" className="mt-2 text-sm text-slate-300">{statusMessage}</p>}
        </div>
      </form>
    </section>
  );
}

function ReviewTab({ snapshot, today, actions }: { snapshot: ReadyBlockSnapshot; today: string; actions: SkateBlockActions }) {
  const [newIdea, setNewIdea] = useState("");
  const [adoptedIdeaId, setAdoptedIdeaId] = useState<string>("");
  const ideaSave = useSaveAction();
  const reviewSave = useSaveAction();
  const isReviewed = Boolean(snapshot.block.reviewedAt);
  const isReviewOpen = !isReviewed && today >= snapshot.block.reviewDate;

  return (
    <div className="space-y-6">
      <section className={PANEL_CLASS}>
        <p className="text-xs uppercase tracking-[0.3em] text-amber-300">{isReviewed ? "Reviewed" : `Locked until ${snapshot.block.reviewDate}`}</p>
        <h2 className="mt-2 text-2xl font-black text-white">Parking lot</h2>
        <p className="mt-1 text-sm text-slate-300">
          The plan is locked for the block. Park new ideas here; at review, at most one may change the plan. Pain or injury overrides the lock at any time.
        </p>
        {!isReviewed && (
          <form
            className="mt-4 flex flex-col gap-2 sm:flex-row"
            onSubmit={(event) => {
              event.preventDefault();
              void ideaSave.runSave(async () => {
                await actions.onAddParkingLotIdea(newIdea);
                setNewIdea("");
              }, "Idea parked.");
            }}
          >
            <label className="sr-only" htmlFor="parking-lot-idea">New idea</label>
            <input id="parking-lot-idea" value={newIdea} onChange={(event) => setNewIdea(event.target.value)} required placeholder="e.g. add a no-comply warm-up" className="min-w-0 flex-1 rounded-xl border border-white/10 bg-zinc-950 px-3 py-2 text-base text-white" />
            <button type="submit" disabled={ideaSave.isSaving} className={PRIMARY_BUTTON_CLASS}>Park it</button>
          </form>
        )}
        {ideaSave.statusMessage && <p role="status" className="mt-2 text-sm text-slate-300">{ideaSave.statusMessage}</p>}
        {snapshot.parkingLot.length === 0 ? (
          <p className="mt-4 text-sm text-slate-400">No parked ideas yet.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {snapshot.parkingLot.map((parkedIdea) => (
              <li key={parkedIdea.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 px-3 py-2 text-sm">
                <span className="text-white">{parkedIdea.idea}</span>
                <span className={parkedIdea.decision === "adopted" ? "text-emerald-300" : "text-slate-500"}>
                  {parkedIdea.decision ?? parkedIdea.createdAt.slice(0, 10)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {isReviewOpen && (
        <section className={PANEL_CLASS}>
          <h2 className="text-2xl font-black text-white">Review</h2>
          <p className="mt-1 text-sm text-slate-300">Compare week 1 to week 6 in Projects, then choose at most one change for the next block.</p>
          <form
            className="mt-4 space-y-2"
            onSubmit={(event) => {
              event.preventDefault();
              void reviewSave.runSave(() => actions.onCompleteReview(adoptedIdeaId || null), "Review saved. The block is unlocked.");
            }}
          >
            <label className="flex items-center gap-2 text-sm text-slate-200">
              <input type="radio" name="adopted-idea" checked={adoptedIdeaId === ""} onChange={() => setAdoptedIdeaId("")} className="accent-amber-400" />
              No change
            </label>
            {snapshot.parkingLot.map((parkedIdea) => (
              <label key={parkedIdea.id} className="flex items-center gap-2 text-sm text-slate-200">
                <input type="radio" name="adopted-idea" checked={adoptedIdeaId === parkedIdea.id} onChange={() => setAdoptedIdeaId(parkedIdea.id)} className="accent-amber-400" />
                {parkedIdea.idea}
              </label>
            ))}
            <button type="submit" disabled={reviewSave.isSaving} className={`${PRIMARY_BUTTON_CLASS} mt-2`}>Complete review</button>
            {reviewSave.statusMessage && <p role="status" className="text-sm text-slate-300">{reviewSave.statusMessage}</p>}
          </form>
        </section>
      )}
    </div>
  );
}

export default function SkateBlockPlanner({
  snapshot,
  today,
  practiceLogs,
  actions,
}: {
  snapshot: SkateBlockSnapshot;
  today: string;
  practiceLogs: SkatePracticeLog[];
  actions: SkateBlockActions;
}) {
  const [activeTab, setActiveTab] = useState<BlockTab>("today");

  if (snapshot.status === "unavailable") {
    return (
      <section className={PANEL_CLASS}>
        <h2 className="text-xl font-bold text-white">Block tables not set up yet</h2>
        <p className="mt-2 text-sm text-slate-300">
          Run <code className="text-amber-200">supabase/skate-block.sql</code> in the Supabase SQL Editor, then refresh. It only adds new tables; existing data is untouched.
        </p>
      </section>
    );
  }
  if (snapshot.status === "not-started") return <BlockSetup onCreate={actions.onCreate} />;

  return (
    <div className="space-y-6">
      <nav aria-label="Block sections" className="flex gap-2 overflow-x-auto pb-1">
        {BLOCK_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            aria-pressed={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`shrink-0 rounded-full border px-3.5 py-2 text-sm font-semibold ${activeTab === tab.id ? "border-amber-300 bg-amber-300/15 text-amber-100" : "border-white/10 text-slate-300"}`}
          >
            {tab.label}
          </button>
        ))}
      </nav>
      {activeTab === "today" && <TodayTab snapshot={snapshot} today={today} practiceLogs={practiceLogs} actions={actions} />}
      {activeTab === "week" && <WeekTab snapshot={snapshot} today={today} practiceLogs={practiceLogs} actions={actions} />}
      {activeTab === "projects" && <ProjectsTab snapshot={snapshot} />}
      {activeTab === "benchmark" && <BenchmarkTab snapshot={snapshot} today={today} onLogBenchmark={actions.onLogBenchmark} />}
      {activeTab === "review" && <ReviewTab snapshot={snapshot} today={today} actions={actions} />}
    </div>
  );
}
