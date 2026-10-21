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
  sleepHours: number | null;
  skated: boolean;
  workoutCompleted: boolean;
  pmReconCompleted: boolean;
  workoutPlan?: WorkoutPlan | "rest" | null;
};

export type SeasonQuest = {
  id: string;
  sortOrder: number;
  name: string;
  description: string;
  targetFocusMinutes: number;
  focusedMinutes: number;
  status: "planned" | "active" | "completed";
  startedAt: string | null;
  completedAt: string | null;
};

export type SkatePracticeLog = {
  id: string;
  sessionDate: string;
  skateMinutes: number;
  focusedMinutes: number;
  notes: string;
};

export type BenchmarkLog = {
  id: string;
  seasonOrder: number;
  metric: string;
  value: number;
  notes: string;
  testedAt: string;
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
  preWorkout: string[];
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
  seasonQuests: SeasonQuest[];
  accumulatedFocusMinutes: number;
  skatePracticeLogs: SkatePracticeLog[];
  benchmarkLogs: BenchmarkLog[];
};
