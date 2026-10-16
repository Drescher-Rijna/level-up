"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import {
  DEFAULT_MILESTONES,
  DEFAULT_QUEST,
  DEFAULT_STAT_XP,
  DEFAULT_TASKS,
  DEFAULT_TOTAL_SKATE_HOURS,
  DEFAULT_TOTAL_XP,
  DEFAULT_USER_PROFILE,
  STAT_META,
  type StatKey,
  type Task,
  getCurrentDateKey,
  getCurrentStreak,
  getLevelData,
  getSkatingYear,
} from "@/lib/game";
import type {
  AppState,
  QuestTemplate,
  TrainingCheckIn,
  WorkoutSession,
} from "@/lib/state-types";
import DailyTrainingCheckIn from "@/components/daily-training-check-in";
import WorkoutTracker from "@/components/workout-tracker";
import {
  completeTask,
  ensureUserProfile,
  loadUserState,
  logQuestHours,
  saveTrainingCheckIn,
  saveWorkoutSession,
  startQuestFromTemplate,
} from "@/lib/persistence";
import { getSupabaseClient, getSupabaseConfigurationError } from "@/lib/supabase";

type AppView = "home" | "stats" | "workouts" | "quests" | "settings";

const DEFAULT_QUEST_TEMPLATES: QuestTemplate[] = [
  { id: "back-seat-weight-distribution", name: "Back seat weight distribution", description: "Keep your weight centered and controlled through the back seat.", targetHours: 100, completionBonusXp: 2000 },
  { id: "floating-on-your-tricks", name: "Floating on your tricks", description: "Build a lighter, more effortless feeling in your tricks.", targetHours: 100, completionBonusXp: 2000 },
  { id: "keep-the-board-in-front-of-you", name: "Keep the board in front of you", description: "Practice staying connected to the board through the full trick.", targetHours: 100, completionBonusXp: 2000 },
  { id: "separate-shoulders-and-hips", name: "Separate shoulders and hips", description: "Develop independent control of your shoulders and hips.", targetHours: 100, completionBonusXp: 2000 },
  { id: "pinching-your-truck", name: "Pinching your truck", description: "Practice a consistent, controlled pinch on the truck.", targetHours: 100, completionBonusXp: 2000 },
  { id: "keeping-speed-on-exit", name: "Keeping speed on exit", description: "Carry useful speed through the landing and exit.", targetHours: 100, completionBonusXp: 2000 },
  { id: "doing-tricks-with-speed", name: "Doing tricks with speed", description: "Build confidence and control while practicing with speed.", targetHours: 100, completionBonusXp: 2000 },
];

function addDays(date: Date, days: number) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

function buildDefaultState(): AppState {
  const today = new Date();
  const completionDates = Array.from({ length: 47 }, (_, index) =>
    getCurrentDateKey(addDays(today, -index)),
  );

  return {
    displayName: DEFAULT_USER_PROFILE.displayName,
    skatingStartDate: DEFAULT_USER_PROFILE.skatingStartDate,
    totalXp: DEFAULT_TOTAL_XP,
    statXp: DEFAULT_STAT_XP,
    tasks: DEFAULT_TASKS,
    completedToday: {
      skate: true,
      mind: true,
      recovery: true,
    },
    completedDates: completionDates,
    quest: { ...DEFAULT_QUEST },
    totalSkateHours: DEFAULT_TOTAL_SKATE_HOURS,
    questBonusAwarded: false,
    questTemplates: DEFAULT_QUEST_TEMPLATES,
    trainingCheckIns: [],
    workoutSessions: [],
  };
}

function readState() {
  if (typeof window === "undefined") {
    return buildDefaultState();
  }

  const raw = window.localStorage.getItem("skate-mastery-state");
  if (!raw) {
    return buildDefaultState();
  }

  try {
    const parsed = JSON.parse(raw) as Partial<AppState>;
    return {
      ...buildDefaultState(),
      ...parsed,
      statXp: { ...DEFAULT_STAT_XP, ...(parsed.statXp ?? {}) },
      tasks: parsed.tasks ?? DEFAULT_TASKS,
      questTemplates: parsed.questTemplates ?? DEFAULT_QUEST_TEMPLATES,
      trainingCheckIns: (parsed.trainingCheckIns ?? []).map((checkIn) => ({
        ...checkIn,
        co2ToleranceSeconds: checkIn.co2ToleranceSeconds ?? null,
      })),
      workoutSessions: parsed.workoutSessions ?? [],
    };
  } catch {
    return buildDefaultState();
  }
}

function ProgressBar({ percent }: { percent: number }) {
  return (
    <div className="app-progress">
      <div
        className="app-progress-fill"
        style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
      />
    </div>
  );
}

