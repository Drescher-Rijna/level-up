import type { WorkoutPlanDefinition } from "@/lib/state-types";

export const WORKOUT_PLANS: WorkoutPlanDefinition[] = [
  {
    id: "1",
    name: "Workout 1",
    exercises: [
      { id: "spanish-squat", name: "Spanish squat", sets: 3, target: 45, unit: "seconds", tempo: "Isometric", note: "Warm-up hold" },
      { id: "deadlift", name: "Deadlift", sets: 3, target: 5, unit: "reps", tempo: "2-1-1-0", note: "Conventional or trap-bar" },
      { id: "bulgarian-split-squat", name: "Dumbbell Bulgarian split squat", sets: 3, target: 8, unit: "reps", tempo: "4-0-1-0", note: "Each leg" },
      { id: "pull-up", name: "Pull-up", sets: 3, target: 8, unit: "reps", tempo: "Controlled", note: "Superset with overhead press" },
      { id: "overhead-dumbbell-press", name: "Overhead dumbbell press", sets: 3, target: 8, unit: "reps", tempo: "Controlled", note: "Superset with pull-ups" },
    ],
  },
  {
    id: "2",
    name: "Workout 2",
    exercises: [
      { id: "spanish-squat", name: "Spanish squat", sets: 3, target: 45, unit: "seconds", tempo: "Isometric", note: "Warm-up hold" },
      { id: "single-leg-rdl", name: "Single-leg dumbbell RDL", sets: 3, target: 8, unit: "reps", tempo: "3-1-1-0", note: "Each leg" },
      { id: "barbell-overhead-press", name: "Barbell overhead press", sets: 3, target: 6, unit: "reps", tempo: "2-0-1-0" },
      { id: "pallof-press", name: "Pallof press", sets: 3, target: 12, unit: "reps", tempo: "Controlled", note: "Each side" },
    ],
  },
  {
    id: "3",
    name: "Workout 3",
    exercises: [
      { id: "spanish-squat", name: "Spanish squat", sets: 3, target: 45, unit: "seconds", tempo: "Isometric", note: "Warm-up hold" },
      { id: "back-squat", name: "Barbell back squat", sets: 3, target: 6, unit: "reps", tempo: "3-1-1-0", note: "Front squat alternative" },
      { id: "nordic-hamstring-curl", name: "Nordic hamstring curl", sets: 3, target: 6, unit: "reps", tempo: "4-0-1-0" },
      { id: "row", name: "Barbell or cable row", sets: 3, target: 10, unit: "reps", tempo: "2-0-1-1", note: "Hold at the top" },
    ],
  },
];
