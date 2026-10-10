import type { DEFAULT_QUEST } from "@/lib/game";
import type { StatKey, Task } from "@/lib/game";

export type QuestTemplate = {
  id: string;
  name: string;
  description: string;
  targetHours: number;
  completionBonusXp: number;
};

export type WorkoutPlan = "1" | "2" | "3";

export type TrainingCheckIn = {
  date: string;
  kneeScore: number;
  energyScore: number;
  co2ToleranceSeconds: number | null;
  workoutPlan?: WorkoutPlan | "rest" | null;
};

export type WorkoutExerciseDefinition = {
  id: string;
  name: string;
  sets: number;
  target: number;
  unit: "reps" | "seconds";
  tempo: string;
  note?: string;
};

export type WorkoutPlanDefinition = {
  id: WorkoutPlan;
  name: string;
  exercises: WorkoutExerciseDefinition[];
};

export type WorkoutSet = {
  reps: number;
  weightKg: number | null;
  completed: boolean;
};

export type WorkoutExerciseLog = WorkoutExerciseDefinition & {
  loggedSets: WorkoutSet[];
};

export type WorkoutSession = {
  id: string;
  plan: WorkoutPlan;
  completedAt: string;
  exercises: WorkoutExerciseLog[];
};

export type AppState = {
  displayName: string;
  skatingStartDate: string;
  totalXp: number;
  statXp: Record<StatKey, number>;
  tasks: Task[];
  completedToday: Record<string, boolean>;
  completedDates: string[];
  quest: typeof DEFAULT_QUEST;
  totalSkateHours: number;
  questBonusAwarded: boolean;
  questTemplates: QuestTemplate[];
  trainingCheckIns: TrainingCheckIn[];
  workoutSessions: WorkoutSession[];
};
