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
import type { AppState } from "@/lib/state-types";
import { completeTask, ensureUserProfile, loadUserState, logQuestHours } from "@/lib/persistence";
import { getSupabaseClient, getSupabaseConfigurationError } from "@/lib/supabase";

type AppView = "home" | "stats" | "quests" | "settings";

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
    };
  } catch {
    return buildDefaultState();
  }
}

function ProgressBar({ percent }: { percent: number }) {
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-white/10">
      <div
        className="h-full rounded-full bg-gradient-to-r from-amber-300 via-orange-400 to-red-500 transition-all duration-500"
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
  const [authMessage, setAuthMessage] = useState("");
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
        setAuthMessage(`Could not load your Supabase data: ${error.message}`);
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
          <h1 className="mt-3 text-3xl font-black text-white">Sign in to save your progression</h1>
          <p className="mt-3 text-sm leading-6 text-slate-300">
            We will email you a secure magic link. No password required.
          </p>
          <form
            className="mt-6 space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (!supabaseClient || !authEmail.trim()) return;
              setAuthMessage("");
              void supabaseClient.auth
                .signInWithOtp({ email: authEmail.trim(), options: { emailRedirectTo: window.location.origin } })
                .then(({ error }) => {
                  setAuthMessage(error ? error.message : "Check your email for the sign-in link.");
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
            <button className="w-full rounded-2xl bg-amber-400 px-5 py-3 font-bold text-zinc-950 transition hover:bg-amber-300">
              Email me a sign-in link
            </button>
          </form>
          {authMessage && <p className="mt-4 text-sm text-amber-100">{authMessage}</p>}
        </div>
      </div>
    );
  }

  const authenticatedUser = user;
  const statEntries = Object.entries(STAT_META) as [StatKey, (typeof STAT_META)[StatKey]][];

  async function awardTaskXp(task: Task) {
    try {
      await completeTask(authenticatedUser, task.id, getCurrentDateKey());
    } catch (error) {
      setAuthMessage(`Could not save task completion: ${(error as Error).message}`);
      return;
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
  }

  async function updateQuestHours(hoursToAdd: number) {
    try {
      await logQuestHours(authenticatedUser, appState.quest.id, hoursToAdd);
    } catch (error) {
      setAuthMessage(`Could not save quest hours: ${(error as Error).message}`);
      return;
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
        totalSkateHours: Number((current.totalSkateHours + hoursToAdd).toFixed(1)),
      };
    });
  }

  async function saveProfile(displayName: string, skatingStartDate: string) {
    try {
      await ensureUserProfile(authenticatedUser, displayName, skatingStartDate);
    } catch (error) {
      setAuthMessage(`Could not save profile: ${(error as Error).message}`);
    }
  }

  const navItems = [
    { label: "Home", href: "/", active: view === "home" },
    { label: "Stats", href: "/stats", active: view === "stats" },
    { label: "Quests", href: "/quests", active: view === "quests" },
    { label: "Settings", href: "/settings", active: view === "settings" },
  ];

  return (
    <div className="min-h-screen bg-[#0b0b0c] text-slate-100">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        <header className="mb-6 rounded-2xl border border-white/10 bg-white/5 p-4 shadow-2xl shadow-black/20 backdrop-blur-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.38em] text-amber-300">Skate Mastery</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-white sm:text-4xl">
                {appState.displayName}
              </h1>
            </div>
            <div className="flex flex-wrap gap-2">
              {navItems.map((item) => (
                <Link
                  key={item.label}
                  href={item.href}
                  className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                    item.active
                      ? "border-amber-400/70 bg-amber-400/15 text-amber-200"
                      : "border-white/10 bg-black/20 text-slate-300 hover:border-white/20 hover:text-white"
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
        </header>

        {view === "home" && (
          <main className="space-y-6">
            <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-zinc-900 via-zinc-950 to-zinc-900 p-5 shadow-xl shadow-black/30">
              <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.35em] text-slate-400">Level {levelData.level}</p>
                  <div className="mt-2 flex items-baseline gap-3">
                    <span className="text-5xl font-black tracking-tight text-white sm:text-6xl">
                      {levelData.level}
                    </span>
                    <span className="text-xl font-semibold text-amber-300">
                      {appState.totalXp.toLocaleString()} XP
                    </span>
                  </div>
                  <div className="mt-4 max-w-md">
                    <ProgressBar percent={levelData.progress} />
                  </div>
                  <p className="mt-3 text-sm text-slate-300">
                    {levelData.currentLevelXp.toLocaleString()} / {levelData.xpToNextLevel.toLocaleString()} XP to next level
                  </p>
                </div>

                <div className="rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4 text-left md:min-w-72">
                  <p className="text-xs uppercase tracking-[0.3em] text-amber-200">Today</p>
                  <p className="mt-2 text-3xl font-black text-amber-100">{todayXp.toLocaleString()} XP</p>
                </div>
              </div>
            </section>

            <div className="grid gap-6 xl:grid-cols-[1.4fr_0.9fr]">
              <section className="rounded-3xl border border-white/10 bg-[#111214] p-5 shadow-xl shadow-black/20">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-xl font-bold tracking-tight text-white">Today</h2>
                  <span className="rounded-full border border-emerald-500/30 bg-emerald-400/10 px-2.5 py-1 text-xs font-medium tracking-[0.18em] text-emerald-200">
                    {appState.tasks.filter((task) => appState.completedToday[task.id]).length}/{appState.tasks.length}
                  </span>
                </div>
                <div className="space-y-3">
                  {appState.tasks.map((task) => {
                    const isCompleted = Boolean(appState.completedToday[task.id]);
                    const stat = STAT_META[task.stat];

                    return (
                      <button
                        key={task.id}
                        onClick={() => awardTaskXp(task)}
                        disabled={isCompleted}
                        className={`flex w-full items-center justify-between rounded-2xl border p-3 text-left transition ${
                          isCompleted
                            ? "cursor-default border-emerald-500/30 bg-emerald-500/10"
                            : "border-white/10 bg-black/20 hover:border-amber-400/50 hover:bg-white/5"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`flex h-7 w-7 items-center justify-center rounded-xl bg-gradient-to-br ${stat.accent}`}>
                            {stat.icon}
                          </div>
                          <div>
                            <p className="font-semibold text-white">{task.name}</p>
                            <p className="text-xs text-slate-400">+{task.xp} XP · {stat.name}</p>
                          </div>
                        </div>
                        <div
                          className={`flex h-7 w-7 items-center justify-center rounded-full border text-lg ${
                            isCompleted
                              ? "border-emerald-500 bg-emerald-500 text-zinc-950"
                              : "border-white/20 text-slate-500"
                          }`}
                        >
                          {isCompleted ? "✓" : "□"}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>

              <aside className="space-y-6">
                <section className="rounded-3xl border border-white/10 bg-[#111214] p-5 shadow-xl shadow-black/20">
                  <h2 className="text-xl font-bold tracking-tight text-white">Character</h2>
                  <div className="mt-4 space-y-4">
                    {statEntries.map(([key, meta]) => {
                      const statXp = appState.statXp[key];
                      const statLevel = getLevelData(statXp);

                      return (
                        <div key={key} className="rounded-2xl border border-white/10 bg-black/15 p-3">
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                              <span className={`flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br ${meta.accent}`}>
                                {meta.icon}
                              </span>
                              <div>
                                <p className="text-xs uppercase tracking-[0.28em] text-slate-400">{meta.name}</p>
                                <p className="text-lg font-bold text-white">Lv {statLevel.level}</p>
                              </div>
                            </div>
                            <span className="text-sm font-medium text-amber-200">{statXp.toLocaleString()} XP</span>
                          </div>
                          <div className="mt-3">
                            <ProgressBar percent={statLevel.progress} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>

                <section className="rounded-3xl border border-white/10 bg-[#111214] p-5 shadow-xl shadow-black/20">
                  <h2 className="text-xl font-bold tracking-tight text-white">Current Quest</h2>
                  <div className="mt-4 rounded-2xl border border-white/10 bg-black/15 p-4">
                    <p className="text-xs uppercase tracking-[0.32em] text-slate-400">{appState.quest.status === "completed" ? "Completed" : "In progress"}</p>
                    <h3 className="mt-2 text-2xl font-black text-white">{appState.quest.name}</h3>
                    <p className="mt-2 text-sm text-slate-300">{appState.quest.description}</p>
                    <div className="mt-4">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-sm font-medium text-slate-300">
                          {appState.quest.completedHours} / {appState.quest.targetHours} hours
                        </span>
                        <span className="text-sm text-amber-200">{Math.round((appState.quest.completedHours / appState.quest.targetHours) * 100)}%</span>
                      </div>
                      <ProgressBar percent={(appState.quest.completedHours / appState.quest.targetHours) * 100} />
                    </div>
                    <div className="mt-4 flex items-center justify-between text-xs uppercase tracking-[0.2em] text-slate-400">
                      <span>Started</span>
                      <span>{appState.quest.startedAt}</span>
                    </div>
                  </div>
                </section>
              </aside>
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
              <section className="rounded-3xl border border-white/10 bg-[#111214] p-5 shadow-xl shadow-black/20">
                <h2 className="text-xl font-bold text-white">Streak</h2>
                <div className="mt-4 flex items-center gap-3">
                  <span className="text-4xl">🔥</span>
                  <p className="text-3xl font-black text-amber-200">{currentStreak} DAYS</p>
                </div>
              </section>

              <section className="rounded-3xl border border-white/10 bg-[#111214] p-5 shadow-xl shadow-black/20">
                <h2 className="text-xl font-bold text-white">Total Skating</h2>
                <div className="mt-4 flex items-end gap-2">
                  <span className="text-3xl font-black text-white">{appState.totalSkateHours.toFixed(1)}</span>
                  <span className="pb-1 text-sm uppercase tracking-[0.2em] text-slate-400">hours</span>
                </div>
              </section>

              <section className="rounded-3xl border border-white/10 bg-[#111214] p-5 shadow-xl shadow-black/20">
                <h2 className="text-xl font-bold text-white">10-Year Journey</h2>
                <div className="mt-4">
                  <p className="text-lg font-bold text-amber-200">Year {skatingYear}</p>
                  <p className="mt-2 text-sm text-slate-300">Current skating year based on {appState.skatingStartDate}</p>
                </div>
              </section>
            </div>
          </main>
        )}

        {view === "stats" && (
          <main className="space-y-6">
            <section className="rounded-3xl border border-white/10 bg-[#111214] p-5 shadow-xl shadow-black/20">
              <h2 className="text-2xl font-black tracking-tight text-white">Stats</h2>
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
        )}

        {view === "quests" && (
          <main className="space-y-6">
            <section className="rounded-3xl border border-white/10 bg-[#111214] p-5 shadow-xl shadow-black/20">
              <div className="flex items-center justify-between gap-4">
                <h2 className="text-2xl font-black tracking-tight text-white">Current Quest</h2>
                <Link href="/" className="text-sm font-medium text-amber-200 hover:text-amber-100">
                  Back to home
                </Link>
              </div>

              <div className="mt-5 rounded-2xl border border-white/10 bg-black/15 p-5">
                <p className="text-xs uppercase tracking-[0.32em] text-slate-400">{appState.quest.status === "completed" ? "Complete" : "Active"}</p>
                <h3 className="mt-3 text-3xl font-black text-white">{appState.quest.name}</h3>
                <p className="mt-2 text-slate-300">{appState.quest.description}</p>
                <div className="mt-4">
                  <div className="mb-2 flex items-center justify-between text-sm text-slate-300">
                    <span>{appState.quest.completedHours} / {appState.quest.targetHours} hours</span>
                    <span>{Math.round((appState.quest.completedHours / appState.quest.targetHours) * 100)}%</span>
                  </div>
                  <ProgressBar percent={(appState.quest.completedHours / appState.quest.targetHours) * 100} />
                </div>
                <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                  <input
                    type="number"
                    min={0.1}
                    step="0.1"
                    placeholder="1.5 hours"
                    className="w-full rounded-xl border border-white/10 bg-zinc-950 px-4 py-3 text-white outline-none ring-0 placeholder:text-slate-500 focus:border-amber-400"
                    id="quest-hours"
                  />
                  <button
                    onClick={() => {
                      const input = document.getElementById("quest-hours") as HTMLInputElement | null;
                      const value = Number(input?.value ?? "0");
                      if (!Number.isFinite(value) || value <= 0) {
                        return;
                      }

                      updateQuestHours(value);
                      if (input) {
                        input.value = "";
                      }
                    }}
                    className="rounded-xl bg-amber-400 px-5 py-3 font-bold text-zinc-950 transition hover:bg-amber-300"
                  >
                    Log hours
                  </button>
                </div>

                {appState.quest.status === "completed" && (
                  <div className="mt-4 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-100">
                    +{appState.quest.completionBonusXp} XP completion bonus awarded.
                  </div>
                )}
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
        )}

        {view === "settings" && (
          <main className="space-y-6">
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
        )}
      </div>
    </div>
  );
}
