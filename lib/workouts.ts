import type { WorkoutPlanDefinition } from "@/lib/state-types";

export const WORKOUT_PLANS: WorkoutPlanDefinition[] = [
  {
    id: "1",
    name: "Workout 1 · Max Pop & Posterior Chain",
    preWorkout: [
      "1 minute left-knee manual patellar friction",
      "10 right standing hamstring hinges",
      "Straight-leg extensions: 3 × 45 seconds",
    ],
    exercises: [
      { id: "deadlift", name: "Conventional / trap-bar deadlift", sets: 3, target: 5, unit: "reps", tempo: "2-1-1-0" },
      { id: "deficit-reverse-lunge", name: "DB deficit reverse lunge", sets: 3, target: 8, unit: "reps", tempo: "4-0-1-0", note: "Each leg · strict vertical front shin; do not let the knee travel over the toes under heavy load" },
      { id: "pull-up", name: "Pull-up", sets: 3, target: 8, unit: "reps", tempo: "Controlled", note: "Superset with DB overhead press" },
      { id: "overhead-dumbbell-press", name: "DB overhead press", sets: 3, target: 8, unit: "reps", tempo: "Controlled", note: "Superset with pull-ups" },
    ],
  },
  {
    id: "2",
    name: "Workout 2 · Balance, Hip Control & Anti-Rotation",
    preWorkout: [
      "1 minute left-knee manual patellar friction",
      "10 right standing hamstring hinges",
      "Straight-leg extensions: 3 × 45 seconds",
    ],
    exercises: [
      { id: "single-leg-rdl", name: "Single-leg RDL", sets: 3, target: 8, unit: "reps", tempo: "3-1-1-0", note: "Each leg · fixed shallow knee bend; hinge at the hip" },
      { id: "barbell-overhead-press", name: "Barbell military press", sets: 3, target: 6, unit: "reps", tempo: "2-0-1-0", note: "Quads squeezed, knees locked straight" },
      { id: "pallof-press", name: "Pallof press", sets: 3, target: 12, unit: "reps", tempo: "2-1-2-1", note: "Each side · pure core stabilization" },
    ],
  },
  {
    id: "3",
    name: "Workout 3 · Knee Armoring & Upper Back",
    preWorkout: [
      "1 minute left-knee manual patellar friction",
      "10 right standing hamstring hinges",
      "Straight-leg extensions: 3 × 45 seconds",
    ],
    exercises: [
      { id: "box-squat", name: "Barbell box squat", sets: 3, target: 6, unit: "reps", tempo: "3-1-1-0", note: "Sit deep back onto box; keep shin vertical" },
      { id: "lying-leg-curl", name: "Machine lying leg curl", sets: 3, target: 6, unit: "reps", tempo: "5-0-1-0", note: "Slow negative control to protect right ACL graft" },
      { id: "row", name: "Barbell / cable row", sets: 3, target: 10, unit: "reps", tempo: "2-0-1-1", note: "Hold at the top" },
    ],
  },
];

export const SEASON_MODIFIERS: Record<number, { name: string; cues: string[]; warmup: string[]; restSeconds?: number }> = {
  1: { name: "Float", cues: ["Use a 4–5 second lowering phase on all squats and lunges."], warmup: [] },
  2: { name: "Shoulder/Hip Separation", cues: ["Double the usual Pallof press weight when it can be done with control."], warmup: ["90/90 hip lift-offs", "Thoracic spine thread-the-needle"] },
  3: { name: "Back Truck Weight", cues: ["Pause 2 seconds at the bottom of single-leg RDLs."], warmup: [] },
  4: { name: "Catching Mechanics", cues: ["Box squats: strict setup with forward hip drive."], warmup: [] },
  5: { name: "Visual Anchor", cues: ['Glue eyes to a single wall spot during squat/deadlift sets.'], warmup: [] },
  6: { name: "Reactive Elasticity", cues: [], warmup: ["Assisted pogo hops: 3 sets"] },
  7: { name: "Ankle Scoop", cues: ["Add loaded calf raises and tibialis static holds."], warmup: [] },
  8: { name: "The Unweighting", cues: ["Use an explosive 1-second concentric phase."], warmup: [] },
  9: { name: "Flow Lines", cues: ["Keep gym rest periods to 45 seconds."], warmup: [], restSeconds: 45 },
  10: { name: "Urban Adaptation", cues: ["Use unilateral variations: one-leg rows and one-leg overhead press."], warmup: [] },
};

export function getSeasonWorkout(planId: WorkoutPlanDefinition["id"], season: number) {
  const definition = WORKOUT_PLANS.find((plan) => plan.id === planId);
  if (!definition) return undefined;
  const modifier = SEASON_MODIFIERS[season];
  const exercises = definition.exercises.map((exercise) => {
    const nextExercise = { ...exercise };
    if (season === 1 && ["deficit-reverse-lunge", "box-squat"].includes(exercise.id)) {
      nextExercise.tempo = "4-0-1-0";
    }
    if (season === 3 && exercise.id === "single-leg-rdl") {
      nextExercise.tempo = "3-2-1-0";
    }
    if (season === 4 && exercise.id === "box-squat") {
      nextExercise.note = `${exercise.note}; strict setup with forward hip drive`;
    }
    if (season === 8) {
      if (/^\d+-\d+-\d+-\d+$/.test(exercise.tempo)) {
        const [eccentric, pause, , finish] = exercise.tempo.split("-");
        nextExercise.tempo = `${eccentric}-${pause}-1-${finish}`;
      } else {
        nextExercise.tempo = "2-0-1-0";
      }
    }
    if (season === 10 && exercise.id === "row") {
      nextExercise.name = "Single-leg barbell / cable row";
      nextExercise.note = "Unilateral variation";
    }
    if (season === 10 && ["overhead-dumbbell-press", "barbell-overhead-press"].includes(exercise.id)) {
      nextExercise.name = `Single-leg ${exercise.name.toLowerCase()}`;
      nextExercise.note = "Unilateral variation";
    }
    if (season === 2 && exercise.id === "pallof-press") {
      nextExercise.note = `${exercise.note}; use double the usual weight with controlled form`;
    }
    return nextExercise;
  });
  const extraWarmup = season === 7
    ? ["Loaded calf raises", "Tibialis static holds"]
    : [];

  return {
    ...definition,
    preWorkout: [...definition.preWorkout, ...(modifier?.warmup ?? []), ...extraWarmup],
    exercises,
    cues: modifier?.cues ?? [],
    restSeconds: modifier?.restSeconds,
    seasonName: modifier?.name ?? `Season ${season}`,
  };
}
