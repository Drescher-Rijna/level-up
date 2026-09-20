export type StatKey = "skill" | "body" | "mind" | "discipline" | "recovery" | "character";

export type Task = {
  id: string;
  name: string;
  description: string;
  stat: StatKey;
  xp: number;
  active: boolean;
  frequency: "daily";
};

export const STAT_META: Record<
  StatKey,
  { name: string; icon: string; accent: string }
> = {
  skill: { name: "SKILL", icon: "🛹", accent: "from-amber-400 to-orange-500" },
  body: { name: "BODY", icon: "💪", accent: "from-red-500 to-rose-600" },
  mind: { name: "MIND", icon: "🧠", accent: "from-violet-500 to-indigo-500" },
  discipline: { name: "DISCIPLINE", icon: "🔥", accent: "from-cyan-500 to-sky-500" },
  recovery: { name: "RECOVERY", icon: "❤️", accent: "from-pink-500 to-fuchsia-500" },
  character: { name: "CHARACTER", icon: "🤝", accent: "from-emerald-500 to-green-600" },
};

export const DEFAULT_TASKS: Task[] = [
  { id: "skate", name: "Skate", description: "Deliberate skate practice", stat: "skill", xp: 500, active: true, frequency: "daily" },
  { id: "strength", name: "Strength / Body", description: "Physical training and conditioning", stat: "body", xp: 250, active: true, frequency: "daily" },
  { id: "mobility", name: "Mobility", description: "Mobility and recovery flow", stat: "body", xp: 150, active: true, frequency: "daily" },
  { id: "mind", name: "Mind", description: "Footage review and reflection", stat: "mind", xp: 150, active: true, frequency: "daily" },
  { id: "japanese", name: "Japanese", description: "Language and intentional study", stat: "discipline", xp: 150, active: true, frequency: "daily" },
  { id: "recovery", name: "Recovery", description: "Sleep, food, rest, and care", stat: "recovery", xp: 150, active: true, frequency: "daily" },
  { id: "character", name: "Character", description: "One intentional act of kindness", stat: "character", xp: 150, active: true, frequency: "daily" },
];

export function getLevelThreshold(level: number) {
  return 1000 + (level - 1) * 1100 + Math.max(0, level - 2) * (level - 1) * 50;
}

export function getLevelData(totalXp: number) {
  let level = 1;
  let previousLevelStartXp = 0;
  let nextLevelThreshold = getLevelThreshold(level);

  while (totalXp >= nextLevelThreshold) {
    previousLevelStartXp = nextLevelThreshold;
    level += 1;
    nextLevelThreshold = getLevelThreshold(level);
  }

  const currentLevelXp = totalXp - previousLevelStartXp;
  const xpToNextLevel = nextLevelThreshold - previousLevelStartXp;
  const progress = xpToNextLevel === 0 ? 100 : (currentLevelXp / xpToNextLevel) * 100;

  return {
    level,
    currentLevelXp,
    xpToNextLevel,
    progress,
    nextLevelThreshold,
  };
}

export function getStatProgress(xp: number) {
  return getLevelData(xp);
}

export function getCurrentDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getCurrentStreak(completedDates: string[]) {
  const uniqueDates = new Set(completedDates);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let streak = 0;
  const cursor = new Date(today);

  while (uniqueDates.has(getCurrentDateKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}

export function getSkatingYear(startDate: string, currentDate = new Date()) {
  const start = new Date(`${startDate}T00:00:00`);
  const now = new Date(currentDate);
  const yearsSinceStart = now.getFullYear() - start.getFullYear();

  if (now.getMonth() < start.getMonth() || (now.getMonth() === start.getMonth() && now.getDate() < start.getDate())) {
    return yearsSinceStart;
  }

  return yearsSinceStart + 1;
}

export const DEFAULT_USER_PROFILE = {
  displayName: "Rin",
  skatingStartDate: "2022-09-15",
};

export const DEFAULT_TOTAL_XP = 7420;

export const DEFAULT_STAT_XP: Record<StatKey, number> = {
  skill: 3420,
  body: 2050,
  mind: 1820,
  discipline: 2710,
  recovery: 2220,
  character: 1940,
};

export const DEFAULT_QUEST = {
  id: "back-seat-weight-distribution",
  name: "Back seat weight distribution",
  description: "Keep your weight centered and controlled through the back seat.",
  targetHours: 100,
  completedHours: 0,
  startedAt: "",
  status: "active" as "active" | "completed",
  completionBonusXp: 2000,
};

export const DEFAULT_TOTAL_SKATE_HOURS = 128.5;

export const DEFAULT_MILESTONES = [
  { id: "100-hours", name: "100 skate hours", description: "First major milestone", requirement: 100, unlocked: true },
  { id: "500-hours", name: "500 skate hours", description: "Long-term training volume", requirement: 500, unlocked: false },
  { id: "1000-hours", name: "1,000 skate hours", description: "Persistence in the craft", requirement: 1000, unlocked: false },
  { id: "2000-hours", name: "2,000 skate hours", description: "Serious progression", requirement: 2000, unlocked: false },
  { id: "5000-hours", name: "5,000 skate hours", description: "Mastery level practice", requirement: 5000, unlocked: false },
  { id: "10000-hours", name: "10,000 skate hours", description: "The ten-year arc", requirement: 10000, unlocked: false },
];

export function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
