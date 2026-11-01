import type {
  BlockBenchmarkRun,
  BlockDayOverride,
  BlockProject,
  BlockProjectRole,
  BlockSessionKind,
  SkateBlock,
} from "@/lib/state-types";

export const BLOCK_DEFAULTS = {
  startDate: "2026-11-03",
  focusCue: "Floating: landing absorption, centred landings, upper-body stillness",
  benchmarkSpot: "Standard ledge, just below knee height",
  gymDays: [2, 3, 4],
};

export const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

type BlockDaySchedule = {
  kind: BlockSessionKind;
  durationLabel: string;
  note: string;
};

// Indexed by Date#getDay(): 0 = Sunday.
export const BLOCK_WEEKLY_SCHEDULE: BlockDaySchedule[] = [
  { kind: "free", durationLabel: "120–180 min", note: "No structure." },
  { kind: "rest", durationLabel: "–", note: "Off the board." },
  { kind: "standard", durationLabel: "90–120 min", note: "Benchmark weeks: test during this session." },
  { kind: "standard", durationLabel: "90–120 min", note: "Different spot or ledge." },
  { kind: "standard", durationLabel: "90–120 min", note: "Swap to free if sore or flat." },
  { kind: "rest", durationLabel: "–", note: "No heavy leg or back work in the gym." },
  { kind: "speed", durationLabel: "120–180 min", note: "Heelflip gap, rail ladder, fast lines. Set the attempt cap before you start." },
];

export const SESSION_KIND_LABELS: Record<BlockSessionKind, string> = {
  standard: "Standard",
  speed: "Speed & commitment",
  free: "Free",
  rest: "Rest",
};

export const STANDARD_SESSION_TEMPLATE = [
  { name: "Warm-up", longSessionMinutes: 15, shortSessionMinutes: 10, detail: "Easy riding with the float cue, ~5 tre flip attempts." },
  { name: "Focus (Floating)", longSessionMinutes: 35, shortSessionMinutes: 25, detail: "Manuals + ollie-to-manual on a pad; landings on known tricks." },
  { name: "Challenge", longSessionMinutes: 40, shortSessionMinutes: 30, detail: "Heelflip 50-50 (main), crooks (nemesis)." },
  { name: "Free", longSessionMinutes: 30, shortSessionMinutes: 25, detail: "Lines." },
];

export const PROJECT_ROLE_LABELS: Record<BlockProjectRole, string> = {
  main: "Main",
  nemesis: "Nemesis",
  warmup: "Warm-up rotation",
  vehicle: "Floating vehicle",
  saturday: "Saturday",
};

export const RAIL_LADDER_RUNGS = [
  "Flat bar boardslide",
  "Low rail boardslide",
  "Low rail lipslide",
  "Low rail crooked grind",
];

export const CLEAN_ATTEMPT_DEFINITION =
  "Clean = rolls away with no foot adjustment. Same spot, approach and speed every time; filmed from the side.";

const MILLISECONDS_PER_DAY = 86_400_000;

function parseDateKey(dateKey: string) {
  return Date.parse(`${dateKey}T00:00:00Z`);
}

export function addDaysToDateKey(dateKey: string, days: number) {
  return new Date(parseDateKey(dateKey) + days * MILLISECONDS_PER_DAY).toISOString().slice(0, 10);
}

export function getWeekdayIndex(dateKey: string) {
  return new Date(parseDateKey(dateKey)).getUTCDay();
}

// Block weeks run Monday to Sunday; the week holding the start date is week 1.
export function getBlockWeekNumber(block: SkateBlock, dateKey: string) {
  const startWeekMonday = addDaysToDateKey(block.startDate, -((getWeekdayIndex(block.startDate) + 6) % 7));
  return Math.floor((parseDateKey(dateKey) - parseDateKey(startWeekMonday)) / (7 * MILLISECONDS_PER_DAY)) + 1;
}

export function getBlockWeekDates(block: SkateBlock, week: number) {
  const startWeekMonday = addDaysToDateKey(block.startDate, -((getWeekdayIndex(block.startDate) + 6) % 7));
  const weekMonday = addDaysToDateKey(startWeekMonday, (week - 1) * 7);
  return Array.from({ length: 7 }, (_, dayOffset) => addDaysToDateKey(weekMonday, dayOffset));
}

export function isDateInBlock(block: SkateBlock, dateKey: string) {
  return dateKey >= block.startDate && dateKey <= block.reviewDate;
}

export function getBlockDayPlan(block: SkateBlock, dateKey: string, dayOverrides: BlockDayOverride[]) {
  const weekdayIndex = getWeekdayIndex(dateKey);
  const schedule = BLOCK_WEEKLY_SCHEDULE[weekdayIndex];
  const override = dayOverrides.find((candidate) => candidate.date === dateKey);
  const week = getBlockWeekNumber(block, dateKey);
  const isInBlock = isDateInBlock(block, dateKey);
  return {
    dateKey,
    weekdayName: WEEKDAY_NAMES[weekdayIndex],
    week,
    isInBlock,
    plannedKind: schedule.kind,
    kind: override?.sessionKind ?? schedule.kind,
    override,
    durationLabel: schedule.durationLabel,
    note: schedule.note,
    isBenchmarkDay: isInBlock && weekdayIndex === 2 && block.benchmarkWeeks.includes(week) && !override,
    isGymDay: block.gymDays.includes(weekdayIndex),
    isReviewDay: dateKey === block.reviewDate,
  };
}

export function countCleanAttempts(run: BlockBenchmarkRun) {
  return run.attempts?.filter((attempt) => attempt === "clean").length ?? 0;
}

export function formatBenchmarkResult(project: BlockProject, run: BlockBenchmarkRun) {
  if (project.metric === "clean_of_10") return `${countCleanAttempts(run)}/10 clean`;
  if (project.metric === "rung") return `Rung ${run.value} · ${RAIL_LADDER_RUNGS[(run.value ?? 1) - 1]}`;
  return `${run.value} cm`;
}

// The latest run for each benchmark week, so a retest replaces the earlier result.
export function getLatestRunByWeek(project: BlockProject, runs: BlockBenchmarkRun[]) {
  const latestRunByWeek = new Map<number, BlockBenchmarkRun>();
  for (const run of runs.filter((candidate) => candidate.projectId === project.id)) {
    latestRunByWeek.set(run.week, run);
  }
  return latestRunByWeek;
}

// The Saturday whose recovery check is still open on this date (checked up to two days later).
export function getPendingRecoverySaturday(block: SkateBlock, dateKey: string, loggedSessionDates: string[]) {
  for (let daysSinceSaturday = 0; daysSinceSaturday <= 2; daysSinceSaturday += 1) {
    const candidate = addDaysToDateKey(dateKey, -daysSinceSaturday);
    if (getWeekdayIndex(candidate) === 6 && isDateInBlock(block, candidate) && !loggedSessionDates.includes(candidate)) {
      return candidate;
    }
  }
  return null;
}