export default function SkateMasteryApp({ view }: { view: AppView }) {
  const [mounted, setMounted] = useState(false);
  const [appState, setAppState] = useState<AppState>(buildDefaultState);
  const [user, setUser] = useState<User | null>(null);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [isCreatingAccount, setIsCreatingAccount] = useState(false);
  const [authMessage, setAuthMessage] = useState("");
  const [remoteStateError, setRemoteStateError] = useState("");
  const [checkInMessage, setCheckInMessage] = useState("");
  const [focusMessage, setFocusMessage] = useState("");
  const [isSavingCheckIn, setIsSavingCheckIn] = useState(false);
  const [isSavingWorkout, setIsSavingWorkout] = useState(false);
  const [workoutMessage, setWorkoutMessage] = useState("");
  const [focusedHours, setFocusedHours] = useState("");
  const supabaseClient = getSupabaseClient();

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
    if (!supabaseClient) {
      setAppState(readState());
      return;
    }

    void supabaseClient.auth.getSession().then(({ data, error }) => {
      if (error) {
        setAuthMessage(error.message);
        return;
      }
      setUser(data.session?.user ?? null);
    });

    const { data: authSubscription } = supabaseClient.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => authSubscription.subscription.unsubscribe();
  }, [supabaseClient]);

  useEffect(() => {
    if (!mounted || !user) {
      return;
    }

    void loadUserState(user)
      .then((remoteState) => {
        setAppState((current) => ({ ...current, ...remoteState }));
      })
      .catch((error: Error) => {
        setRemoteStateError(error.message);
      });
  }, [mounted, user]);

  useEffect(() => {
    if (!mounted || user || typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem("skate-mastery-state", JSON.stringify(appState));
  }, [appState, mounted, user]);

  const levelData = useMemo(() => getLevelData(appState.totalXp), [appState.totalXp]);

  const todayXp = useMemo(
    () =>
      appState.tasks
        .filter((task) => appState.completedToday[task.id])
        .reduce((sum, task) => sum + task.xp, 0),
    [appState.completedToday, appState.tasks],
  );

  const currentStreak = useMemo(
    () => getCurrentStreak(appState.completedDates),
    [appState.completedDates],
  );

  const skatingYear = useMemo(
    () => getSkatingYear(appState.skatingStartDate),
    [appState.skatingStartDate],
  );

  const today = getCurrentDateKey();
  const yesterdayDate = new Date();
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterday = getCurrentDateKey(yesterdayDate);
  const checkInsByDate = new Map(appState.trainingCheckIns.map((checkIn) => [checkIn.date, checkIn]));
  const todayCheckIn = checkInsByDate.get(today);
  const kneeRecoveryFlag = Boolean(
    todayCheckIn &&
    todayCheckIn.kneeScore <= 2 &&
    (checkInsByDate.get(yesterday)?.kneeScore ?? 5) <= 2,
  );
  const lastSevenDates = Array.from({ length: 7 }, (_, daysAgo) => {
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);
    return getCurrentDateKey(date);
  });
  const weekDays = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - index));
    const dateKey = getCurrentDateKey(date);
    return {
      key: dateKey,
      label: new Intl.DateTimeFormat("en", { weekday: "short" }).format(date).slice(0, 2),
      completed: appState.completedDates.includes(dateKey),
      isToday: dateKey === today,
    };
  });
  const weeklyCheckIns = appState.trainingCheckIns.filter((checkIn) => lastSevenDates.includes(checkIn.date));
  const weeklyCheckInSummary = weeklyCheckIns.length
    ? {
        days: weeklyCheckIns.length,
        knee: weeklyCheckIns.reduce((total, checkIn) => total + checkIn.kneeScore, 0) / weeklyCheckIns.length,
        energy: weeklyCheckIns.reduce((total, checkIn) => total + checkIn.energyScore, 0) / weeklyCheckIns.length,
        co2Average: (() => {
          const co2Scores = weeklyCheckIns
            .map((checkIn) => checkIn.co2ToleranceSeconds)
            .filter((seconds): seconds is number => seconds !== null);
          return co2Scores.length
            ? co2Scores.reduce((total, seconds) => total + seconds, 0) / co2Scores.length
            : null;
        })(),
      }
    : null;
  const strengthTask = appState.tasks.find((task) => task.id === "strength");

  if (!mounted) {
    return (
      <div className="min-h-screen bg-[#0b0b0c] px-4 py-6 text-slate-100">
        <div className="mx-auto max-w-6xl animate-pulse space-y-6">
          <div className="h-24 rounded-3xl bg-white/5" />
          <div className="h-80 rounded-3xl bg-white/5" />
        </div>
      </div>
    );
  }

  if (getSupabaseConfigurationError()) {
    return (
      <div className="min-h-screen bg-[#0b0b0c] px-4 py-6 text-slate-100">
        <div className="mx-auto max-w-xl rounded-3xl border border-red-500/30 bg-red-500/10 p-6">
          <h1 className="text-2xl font-black text-white">Supabase configuration needed</h1>
          <p className="mt-3 text-sm leading-6 text-red-100">
            {getSupabaseConfigurationError()}
          </p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#0b0b0c] px-4 py-6 text-slate-100">
        <div className="mx-auto max-w-md rounded-3xl border border-white/10 bg-[#111214] p-6 shadow-xl shadow-black/20">
          <p className="text-xs uppercase tracking-[0.38em] text-amber-300">Skate Mastery</p>
          <h1 className="mt-3 text-3xl font-black text-white">
            {isCreatingAccount ? "Create your skater account" : "Sign in to save your progression"}
          </h1>
          <p className="mt-3 text-sm leading-6 text-slate-300">
            {isCreatingAccount
              ? "Create an account with email and password. Your progression will sync across devices."
              : "Use your email and password to access your saved progression."}
          </p>
          <form
            className="mt-6 space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (!supabaseClient || !authEmail.trim() || !authPassword) return;
              setAuthMessage("");
              const authRequest = isCreatingAccount
                ? supabaseClient.auth.signUp({
                    email: authEmail.trim(),
                    password: authPassword,
                  })
                : supabaseClient.auth.signInWithPassword({
                    email: authEmail.trim(),
                    password: authPassword,
                  });

              void authRequest.then(({ data, error }) => {
                if (error) {
                  setAuthMessage(error.message);
                  return;
                }

                if (isCreatingAccount && !data.session) {
                  setAuthMessage("Account created. Check your email if confirmation is enabled, then sign in.");
                  return;
                }

                setAuthMessage("Signed in. Loading your progression...");
              });
            }}
          >
            <input
              type="email"
              required
              value={authEmail}
              onChange={(event) => setAuthEmail(event.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-2xl border border-white/10 bg-zinc-950 px-4 py-3 text-white outline-none placeholder:text-slate-500 focus:border-amber-400"
            />
            <input
              type="password"
              required
              minLength={6}
              value={authPassword}
              onChange={(event) => setAuthPassword(event.target.value)}
              placeholder="Password (at least 6 characters)"
              className="w-full rounded-2xl border border-white/10 bg-zinc-950 px-4 py-3 text-white outline-none placeholder:text-slate-500 focus:border-amber-400"
            />
            <button className="w-full rounded-2xl bg-amber-400 px-5 py-3 font-bold text-zinc-950 transition hover:bg-amber-300">
              {isCreatingAccount ? "Create account" : "Sign in"}
            </button>
          </form>
          {authMessage && <p className="mt-4 text-sm text-amber-100">{authMessage}</p>}
          <div className="mt-5 flex flex-col gap-3 text-sm text-slate-300">
            {!isCreatingAccount && (
              <Link
                href="/reset-password"
                className="font-medium text-amber-200 underline decoration-amber-200/40 underline-offset-4 hover:text-amber-100"
              >
                Forgot password?
              </Link>
            )}
            <button
              type="button"
              onClick={() => {
                setIsCreatingAccount((current) => !current);
                setAuthMessage("");
              }}
              className="text-left font-medium underline decoration-white/20 underline-offset-4 hover:text-white"
            >
              {isCreatingAccount ? "Already have an account? Sign in" : "Need an account? Create one"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const authenticatedUser = user;

  if (remoteStateError) {
    return (
      <div className="min-h-screen bg-[#0b0b0c] px-4 py-6 text-slate-100">
        <div className="mx-auto max-w-xl rounded-3xl border border-red-500/30 bg-red-500/10 p-6">
          <p className="text-xs uppercase tracking-[0.32em] text-red-200">Supabase sync error</p>
          <h1 className="mt-3 text-2xl font-black text-white">Your account is signed in, but data is not available yet.</h1>
          <p className="mt-3 text-sm leading-6 text-red-100">{remoteStateError}</p>
          <p className="mt-4 text-sm leading-6 text-slate-300">
            Run the SQL in <code className="text-amber-200">supabase/schema.sql</code> in your Supabase SQL Editor, then refresh this page.
          </p>
        </div>
      </div>
    );
  }

  const statEntries = Object.entries(STAT_META) as [StatKey, (typeof STAT_META)[StatKey]][];

  async function awardTaskXp(task: Task) {
    if (appState.completedToday[task.id]) {
      return true;
    }

    try {
      await completeTask(authenticatedUser, task.id, getCurrentDateKey());
    } catch (error) {
      setAuthMessage(`Could not save task completion: ${(error as Error).message}`);
      return false;
    }

    setAppState((current) => {
      if (current.completedToday[task.id]) {
        return current;
      }

      const nextCompletedToday = { ...current.completedToday, [task.id]: true };
      const nextCompletedDates = [...new Set([...current.completedDates, getCurrentDateKey()])];
      const nextStatXp = { ...current.statXp, [task.stat]: current.statXp[task.stat] + task.xp };

      return {
        ...current,
        totalXp: current.totalXp + task.xp,
        statXp: nextStatXp,
        completedToday: nextCompletedToday,
        completedDates: nextCompletedDates,
      };
    });
    return true;
  }

  async function updateQuestHours(hoursToAdd: number) {
    try {
      await logQuestHours(authenticatedUser, appState.quest.id, hoursToAdd);
    } catch (error) {
      setFocusMessage(`Could not save focused hours: ${(error as Error).message}`);
      return false;
    }

    setAppState((current) => {
      const nextCompletedHours = current.quest.completedHours + hoursToAdd;
      let nextQuest = { ...current.quest, completedHours: Math.min(nextCompletedHours, current.quest.targetHours) };
      let nextTotalXp = current.totalXp;
      let nextQuestBonusAwarded = current.questBonusAwarded;

      if (!nextQuestBonusAwarded && nextQuest.completedHours >= current.quest.targetHours) {
        nextQuest = { ...nextQuest, status: "completed" };
        nextQuestBonusAwarded = true;
        nextTotalXp += current.quest.completionBonusXp;
      }

      return {
        ...current,
        totalXp: nextTotalXp,
        quest: nextQuest,
        questBonusAwarded: nextQuestBonusAwarded,
      };
    });
    setFocusMessage("");
    return true;
  }

  async function saveDailyCheckIn(checkIn: Omit<TrainingCheckIn, "date" | "workoutPlan">) {
    const date = getCurrentDateKey();
    const entry: TrainingCheckIn = {
      ...checkIn,
      date,
      workoutPlan: appState.trainingCheckIns.find((existing) => existing.date === date)?.workoutPlan ?? null,
    };
    setIsSavingCheckIn(true);
    setCheckInMessage("");

    try {
      await saveTrainingCheckIn(authenticatedUser, entry);
    } catch (error) {
      setCheckInMessage(`Could not save check-in: ${(error as Error).message}`);
      setIsSavingCheckIn(false);
      return;
    }

    setAppState((current) => ({
      ...current,
      trainingCheckIns: [
        ...current.trainingCheckIns.filter((checkIn) => checkIn.date !== entry.date),
        entry,
      ].sort((first, second) => first.date.localeCompare(second.date)),
    }));

    setCheckInMessage("Check-in saved.");
    setIsSavingCheckIn(false);
  }

  async function completeWorkout(session: WorkoutSession) {
    setIsSavingWorkout(true);
    setWorkoutMessage("");
    try {
      if (authenticatedUser) {
        await saveWorkoutSession(authenticatedUser, session);
      }
    } catch (error) {
      setWorkoutMessage(`Could not save workout: ${(error as Error).message}`);
      setIsSavingWorkout(false);
      return { saved: false, message: `Could not save workout: ${(error as Error).message}` };
    }

    setAppState((current) => ({
      ...current,
      workoutSessions: [
        session,
        ...current.workoutSessions.filter((existing) => existing.id !== session.id),
      ].sort((first, second) => second.completedAt.localeCompare(first.completedAt)),
    }));

    let message = "Workout saved.";
    if (strengthTask) {
      const awarded = await awardTaskXp(strengthTask);
      message = awarded
        ? `Workout saved. +${strengthTask.xp} Strength XP earned.`
        : "Workout saved, but Strength XP could not be recorded. Retry by logging Strength from Home.";
    }
    setWorkoutMessage(message);
    setIsSavingWorkout(false);
    return { saved: true, message };
  }

  async function startQuest(template: QuestTemplate) {
    try {
      const quest = await startQuestFromTemplate(authenticatedUser, template);
      setAppState((current) => ({
        ...current,
        quest,
        questBonusAwarded: false,
      }));
    } catch (error) {
      setAuthMessage(`Could not start quest: ${(error as Error).message}`);
    }
  }

  async function saveProfile(displayName: string, skatingStartDate: string) {
    try {
      await ensureUserProfile(authenticatedUser, displayName, skatingStartDate);
    } catch (error) {
      setAuthMessage(`Could not save profile: ${(error as Error).message}`);
    }
  }

  const navItems = [
    { label: "Today", href: "/", active: view === "home", icon: <path d="m4 11 8-7 8 7v9h-5v-6H9v6H4z" /> },
    { label: "Train", href: "/workouts", active: view === "workouts", icon: <path d="M6 7v10M18 7v10M3 10v4M21 10v4M6 12h12" /> },
    { label: "Quests", href: "/quests", active: view === "quests", icon: <path d="M5 21V4h12l-2.5 4 2.5 4H5" /> },
    { label: "Me", href: "/settings", active: view === "settings", icon: <><circle cx="12" cy="8" r="4" /><path d="M4 21c1-4 4-6 8-6s7 2 8 6" /></> },
  ];

  return (
    <div className="sm-app min-h-screen text-slate-100">
      <div className="app-content mx-auto">

        {view === "home" && (
          <>
            <header className="app-page-heading">
              <div>
                <p className="app-eyebrow">
                  {new Intl.DateTimeFormat("en", { weekday: "long", day: "numeric", month: "short" }).format(new Date())}
                </p>
                <h1>Hey, {appState.displayName}</h1>
              </div>
              <Link href="/settings" className="app-level-badge" aria-label={`Your profile, level ${levelData.level}`}>
                {levelData.level}
              </Link>
            </header>

            <main className="space-y-6">
              <section className="app-level-card rounded-3xl border border-white/10 bg-[#15171a] p-5">
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <p className="app-eyebrow">Level</p>
                    <div className="mt-1 flex items-baseline gap-2">
                      <span className="app-level-number">{levelData.level}</span>
                      <span className="text-sm font-semibold text-amber-300">{appState.totalXp.toLocaleString()} XP</span>
                    </div>
                  </div>
                  <div className="app-streak-chip">
                    <span aria-hidden="true">🔥</span>
                    {currentStreak} day streak
                  </div>
                </div>
                <div className="mt-5">
                  <ProgressBar percent={levelData.progress} />
                  <div className="mt-2 flex justify-between gap-3 text-xs text-slate-400">
                    <span>{levelData.currentLevelXp.toLocaleString()} / {levelData.xpToNextLevel.toLocaleString()} XP</span>
                    <span>{(levelData.xpToNextLevel - levelData.currentLevelXp).toLocaleString()} to level {levelData.level + 1}</span>
                  </div>
                </div>
                <div className="app-week-strip" aria-label="Last 7 days">
                  {weekDays.map((day) => (
                    <div key={day.key} className={`app-week-day${day.isToday ? " is-today" : ""}`}>
                      <span>{day.label}</span>
                      <span className={`app-week-dot${day.completed ? " is-complete" : ""}`} />
                    </div>
                  ))}
                </div>
              </section>

              <section className="app-today-section">
                <div className="app-section-heading">
                  <h2>Today</h2>
                  <div>
                    <strong>+{todayXp.toLocaleString()} XP</strong>
                    <span>{appState.tasks.filter((task) => appState.completedToday[task.id]).length}/{appState.tasks.length}</span>
                  </div>
                </div>
                <ProgressBar
                  percent={(appState.tasks.filter((task) => appState.completedToday[task.id]).length / appState.tasks.length) * 100}
                />
                <div className="mt-3 space-y-2">
                  {appState.tasks.map((task) => {
                    const isCompleted = Boolean(appState.completedToday[task.id]);
                    const stat = STAT_META[task.stat];

                    return (
                      <button
                        key={task.id}
                        onClick={() => awardTaskXp(task)}
                        disabled={isCompleted}
                        className={`app-task-row flex w-full items-center justify-between rounded-2xl border p-3 text-left transition ${
                          isCompleted
                            ? "is-completed cursor-default"
                            : "hover:border-amber-400/50"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`app-task-icon flex h-11 w-11 items-center justify-center rounded-2xl ${stat.accent}`}>
                            {stat.icon}
                          </div>
                          <div>
                            <p className="font-semibold text-white">{task.name}</p>
                            <p className="text-xs text-slate-400">+{task.xp} XP · {stat.name}</p>
                          </div>
                        </div>
                        <div
                          className={`app-task-check flex h-8 w-8 items-center justify-center rounded-full border text-lg ${
                            isCompleted
                              ? "is-checked"
                              : ""
                          }`}
                        >
                          {isCompleted ? "✓" : ""}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>

              <Link href="/quests" className="app-quest-preview">
                <div className="app-quest-preview-top">
                  <span>Current quest</span>
                  <strong>{Math.round((appState.quest.completedHours / appState.quest.targetHours) * 100)}%</strong>
                </div>
                <h2>{appState.quest.name}</h2>
                <ProgressBar percent={(appState.quest.completedHours / appState.quest.targetHours) * 100} />
                <p>{appState.quest.completedHours} of {appState.quest.targetHours} focused hours · since {appState.quest.startedAt}</p>
              </Link>
            </main>
          </>
        )}

        {view === "stats" && (
          <>
            <header className="app-page-title">
              <p className="app-eyebrow">Daily log</p>
              <h1>Log</h1>
            </header>
            <main className="space-y-6">

            <DailyTrainingCheckIn
              key={`${today}-${todayCheckIn?.kneeScore ?? "empty"}-${todayCheckIn?.energyScore ?? "empty"}`}
              checkIn={todayCheckIn}
              kneeRecoveryFlag={kneeRecoveryFlag}
              saving={isSavingCheckIn}
              statusMessage={checkInMessage}
              weeklySummary={weeklyCheckInSummary}
              onSave={saveDailyCheckIn}
            />

            <section className="rounded-3xl border border-white/10 bg-[#111214] p-5 shadow-xl shadow-black/20">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-amber-300">100-hour focus</p>
                  <h2 className="mt-2 text-xl font-bold text-white">{appState.quest.name}</h2>
                  <p className="mt-1 text-sm text-slate-300">Log only deliberate practice on this principle, separate from total skate time.</p>
                </div>
                <p className="shrink-0 text-sm font-semibold text-amber-200">
                  {appState.quest.completedHours} / {appState.quest.targetHours} focused hours
                </p>
              </div>
              <div className="mt-4">
                <ProgressBar percent={(appState.quest.completedHours / appState.quest.targetHours) * 100} />
              </div>
              <form
                className="mt-4 flex flex-col gap-3 sm:flex-row"
                onSubmit={async (event) => {
                  event.preventDefault();
                  const value = Number(focusedHours);
                  if (!Number.isFinite(value) || value <= 0) {
                    setFocusMessage("Enter focused hours greater than zero.");
                    return;
                  }
                  if (await updateQuestHours(value)) {
                    setFocusedHours("");
                  }
                }}
              >
                <input
                  type="number"
                  min={0.1}
                  step="0.1"
                  value={focusedHours}
                  onChange={(event) => setFocusedHours(event.target.value)}
                  placeholder="e.g. 1.5 focused hours"
                  aria-label="Focused skate practice hours"
                  disabled={appState.quest.status === "completed"}
                  className="w-full rounded-xl border border-white/10 bg-zinc-950 px-4 py-3 text-white outline-none placeholder:text-slate-500 focus:border-amber-400 disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={appState.quest.status === "completed"}
                  className="rounded-xl bg-amber-400 px-5 py-3 font-bold text-zinc-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Log focus
                </button>
              </form>
              {focusMessage && <p role="status" className="mt-3 text-sm text-slate-300">{focusMessage}</p>}
            </section>

            <section className="rounded-3xl border border-white/10 bg-[#111214] p-5 shadow-xl shadow-black/20">
              <h2 className="text-2xl font-black tracking-tight text-white">Level progression</h2>
              <div className="mt-5 space-y-5">
                {statEntries.map(([key, meta]) => {
                  const statXp = appState.statXp[key];
                  const statLevel = getLevelData(statXp);

                  return (
                    <div key={key} className="rounded-2xl border border-white/10 bg-black/15 p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-3">
                          <span className={`flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br ${meta.accent}`}>
                            {meta.icon}
                          </span>
                          <div>
                            <p className="text-xs uppercase tracking-[0.32em] text-slate-400">{meta.name}</p>
                            <p className="text-2xl font-black text-white">Level {statLevel.level}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-sm uppercase tracking-[0.2em] text-slate-400">XP</p>
                          <p className="text-xl font-bold text-amber-200">{statXp.toLocaleString()}</p>
                        </div>
                      </div>
                      <div className="mt-4">
                        <ProgressBar percent={statLevel.progress} />
                      </div>
                      <p className="mt-2 text-sm text-slate-300">
                        {statLevel.currentLevelXp.toLocaleString()} / {statLevel.xpToNextLevel.toLocaleString()} XP to next level
                      </p>
                    </div>
                  );
                })}
              </div>
            </section>
            </main>
          </>
        )}

        {view === "workouts" && (
          <WorkoutTracker
            sessions={appState.workoutSessions}
            saving={isSavingWorkout}
            strengthXp={strengthTask?.xp ?? 0}
            strengthXpAlreadyEarned={Boolean(strengthTask && appState.completedToday[strengthTask.id])}
            statusMessage={workoutMessage}
            onComplete={completeWorkout}
          />
        )}

        {view === "quests" && (
          <>
            <header className="app-page-title">
              <p className="app-eyebrow">Focused practice</p>
              <h1>Quests</h1>
              <p>One deliberate practice project at a time.</p>
            </header>
            <main className="space-y-6">
            <section className="app-active-quest">
              <span className="app-quest-status">
                {appState.quest.status === "completed" ? "Complete" : "In progress"}
              </span>
              <div className="app-quest-ring" role="img" aria-label={`${appState.quest.completedHours} of ${appState.quest.targetHours} focused hours`}>
                <svg viewBox="0 0 168 168" aria-hidden="true">
                  <circle className="app-quest-ring-track" cx="84" cy="84" r="70" />
                  <circle
                    className="app-quest-ring-progress"
                    cx="84"
                    cy="84"
                    r="70"
                    pathLength={100}
                    strokeDasharray={`${Math.min(100, (appState.quest.completedHours / appState.quest.targetHours) * 100)} 100`}
                  />
                </svg>
                <div>
                  <strong>{appState.quest.completedHours}</strong>
                  <span>of {appState.quest.targetHours} h</span>
                </div>
              </div>
              <div className="app-quest-copy">
                <h2>{appState.quest.name}</h2>
                <p>{appState.quest.description}</p>
                <span>Started {appState.quest.startedAt}</span>
              </div>
              <form
                className="app-quest-log-form"
                onSubmit={async (event) => {
                  event.preventDefault();
                  const value = Number(focusedHours);
                  if (!Number.isFinite(value) || value <= 0) {
                    setFocusMessage("Enter focused hours greater than zero.");
                    return;
                  }
                  if (await updateQuestHours(value)) {
                    setFocusedHours("");
                  }
                }}
              >
                  <input
                    type="number"
                    min={0.1}
                    step="0.1"
                    placeholder="1.5 focused hours"
                    aria-label="Focused skate practice hours"
                    value={focusedHours}
                    onChange={(event) => setFocusedHours(event.target.value)}
                    disabled={appState.quest.status === "completed"}
                    className="w-full rounded-xl border border-white/10 bg-zinc-950 px-4 py-3 text-white outline-none ring-0 placeholder:text-slate-500 focus:border-amber-400"
                  />
                  <button
                    type="submit"
                    disabled={appState.quest.status === "completed"}
                    className="app-primary-button"
                  >
                    Log focused hours
                  </button>
              </form>
              {focusMessage && <p role="status" className="text-sm text-slate-300">{focusMessage}</p>}
              {appState.quest.status === "completed" && (
                <p className="app-quest-bonus">+{appState.quest.completionBonusXp} XP completion bonus awarded.</p>
              )}
            </section>

            <section className="rounded-3xl border border-white/10 bg-[#111214] p-5 shadow-xl shadow-black/20">
              <h2 className="text-2xl font-black tracking-tight text-white">Quest Templates</h2>
              <p className="mt-2 text-sm text-slate-300">
                Choose one deliberate practice project to make your current quest.
              </p>
              <div className="mt-5 grid gap-3 md:grid-cols-2">
                {appState.questTemplates.map((template) => (
                  <div key={template.id} className="rounded-2xl border border-white/10 bg-black/15 p-4">
                    <p className="text-lg font-bold text-white">{template.name}</p>
                    <p className="mt-2 text-sm text-slate-300">{template.description}</p>
                    <button
                      type="button"
                      onClick={() => void startQuest(template)}
                      className="mt-4 rounded-xl border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-sm font-bold text-amber-200 transition hover:bg-amber-400/20"
                    >
                      Start this quest
                    </button>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-3xl border border-white/10 bg-[#111214] p-5 shadow-xl shadow-black/20">
              <h2 className="text-2xl font-black tracking-tight text-white">Past Quests</h2>
              <div className="mt-5 space-y-3">
                {DEFAULT_MILESTONES.slice(0, 3).map((milestone) => (
                  <div key={milestone.id} className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/15 p-4">
                    <div>
                      <p className="text-lg font-bold text-white">{milestone.name}</p>
                      <p className="text-sm text-slate-300">{milestone.description}</p>
                    </div>
                    <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs uppercase tracking-[0.2em] text-slate-300">
                      {milestone.unlocked ? "unlocked" : "locked"}
                    </span>
                  </div>
                ))}
              </div>
            </section>
            </main>
          </>
        )}

        {view === "settings" && (
          <>
            <header className="app-page-title">
              <p className="app-eyebrow">Your progress</p>
              <h1>Me</h1>
            </header>
            <main className="space-y-6">
            <section>
              <div className="app-me-metrics">
                <div className="app-me-metric">
                  <strong>{appState.totalSkateHours.toFixed(1)}</strong>
                  <span>Skate hours</span>
                </div>
                <div className="app-me-metric">
                  <strong className="text-orange-300">{currentStreak}</strong>
                  <span>Day streak</span>
                </div>
                <div className="app-me-metric">
                  <strong>Yr {skatingYear}</strong>
                  <span>Of skating</span>
                </div>
              </div>
              <div className="mt-5">
                <div className="mb-3 flex items-baseline justify-between gap-2">
                  <h2 className="text-lg font-bold text-white">10-year journey</h2>
                  <span className="text-xs text-slate-400">Since {appState.skatingStartDate}</span>
                </div>
                <div className="grid grid-cols-10 gap-1" role="img" aria-label={`Year ${skatingYear} of 10`}>
                  {Array.from({ length: 10 }, (_, index) => (
                    <span
                      key={index}
                      className={`h-7 rounded-md ${index + 1 < skatingYear ? "bg-amber-400" : index + 1 === skatingYear ? "border-2 border-amber-400 bg-amber-400/15" : "bg-[#262a2f]"}`}
                    />
                  ))}
                </div>
                <div className="mt-2 flex justify-between text-xs text-slate-500">
                  <span>{new Date(`${appState.skatingStartDate}T00:00:00`).getFullYear()}</span>
                  <span className="font-semibold text-amber-300">You are here</span>
                  <span>{new Date(`${appState.skatingStartDate}T00:00:00`).getFullYear() + 10}</span>
                </div>
              </div>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-bold text-white">Character</h2>
              <div className="app-character-grid">
                {statEntries.map(([key, meta]) => {
                  const statXp = appState.statXp[key];
                  const statLevel = getLevelData(statXp);

                  return (
                    <div key={key} className="app-character-stat">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold uppercase tracking-[0.1em] text-amber-300">{meta.name}</span>
                        <strong className="text-white">{statLevel.level}</strong>
                      </div>
                      <ProgressBar percent={statLevel.progress} />
                      <span>{statXp.toLocaleString()} XP</span>
                    </div>
                  );
                })}
              </div>
              <Link href="/stats" className="app-profile-link">Daily check-in and detailed progression →</Link>
            </section>

            <section className="rounded-3xl border border-white/10 bg-[#111214] p-5 shadow-xl shadow-black/20">
              <h2 className="text-2xl font-black tracking-tight text-white">Settings</h2>
              <div className="mt-5 space-y-5">
                <div>
                  <label className="mb-2 block text-sm font-medium uppercase tracking-[0.2em] text-slate-400">
                    Display name
                  </label>
                  <input
                    value={appState.displayName}
                    onChange={(event) => {
                      const displayName = event.target.value;
                      setAppState((current) => ({ ...current, displayName }));
                      void saveProfile(displayName, appState.skatingStartDate);
                    }}
                    className="w-full rounded-2xl border border-white/10 bg-zinc-950 px-4 py-3 text-white outline-none focus:border-amber-400"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium uppercase tracking-[0.2em] text-slate-400">
                    Started skating
                  </label>
                  <input
                    type="date"
                    value={appState.skatingStartDate}
                    onChange={(event) => {
                      const skatingStartDate = event.target.value;
                      setAppState((current) => ({ ...current, skatingStartDate }));
                      void saveProfile(appState.displayName, skatingStartDate);
                    }}
                    className="w-full rounded-2xl border border-white/10 bg-zinc-950 px-4 py-3 text-white outline-none focus:border-amber-400"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium uppercase tracking-[0.2em] text-slate-400">
                    Daily task configuration
                  </label>
                  <div className="space-y-3">
                    {appState.tasks.map((task) => (
                      <div key={task.id} className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/15 p-3">
                        <div>
                          <p className="font-semibold text-white">{task.name}</p>
                          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">{STAT_META[task.stat].name}</p>
                        </div>
                        <input
                          type="number"
                          min={50}
                          step={50}
                          value={task.xp}
                          onChange={(event) => {
                            const value = Number(event.target.value);
                            if (!Number.isFinite(value)) {
                              return;
                            }

                            setAppState((current) => ({
                              ...current,
                              tasks: current.tasks.map((currentTask) =>
                                currentTask.id === task.id ? { ...currentTask, xp: value } : currentTask,
                              ),
                            }));
                          }}
                          className="w-24 rounded-xl border border-white/10 bg-zinc-950 px-3 py-2 text-right text-white outline-none focus:border-amber-400"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>
            </main>
          </>
        )}

        <nav className="app-tab-bar" aria-label="Main">
          {navItems.slice(0, 2).map((item) => (
            <Link
              key={item.label}
              href={item.href}
              aria-current={item.active ? "page" : undefined}
              className="app-tab-link"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                {item.icon}
              </svg>
              {item.label}
            </Link>
          ))}
          <Link
            href="/stats"
            className="app-log-button"
            aria-label="Log today's training"
            aria-current={view === "stats" ? "page" : undefined}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </Link>
          {navItems.slice(2).map((item) => (
            <Link
              key={item.label}
              href={item.href}
              aria-current={item.active ? "page" : undefined}
              className="app-tab-link"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                {item.icon}
              </svg>
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}
