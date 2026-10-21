import type { SeasonQuest } from "@/lib/state-types";
import { getCurrentDateKey } from "@/lib/game";

type TrainingDayPlan = {
  day: number;
  name: string;
  activities: readonly string[];
  recon?: string;
  mission?: string;
  break?: string;
};

export const TRAINING_WEEK: TrainingDayPlan[] = [
  {
    day: 1,
    name: "Monday",
    activities: ["Rest", "PM recon protocol"],
    recon: "15 min: 90/90 stretches, deep squat to pike, wall-sit/chair 3 × 45 sec, single-leg glute bridges 2 × 12",
  },
  {
    day: 2,
    name: "Tuesday",
    activities: ["Workout 1", "Tech skate · 60–90 min"],
  },
  {
    day: 3,
    name: "Wednesday",
    activities: ["Workout 2", "Skate · 60–90 min"],
  },
  {
    day: 4,
    name: "Thursday",
    activities: ["Workout 3", "Tech/precision skate · 60–90 min"],
  },
  {
    day: 5,
    name: "Friday",
    activities: ["Rest", "PM recon protocol", "Track 8 hours of sleep"],
    recon: "15 min: 90/90 stretches, deep squat to pike, wall-sit/chair 3 × 45 sec, single-leg glute bridges 2 × 12",
  },
  {
    day: 6,
    name: "Saturday",
    activities: ["Street skate · 2 × 3-hour sessions", "15 min energy break between sessions"],
    mission: "Each session: 20 min warmup/cruising · 50 min silent lands · 50 min nemesis/parallel shoulders · 45 min flow lines · 15 min flexible practice",
    break: "Remove shoes, eat a banana and rice cakes, and take electrolyte tabs.",
  },
  {
    day: 0,
    name: "Sunday",
    activities: ["Street skate · 2 × 3-hour sessions", "15 min energy break between sessions"],
    mission: "Each session: 20 min warmup/cruising · 50 min silent lands · 50 min nemesis/parallel shoulders · 45 min flow lines · 15 min flexible practice",
    break: "Remove shoes, eat a banana and rice cakes, and take electrolyte tabs.",
  },
];

export const BENCHMARK_GOALS = [
  { id: "ankle-dorsiflexion", name: "Ankle dorsiflexion", unit: "cm", target: "10–12 cm knee-to-wall, heel flat" },
  { id: "hip-pancake", name: "Hip pancake", unit: "pass", target: "90° straddle, elbows flat, spine straight" },
  { id: "t-spine", name: "T-spine rotation", unit: "degrees", target: "45° rotational independence" },
  { id: "deadlift", name: "Deadlift", unit: "× bodyweight", target: "2.0× BW for 1 rep OR 1.7× BW for 5 reps" },
  { id: "box-squat", name: "Box squat", unit: "× bodyweight", target: "1.5× BW for 5 reps" },
  { id: "split-squat", name: "B-split squat / deficit lunge", unit: "× bodyweight in hands", target: "0.5× BW for 8 reps with 4-second negative" },
  { id: "patellar-isometric", name: "Patellar tendon isometric", unit: "× bodyweight", target: "1.2× BW for 45 sec, zero pain" },
  { id: "nordic-curl", name: "ACL graft security · Nordic curls", unit: "reps", target: "6 continuous reps, 5-second eccentric to floor" },
  { id: "pogo-hops", name: "Ankle elasticity · pogo hops", unit: "seconds", target: "60 sec rapid continuous hops, arches held vertical" },
] as const;

export function getSeasonProgress(quests: SeasonQuest[]) {
  const focusedMinutes = quests.reduce((total, quest) => total + quest.focusedMinutes, 0);
  return {
    focusedMinutes,
    focusedHours: focusedMinutes / 60,
    percent: (focusedMinutes / 60000) * 100,
  };
}

export function getWeekDates(today = new Date()) {
  const monday = new Date(today);
  monday.setHours(0, 0, 0, 0);
  const mondayOffset = (monday.getDay() + 6) % 7;
  monday.setDate(monday.getDate() - mondayOffset);
  return TRAINING_WEEK.map((plan, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    return { ...plan, date: getCurrentDateKey(date) };
  });
}

export function isBenchmarkDue(quest: SeasonQuest | undefined, logs: { seasonOrder: number; metric: string }[]) {
  if (!quest || !quest.startedAt) return false;
  const today = getCurrentDateKey();
  const daysElapsed = Math.floor(
    (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${quest.startedAt}T00:00:00Z`)) / 86400000,
  );
  const reachedHourTarget = quest.focusedMinutes >= quest.targetFocusMinutes;
  if (!reachedHourTarget && daysElapsed < 42) return false;
  return BENCHMARK_GOALS.some(
    (goal) => !logs.some((log) => log.seasonOrder === quest.sortOrder && log.metric === goal.id),
  );
}

export function getDueBenchmarkQuests(
  quests: SeasonQuest[],
  logs: { seasonOrder: number; metric: string }[],
) {
  return quests
    .filter((quest) => quest.status !== "planned" && isBenchmarkDue(quest, logs))
    .sort((first, second) => first.sortOrder - second.sortOrder);
}
