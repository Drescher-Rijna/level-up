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
