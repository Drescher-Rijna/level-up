import type { DEFAULT_QUEST } from "@/lib/game";
import type { StatKey, Task } from "@/lib/game";

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
};
