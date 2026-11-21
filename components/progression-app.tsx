"use client";

import {
  Archive,
  ArrowUpRight,
  BadgeCheck,
  Camera,
  Check,
  ChevronDown,
  ChevronUp,
  CircleCheck,
  Footprints,
  House,
  LockKeyhole,
  LogOut,
  Network,
  Plus,
  RotateCcw,
  Sparkles,
  Timer,
  Trophy,
  X,
} from "lucide-react";
import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import { useCallback, useEffect, useMemo, useState } from "react";
import BaselineAssessment from "@/components/baseline-assessment";
import type { BaselineSubmission } from "@/components/baseline-assessment";
import DashboardHome from "@/components/dashboard-home";
import {
  addVaultEntry,
  completeDashboardTask as saveDashboardTaskCompletion,
  completeProgressionBaseline,
  createTrainingCycle,
  deleteVaultEntry,
  eligibleProgress,
  getProgressionError,
  getTrickLabel,
  loadDashboardState,
  loadProgressionSnapshot,
  logProgressionSession,
  recordProgressionMake,
  recordProgressionMiss,
  replaceTrainingCycleSlot,
  setMicroSkillBenchmark,
  updateVaultConsistency,
} from "@/lib/progression";
import { getCurrentStreak } from "@/lib/game";
import type { Task } from "@/lib/game";
import type { DashboardState } from "@/lib/progression";
import type {
  MicroSkill,
  ProgressionSnapshot,
  QuestSlot,
  Stance,
  TrainingCycle,
  TrickCategory,
  Trick,
  TrickProgress,
} from "@/lib/progression";
import {
  getProgressionSupabaseClient,
  getProgressionSupabaseConfigurationError,
} from "@/lib/progression-supabase";

type Tab = "Today" | "Skill Tree" | "Micro-Skills" | "Vault";
type SlotPicks = Record<QuestSlot, string>;

const TABS: { label: Tab; icon: typeof House }[] = [
  { label: "Today", icon: House },
  { label: "Skill Tree", icon: Network },
  { label: "Micro-Skills", icon: Sparkles },
  { label: "Vault", icon: Archive },
];

const SLOT_NAMES: Record<QuestSlot, string> = {
  A: "Flat / Gaps",
  B: "Ledges",
  C: "Rails",
  D: "Weak Stance",
};

const STANCES: Stance[] = ["Regular", "Fakie", "Nollie", "Switch"];
const TIER_GUIDES = {
  flat_gap: ["Fast Flat", "2-Stair / 1-Deck", "4-Stair / 2-Deck", "6-Stair / 3-Deck", "8-Stair / Waist Gap", "10+ Stair"],
  ledge: ["Curb / 6\" Manny Pad", "Shin Ledge (12-14\")", "Knee Ledge (16-18\")", "Mid-Thigh Ledge (20-24\")", "Hip Ledge (26-30\")", "Chest / Kink / Tech Ledge"],
  rail: ["Floor Bar / Parking Block", "Knee Flat Bar (14-16\")", "Thigh Flat Bar (18-20\")", "Small Down-Rail (3-4 Stair) / Low Hubba", "Medium Down-Rail (6-7 Stair) / Steep Hubba", "Full Handrail (8-10+ Stair)"],
};

function localDateKey(date = new Date()) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function getCycleDay(cycle: TrainingCycle) {
  const today = new Date(`${localDateKey()}T00:00:00`);
  const start = new Date(`${cycle.start_date}T00:00:00`);
  return Math.min(14, Math.max(1, Math.floor((today.getTime() - start.getTime()) / 86400000) + 1));
}

function getTrickName(trick: Trick | undefined) {
  if (!trick) return "Trick unavailable";
  return `${trick.direction === "none" ? "" : `${trick.direction} `}${trick.name}`;
}

function getSkillById(snapshot: ProgressionSnapshot, id: string | null | undefined) {
  return snapshot.microSkills.find((skill) => skill.id === id);
}

function getTrickById(snapshot: ProgressionSnapshot, id: string | undefined) {
  return snapshot.tricks.find((trick) => trick.id === id);
}

function formatHours(minutes: number) {
  return `${(minutes / 60).toFixed(1)} / 100 hrs`;
}

export default function ProgressionApp({
  showDashboardHome = false,
  openBaseline = false,
}: {
  showDashboardHome?: boolean;
  openBaseline?: boolean;
}) {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(() => !getProgressionSupabaseClient());
  const [snapshot, setSnapshot] = useState<ProgressionSnapshot | null>(null);
  const [snapshotUserId, setSnapshotUserId] = useState<string | null>(null);
  const [dashboardSnapshot, setDashboardSnapshot] = useState<DashboardState | null>(null);
  const [dashboardSnapshotUserId, setDashboardSnapshotUserId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("Today");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [createAccount, setCreateAccount] = useState(false);
  const [authMessage, setAuthMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [cycleSetupOpen, setCycleSetupOpen] = useState(false);
  const [baselineOpen, setBaselineOpen] = useState(openBaseline);
  const [slotPicker, setSlotPicker] = useState<QuestSlot | null>(null);
  const [toast, setToast] = useState("");
  const [qualityConfirmed, setQualityConfirmed] = useState<Record<string, boolean>>({});
  const [sessionGuideOpen, setSessionGuideOpen] = useState(false);
  const [sessionModalOpen, setSessionModalOpen] = useState(false);
  const [sessionMinutes, setSessionMinutes] = useState(90);
  const [sessionType, setSessionType] = useState("technical_low");
  const [sessionFilmed, setSessionFilmed] = useState(false);
  const [sessionQuestWork, setSessionQuestWork] = useState(true);
  const [sessionNotes, setSessionNotes] = useState("");
  const [selectedMicroSkill, setSelectedMicroSkill] = useState("");
  const [slotPicks, setSlotPicks] = useState<SlotPicks>({ A: "", B: "", C: "", D: "" });
  const [categoryFilter, setCategoryFilter] = useState<TrickCategory>("flat_gap");
  const [stanceFilter, setStanceFilter] = useState<"all" | Stance>("all");
  const [vaultName, setVaultName] = useState("");
  const [vaultObstacle, setVaultObstacle] = useState("");
  const [vaultParents, setVaultParents] = useState("");
  const [vaultDate, setVaultDate] = useState(localDateKey());

  const supabaseClient = getProgressionSupabaseClient();
  const configurationError = getProgressionSupabaseConfigurationError();
  const loading = Boolean(!showDashboardHome && user && snapshotUserId !== user.id);
  const dashboardLoading = Boolean(showDashboardHome && user && dashboardSnapshotUserId !== user.id);

  const refreshSnapshot = useCallback(async (userId: string) => {
    const next = await loadProgressionSnapshot(userId);
    setSnapshot(next);
    setSnapshotUserId(userId);
    return next;
  }, []);

  useEffect(() => {
    if (!supabaseClient) return;

    let active = true;
    void supabaseClient.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) setAuthMessage(error.message);
      const nextUser = data.session?.user ?? null;
      setSnapshotUserId((current) => current === nextUser?.id ? current : null);
      setDashboardSnapshotUserId((current) => current === nextUser?.id ? current : null);
      setUser((current) => current?.id === nextUser?.id ? current : nextUser);
      setAuthReady(true);
    }).catch((error: unknown) => {
      if (!active) return;
      setAuthMessage(getProgressionError(error));
      setAuthReady(true);
    });
    const { data: subscription } = supabaseClient.auth.onAuthStateChange((event, session) => {
      const nextUser = session?.user ?? null;
      setSnapshotUserId((current) => current === nextUser?.id ? current : null);
      setDashboardSnapshotUserId((current) => current === nextUser?.id ? current : null);
      setUser((current) => current?.id === nextUser?.id ? current : nextUser);
      if (event === "SIGNED_OUT") {
        setSnapshot(null);
        setDashboardSnapshot(null);
        setCycleSetupOpen(false);
        setSlotPicker(null);
        setSelectedMicroSkill("");
        setSlotPicks({ A: "", B: "", C: "", D: "" });
      }
      setAuthReady(true);
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, [supabaseClient]);

  const userId = user?.id;
  useEffect(() => {
    if (!userId || showDashboardHome) return;

    let active = true;
    void loadProgressionSnapshot(userId)
      .then((next) => {
        if (!active) return;
        setSnapshot(next);
        setSnapshotUserId(userId);
      })
      .catch((error: unknown) => {
        if (active) setErrorMessage(getProgressionError(error));
      });

    return () => {
      active = false;
    };
  }, [showDashboardHome, userId]);

  useEffect(() => {
    if (!showDashboardHome || !user || dashboardSnapshotUserId === user.id) return;

    let active = true;
    void loadDashboardState(user.id, user.email)
      .then((next) => {
        if (!active) return;
        setDashboardSnapshot(next);
        setDashboardSnapshotUserId(user.id);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setDashboardSnapshotUserId(user.id);
        setErrorMessage(getProgressionError(error));
      });

    return () => {
      active = false;
    };
  }, [dashboardSnapshotUserId, showDashboardHome, user]);

  const activeCycle = useMemo(() => {
    if (!snapshot?.cycle || snapshot.cycle.end_date < localDateKey()) return null;
    return snapshot.cycle;
  }, [snapshot]);

  const activeSkill = getSkillById(snapshot ?? emptySnapshot, activeCycle?.active_micro_skill_id);
  const trickMap = useMemo(
    () => new Map((snapshot?.tricks ?? []).map((trick) => [trick.id, trick])),
    [snapshot?.tricks],
  );
  const progressMap = useMemo(
    () => new Map((snapshot?.progress ?? []).map((progress) => [progress.id, progress])),
    [snapshot?.progress],
  );

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const runAction = useCallback(
    async (action: () => Promise<void>, successMessage?: string) => {
      setBusy(true);
      setErrorMessage("");
      try {
        await action();
        if (user) await refreshSnapshot(user.id);
        if (successMessage) setToast(successMessage);
      } catch (error) {
        setErrorMessage(getProgressionError(error));
      } finally {
        setBusy(false);
      }
    },
    [refreshSnapshot, user],
  );

  async function submitBaseline(input: BaselineSubmission) {
    setBusy(true);
    setErrorMessage("");
    try {
      await completeProgressionBaseline(input);
      if (user) await refreshSnapshot(user.id);
      setBaselineOpen(false);
      setCycleSetupOpen(true);
      window.history.replaceState(window.history.state, "", "/progress");
      setToast("Baseline saved. Pick your cycle.");
    } catch (error) {
      setErrorMessage(getProgressionError(error));
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    if (!supabaseClient) return;
    setBusy(true);
    setErrorMessage("");
    try {
      const { error } = await supabaseClient.auth.signOut();
      if (error) throw new Error(error.message);
    } catch (error) {
      setErrorMessage(getProgressionError(error));
    } finally {
      setBusy(false);
    }
  }

  const openCycleSetup = () => {
    if (!snapshot) return;
    const firstSkill = [...snapshot.microSkills].sort((a, b) => a.logged_minutes - b.logged_minutes)[0];
    const aCandidates = eligibleProgress(snapshot, "A");
    const aId = aCandidates[0]?.id ?? "";
    const bCandidates = eligibleProgress(snapshot, "B", aId ? [aId] : []);
    const bId = bCandidates[0]?.id ?? "";
    const cCandidates = eligibleProgress(snapshot, "C", [aId, bId].filter(Boolean));
    const cId = cCandidates[0]?.id ?? "";
    const dCandidates = eligibleProgress(snapshot, "D", [aId, bId, cId].filter(Boolean));
    setSelectedMicroSkill(firstSkill?.id ?? "");
    setSlotPicks({ A: aId, B: bId, C: cId, D: dCandidates[0]?.id ?? "" });
    setCycleSetupOpen(true);
  };

  async function submitCycleSetup(picks = {
    activeMicroSkillId: selectedMicroSkill,
    slotAProgressId: slotPicks.A,
    slotBProgressId: slotPicks.B,
    slotCProgressId: slotPicks.C,
    slotDProgressId: slotPicks.D,
  }) {
    if (!snapshot || !picks.activeMicroSkillId || !picks.slotAProgressId || !picks.slotBProgressId || !picks.slotCProgressId || !picks.slotDProgressId) return;
    await runAction(async () => {
      await createTrainingCycle(picks);
      setCycleSetupOpen(false);
    }, "Your 2-week cycle is locked in.");
  }

  async function handleDashboardTaskCompletion(task: Task) {
    if (!user) return;
    setBusy(true);
    setErrorMessage("");
    try {
      await saveDashboardTaskCompletion(user.id, task.id, localDateKey());
      const next = await loadDashboardState(user.id, user.email);
      setDashboardSnapshot(next);
      setDashboardSnapshotUserId(user.id);
    } catch (error) {
      setErrorMessage(getProgressionError(error));
    } finally {
      setBusy(false);
    }
  }

  async function chooseNextQuest(slot: QuestSlot, progressId: string) {
    if (!activeCycle) return;
    await runAction(async () => {
      await replaceTrainingCycleSlot(activeCycle.id, slot, progressId);
      setSlotPicker(null);
      setQualityConfirmed({});
    }, `${SLOT_NAMES[slot]} trick updated.`);
  }

  async function logMake(progress: TrickProgress, slot: QuestSlot) {
    if (!activeCycle) {
      return;
    }

    setBusy(true);
    setErrorMessage("");
    try {
      const clean = Boolean(qualityConfirmed[progress.id]);
      const result = await recordProgressionMake(activeCycle.id, progress.id, clean);
      if (user) await refreshSnapshot(user.id);
      setQualityConfirmed((current) => ({ ...current, [progress.id]: false }));
      if (result.score === 3) {
        if (user) await saveDashboardTaskCompletion(user.id, "skate", localDateKey());
        const trick = getTrickById(snapshot ?? emptySnapshot, progress.trick_id);
        setToast(`${getTrickName(trick)} mastered. Three clean makes!`);
        setSlotPicker(slot);
      } else {
        setToast(clean
          ? `Clean make logged · ${result.consecutive_makes} in a row`
          : "Make logged · check the active cue to build a mastery streak.");
      }
    } catch (error) {
      setErrorMessage(getProgressionError(error));
    } finally {
      setBusy(false);
    }
  }

  async function submitSession(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!Number.isInteger(sessionMinutes) || sessionMinutes < 1 || sessionMinutes > 600) {
      setErrorMessage("Session duration must be between 1 and 600 minutes.");
      return;
    }
    await runAction(async () => {
      await logProgressionSession({
        durationMinutes: sessionMinutes,
        sessionType,
        filmedDiagnostic: sessionFilmed,
        activeQuestWork: sessionQuestWork,
        notes: sessionNotes,
      });
      if (user) await saveDashboardTaskCompletion(user.id, "skate", localDateKey());
      setSessionModalOpen(false);
      setSessionFilmed(false);
      setSessionNotes("");
    }, "Session logged · micro-skill XP added.");
  }

  async function submitVaultEntry(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;
    if (!vaultName.trim()) {
      setErrorMessage("Enter a name for your signature trick.");
      return;
    }
    await runAction(async () => {
      await addVaultEntry({
        userId: user.id,
        trickName: vaultName,
        obstacle: vaultObstacle,
        parentTricks: vaultParents,
        firstLandedAt: vaultDate,
      });
      setVaultName("");
      setVaultObstacle("");
      setVaultParents("");
    }, "Added to your signature vault.");
  }

  async function toggleMicroSkillBenchmark(skill: MicroSkill) {
    await runAction(
      async () => {
        await setMicroSkillBenchmark(skill.id, !skill.benchmark_passed);
        if (!skill.benchmark_passed && user) {
          await saveDashboardTaskCompletion(user.id, "skate", localDateKey());
        }
      },
      skill.benchmark_passed ? "Benchmark marked in progress." : "Benchmark passed. Nice work.",
    );
  }

  const filmedThisWeek = snapshot?.sessions.filter((session) => session.filmed_diagnostic).length ?? 0;
  const loggedSessionThisWeek = snapshot?.sessions.length ?? 0;

  if (!authReady) {
    return <LoadingScreen />;
  }

  if (configurationError) {
    return (
      <main className="progression-app progression-auth-shell">
        <section className="progression-auth-card">
          <div className="progression-brand-mark"><Footprints size={22} /></div>
          <p className="progression-eyebrow">Skate / Progress</p>
          <h1>Connect your training data</h1>
          <p>{configurationError}</p>
          <p className="progression-auth-hint">Add your Supabase project URL and anon key to <code>.env.local</code>, then apply <code>supabase/skate-progression.sql</code>.</p>
        </section>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="progression-app progression-auth-shell">
        <section className="progression-auth-card">
          <div className="progression-brand-mark"><Footprints size={22} /></div>
          <p className="progression-eyebrow">Skate / Progress</p>
          <h1>{createAccount ? "Build your progression" : "Back to the session"}</h1>
          <p>Five years of purposeful reps, one clean make at a time.</p>
          <form
            className="progression-stack"
            onSubmit={(event) => {
              event.preventDefault();
              if (!supabaseClient) return;
              setBusy(true);
              setAuthMessage("");
              const request = createAccount
                ? supabaseClient.auth.signUp({ email: authEmail.trim(), password: authPassword })
                : supabaseClient.auth.signInWithPassword({ email: authEmail.trim(), password: authPassword });
              void request.then(({ data, error }) => {
                if (error) setAuthMessage(error.message);
                else if (createAccount && !data.session) {
                  setAuthMessage("Account created. Check your email, then sign in to start your first cycle.");
                } else {
                  setAuthMessage("Signed in. Loading your progression...");
                }
              }).catch((error: unknown) => {
                setAuthMessage(getProgressionError(error));
              }).finally(() => setBusy(false));
            }}
          >
            <label className="progression-field">
              <span>Email</span>
              <input autoComplete="email" type="email" required value={authEmail} onChange={(event) => setAuthEmail(event.target.value)} placeholder="you@example.com" />
            </label>
            <label className="progression-field">
              <span>Password</span>
              <input autoComplete={createAccount ? "new-password" : "current-password"} type="password" minLength={6} required value={authPassword} onChange={(event) => setAuthPassword(event.target.value)} placeholder="At least 6 characters" />
            </label>
            <button className="progression-primary-button" disabled={busy}>
              {busy ? "One sec..." : createAccount ? "Create account" : "Sign in"}
              <ArrowUpRight size={17} />
            </button>
          </form>
          {authMessage && <p className="progression-inline-message">{authMessage}</p>}
          <button className="progression-text-button" onClick={() => { setCreateAccount((value) => !value); setAuthMessage(""); }}>
            {createAccount ? "Already have an account? Sign in" : "New here? Create an account"}
          </button>
        </section>
      </main>
    );
  }

  if (showDashboardHome) {
    if (dashboardLoading) {
      return <LoadingScreen />;
    }

    if (!dashboardSnapshot) {
      return (
        <main className="progression-app progression-auth-shell">
          <section className="progression-auth-card">
            <div className="progression-brand-mark progression-brand-alert"><X size={20} /></div>
            <p className="progression-eyebrow">Dashboard could not load</p>
            <h1>Check your account data</h1>
            <p>{errorMessage || "Your dashboard data is unavailable."}</p>
            <button
              className="progression-secondary-button"
              onClick={() => {
                if (!user) return;
                setErrorMessage("");
                setDashboardSnapshotUserId(null);
              }}
            >
              Try again
            </button>
          </section>
        </main>
      );
    }

    const dashboardTodayXp = dashboardSnapshot.tasks
      .filter((task) => dashboardSnapshot.completedToday[task.id])
      .reduce((sum, task) => sum + task.xp, 0);

    return (
      <DashboardHome
        displayName={dashboardSnapshot.displayName}
        totalXp={dashboardSnapshot.totalXp}
        todayXp={dashboardTodayXp}
        streak={getCurrentStreak(dashboardSnapshot.completedDates)}
        completedToday={dashboardSnapshot.completedToday}
        completedDates={dashboardSnapshot.completedDates}
        tasks={dashboardSnapshot.tasks}
        busy={busy}
        message={errorMessage}
        onCompleteTask={handleDashboardTaskCompletion}
      />
    );
  }

  if (errorMessage && !snapshot) {
    return (
      <main className="progression-app progression-auth-shell">
        <section className="progression-auth-card">
          <div className="progression-brand-mark progression-brand-alert"><X size={20} /></div>
          <p className="progression-eyebrow">Progression could not load</p>
          <h1>Check your database setup</h1>
          <p>{errorMessage}</p>
          <p className="progression-auth-hint">Run the SQL in <code>supabase/skate-progression.sql</code> in your Supabase SQL Editor, then try again.</p>
          <button className="progression-secondary-button" onClick={() => void refreshSnapshot(user.id).catch((error: unknown) => setErrorMessage(getProgressionError(error)))}>Try again</button>
        </section>
      </main>
    );
  }

  if (loading || !snapshot) {
    return <LoadingScreen />;
  }

  if (!snapshot.baseline || baselineOpen) {
    return (
      <BaselineAssessment
        snapshot={snapshot}
        busy={busy}
        error={errorMessage}
        onDismissError={() => setErrorMessage("")}
        onSubmit={submitBaseline}
      />
    );
  }

  const cycleIsExpired = Boolean(snapshot.cycle && !activeCycle);
  const showCycleSetup = cycleSetupOpen || Boolean(user && snapshot && !loading && snapshot.baseline && !activeCycle);

  return (
    <div className="progression-app">
      <main className="progression-content">
        <header className="progression-header">
          <div className="progression-wordmark">
            <div className="progression-brand-mark"><Footprints size={21} /></div>
            <div>
              <p className="progression-eyebrow">Skate / Progress</p>
              <h1>{activeTab === "Today" ? "Today" : activeTab}</h1>
            </div>
          </div>
          <div className="progression-header-actions">
            <Link className="progression-icon-button" href="/" aria-label="Return to dashboard"><House size={18} /></Link>
            <button className="progression-icon-button" aria-label="Sign out" disabled={busy} onClick={() => void signOut()}>
              <LogOut size={18} />
            </button>
          </div>
        </header>

        {errorMessage && (
          <div className="progression-error" role="alert">
            <span>{errorMessage}</span>
            <button aria-label="Dismiss error" onClick={() => setErrorMessage("")}><X size={17} /></button>
          </div>
        )}

        {activeTab === "Today" && (
          <TodayScreen
            snapshot={snapshot}
            cycle={activeCycle}
            skill={activeSkill}
            trickMap={trickMap}
            progressMap={progressMap}
            qualityConfirmed={qualityConfirmed}
            busy={busy}
            filmedThisWeek={filmedThisWeek}
            loggedSessionThisWeek={loggedSessionThisWeek}
            guideOpen={sessionGuideOpen}
            setGuideOpen={setSessionGuideOpen}
            onQualityChange={(id, checked) => setQualityConfirmed((current) => ({ ...current, [id]: checked }))}
            onLogMake={logMake}
            onLogMiss={(progressId) => {
              if (!activeCycle) return;
              void runAction(
                () => recordProgressionMiss(activeCycle.id, progressId),
                "Streak reset. Take your time and reset your approach.",
              );
            }}
            onOpenSession={() => setSessionModalOpen(true)}
            onOpenSetup={openCycleSetup}
            onChooseQuest={(slot) => setSlotPicker(slot)}
          />
        )}
        {activeTab === "Skill Tree" && (
          <SkillTreeScreen
            snapshot={snapshot}
            categoryFilter={categoryFilter}
            stanceFilter={stanceFilter}
            setCategoryFilter={setCategoryFilter}
            setStanceFilter={setStanceFilter}
          />
        )}
        {activeTab === "Micro-Skills" && (
          <MicroSkillsScreen
            snapshot={snapshot}
            activeSkillId={activeCycle?.active_micro_skill_id}
            busy={busy}
            onToggleBenchmark={toggleMicroSkillBenchmark}
          />
        )}
        {activeTab === "Vault" && (
          <VaultScreen
            snapshot={snapshot}
            busy={busy}
            name={vaultName}
            obstacle={vaultObstacle}
            parents={vaultParents}
            date={vaultDate}
            setName={setVaultName}
            setObstacle={setVaultObstacle}
            setParents={setVaultParents}
            setDate={setVaultDate}
            onSubmit={submitVaultEntry}
            onToggleConsistency={(entry) => void runAction(
              () => updateVaultConsistency(entry.id, !entry.is_consistent),
              entry.is_consistent ? "Consistency reset." : "Signature trick marked consistent.",
            )}
            onDelete={(entry) => void runAction(() => deleteVaultEntry(entry.id))}
          />
        )}
      </main>

      <nav className="progression-tab-bar" aria-label="Main navigation">
        {TABS.map(({ label, icon: Icon }) => (
          <button
            key={label}
            className={`progression-tab${activeTab === label ? " is-active" : ""}`}
            aria-current={activeTab === label ? "page" : undefined}
            onClick={() => setActiveTab(label)}
          >
            <Icon size={20} strokeWidth={activeTab === label ? 2.4 : 1.8} />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      {showCycleSetup && (
        <CycleSetupModal
          snapshot={snapshot}
          selectedMicroSkill={selectedMicroSkill}
          slotPicks={slotPicks}
          isExpired={cycleIsExpired}
          busy={busy}
          onMicroSkillChange={setSelectedMicroSkill}
          onSlotChange={(slot, id) => setSlotPicks((current) => ({ ...current, [slot]: id }))}
          onSubmit={(picks) => void submitCycleSetup(picks)}
        />
      )}

      {slotPicker && activeCycle && (
        <QuestPickerDrawer
          snapshot={snapshot}
          slot={slotPicker}
          cycle={activeCycle}
          busy={busy}
          onClose={() => setSlotPicker(null)}
          onChoose={(progressId) => void chooseNextQuest(slotPicker, progressId)}
        />
      )}

      {sessionModalOpen && (
        <SessionModal
          minutes={sessionMinutes}
          type={sessionType}
          filmed={sessionFilmed}
          questWork={sessionQuestWork}
          notes={sessionNotes}
          busy={busy}
          setMinutes={setSessionMinutes}
          setType={setSessionType}
          setFilmed={setSessionFilmed}
          setQuestWork={setSessionQuestWork}
          setNotes={setSessionNotes}
          onClose={() => setSessionModalOpen(false)}
          onSubmit={submitSession}
        />
      )}

      {toast && (
        <div className="progression-toast" role="status">
          <CircleCheck size={19} />
          <span>{toast}</span>
        </div>
      )}
    </div>
  );
}

const emptySnapshot: ProgressionSnapshot = {
  tricks: [],
  progress: [],
  microSkills: [],
  cycle: null,
  sessions: [],
  vault: [],
  baseline: null,
};

function LoadingScreen() {
  return (
    <main className="progression-app progression-loading">
      <div className="progression-brand-mark"><Footprints size={22} /></div>
      <p className="progression-eyebrow">Loading your progression</p>
      <div className="progression-loader" />
    </main>
  );
}

function TodayScreen({
  snapshot,
  cycle,
  skill,
  trickMap,
  progressMap,
  qualityConfirmed,
  busy,
  filmedThisWeek,
  loggedSessionThisWeek,
  guideOpen,
  setGuideOpen,
  onQualityChange,
  onLogMake,
  onLogMiss,
  onOpenSession,
  onOpenSetup,
  onChooseQuest,
}: {
  snapshot: ProgressionSnapshot;
  cycle: TrainingCycle | null;
  skill: MicroSkill | undefined;
  trickMap: Map<string, Trick>;
  progressMap: Map<string, TrickProgress>;
  qualityConfirmed: Record<string, boolean>;
  busy: boolean;
  filmedThisWeek: number;
  loggedSessionThisWeek: number;
  guideOpen: boolean;
  setGuideOpen: (open: boolean) => void;
  onQualityChange: (id: string, checked: boolean) => void;
  onLogMake: (progress: TrickProgress, slot: QuestSlot) => void;
  onLogMiss: (progressId: string) => void;
  onOpenSession: () => void;
  onOpenSetup: () => void;
  onChooseQuest: (slot: QuestSlot) => void;
}) {
  const slots: { key: QuestSlot; id: string; color: string }[] = cycle
    ? [
        { key: "A", id: cycle.slot_a_progress_id, color: "amber" },
        { key: "B", id: cycle.slot_b_progress_id, color: "blue" },
        { key: "C", id: cycle.slot_c_progress_id, color: "green" },
        { key: "D", id: cycle.slot_d_progress_id, color: "amber" },
      ]
    : [];
  const daysLeft = cycle
    ? Math.max(0, Math.ceil((new Date(`${cycle.end_date}T00:00:00`).getTime() - new Date(`${localDateKey()}T00:00:00`).getTime()) / 86400000) + 1)
    : 0;
  const activeSlots = slots.filter(({ id }) => (progressMap.get(id)?.score ?? 3) < 3).length;

  return (
    <div className="progression-stack">
      {cycle ? (
        <>
          <section className="progression-cycle-banner">
            <div>
              <p className="progression-eyebrow">Current cycle</p>
              <h2>Day {getCycleDay(cycle)} <span>/ 14</span></h2>
              <p>{daysLeft} {daysLeft === 1 ? "day" : "days"} left · {activeSlots} active trick goals</p>
            </div>
            <div className="progression-cycle-stamp"><Timer size={19} /><strong>2 WK</strong></div>
          </section>

          <section className="progression-skill-card">
            <div className="progression-card-kicker"><span className="progression-live-dot" /> ACTIVE MICRO-SKILL <span>100 HOUR BUILD</span></div>
            {skill ? (
              <>
                <h2>{skill.name}</h2>
                <p className="progression-drill"><strong>Warm-up</strong> {skill.drill_description}</p>
                <div className="progression-cue"><Sparkles size={16} /><span>{skill.overlay_cue}</span></div>
                <div className="progression-progress-meta"><span>Skill XP</span><strong>{formatHours(skill.logged_minutes)}</strong></div>
                <ProgressBar value={skill.logged_minutes / 60} max={100} />
              </>
            ) : (
              <p>Choose an active micro-skill to start this cycle.</p>
            )}
          </section>

          <div className="progression-section-heading">
            <div><p className="progression-eyebrow">Your focus</p><h2>Cycle trick goals</h2></div>
            <span className="progression-count-badge">{activeSlots} / 4</span>
          </div>
          <div className="progression-quest-list">
            {slots.map(({ key, id, color }) => {
              const progress = progressMap.get(id);
              const trick = progress ? trickMap.get(progress.trick_id) : undefined;
              const completed = Boolean(progress && progress.score === 3);
              return (
                <section key={key} className={`progression-quest-card is-${color}`}>
                  <div className="progression-quest-heading">
                    <span className="progression-slot-tag">SLOT {key}</span>
                    <span className="progression-quest-type">{SLOT_NAMES[key]}</span>
                    {completed && <button className="progression-mini-button" onClick={() => onChooseQuest(key)} aria-label={`Choose the next slot ${key} trick`}><RotateCcw size={15} /></button>}
                  </div>
                  <div className="progression-trick-line">
                    <div><h3>{getTrickName(trick)}</h3><p>{trick?.stance ?? "Choose a trick"} stance · Tier {progress?.tier ?? "—"}</p></div>
                    {completed && <span className="progression-mastered"><Trophy size={14} /> Mastered</span>}
                  </div>
                  <div className="progression-streak" aria-label={`${progress?.consecutive_makes ?? 0} of 3 clean makes`}>
                    {[1, 2, 3].map((step) => (
                      <span key={step} className={`${(progress?.consecutive_makes ?? 0) >= step ? "is-filled" : ""}${step === 3 && (progress?.consecutive_makes ?? 0) >= 3 ? " is-master" : ""}`}>
                        {step === 3 && (progress?.consecutive_makes ?? 0) >= 3 ? <Trophy size={13} /> : step}
                      </span>
                    ))}
                    <small>{progress?.consecutive_makes ?? 0} / 3 in a row</small>
                  </div>
                  {progress && progress.attempts > 0 && (
                    <p className="progression-attempt-meta">{progress.makes} of {progress.attempts} attempts landed</p>
                  )}
                  {!completed && progress && (
                    <>
                      <label className="progression-quality-toggle">
                        <input
                          type="checkbox"
                          checked={Boolean(qualityConfirmed[progress.id])}
                          onChange={(event) => onQualityChange(progress.id, event.target.checked)}
                        />
                        <span className="progression-checkbox"><Check size={13} /></span>
                        <span>Fast approach · bolts · active cue</span>
                      </label>
                      <button
                        className="progression-make-button"
                        disabled={busy}
                        onClick={() => onLogMake(progress, key)}
                      >
                        <Plus size={18} /> Log make
                      </button>
                      <button
                        className="progression-miss-button"
                        disabled={busy}
                        onClick={() => onLogMiss(progress.id)}
                      >
                        Missed · log attempt & reset streak
                      </button>
                    </>
                  )}
                  {completed && <button className="progression-next-button" onClick={() => onChooseQuest(key)}>Pick next trick <ArrowUpRight size={16} /></button>}
                </section>
              );
            })}
          </div>

          <section className="progression-card progression-film-card">
            <div className="progression-film-icon"><Camera size={19} /></div>
            <div className="progression-film-copy">
              <strong>Film your diagnostic</strong>
              <span>{filmedThisWeek} of 2 weekly clips · {loggedSessionThisWeek} sessions logged</span>
              <ProgressBar value={Math.min(filmedThisWeek, 2)} max={2} />
            </div>
            <span className="progression-film-target">2–3×</span>
          </section>

          <section className="progression-card progression-guide">
            <button className="progression-guide-toggle" onClick={() => setGuideOpen(!guideOpen)} aria-expanded={guideOpen}>
              <div><p className="progression-eyebrow">A simple park plan</p><h2>90-min session guide</h2></div>
              {guideOpen ? <ChevronUp size={19} /> : <ChevronDown size={19} />}
            </button>
            {guideOpen && (
              <ol className="progression-timeline">
                <li><span>0–20m</span><div><strong>Warmup</strong><small>Active micro-skill drill + roll-in</small></div></li>
                <li><span>20–35m</span><div><strong>Slot A</strong><small>Flat / gap tricks</small></div></li>
                <li><span>35–50m</span><div><strong>Slot B</strong><small>Ledge tricks</small></div></li>
                <li><span>50–65m</span><div><strong>Slot C</strong><small>Rail tricks</small></div></li>
                <li><span>65–75m</span><div><strong>Slot D</strong><small>Weak-stance trick</small></div></li>
                <li><span>75–90m</span><div><strong>Playtime Lab</strong><small>Explore, film a make, log a signature</small></div></li>
              </ol>
            )}
          </section>
          <button className="progression-primary-button progression-session-cta" onClick={onOpenSession}>
            <Footprints size={18} /> Log session <span>+ automatic skill XP</span>
          </button>
        </>
      ) : (
        <section className="progression-empty-cycle">
          <div className="progression-empty-icon"><Sparkles size={22} /></div>
          <p className="progression-eyebrow">{snapshot.cycle ? "Cycle expired" : "Start a cycle"}</p>
          <h2>Set up your 2-week cycle</h2>
          <p>Choose one micro-skill and four trick goals. The next eligible tricks are ready when you are.</p>
          <button className="progression-primary-button" onClick={onOpenSetup}>Build my cycle <ArrowUpRight size={17} /></button>
        </section>
      )}
    </div>
  );
}

function SkillTreeScreen({
  snapshot,
  categoryFilter,
  stanceFilter,
  setCategoryFilter,
  setStanceFilter,
}: {
  snapshot: ProgressionSnapshot;
  categoryFilter: TrickCategory;
  stanceFilter: "all" | Stance;
  setCategoryFilter: (filter: TrickCategory) => void;
  setStanceFilter: (filter: "all" | Stance) => void;
}) {
  const progressByTrick = useMemo(() => {
    const result = new Map<string, TrickProgress[]>();
    snapshot.progress.forEach((progress) => {
      const trickProgress = result.get(progress.trick_id) ?? [];
      trickProgress.push(progress);
      result.set(progress.trick_id, trickProgress);
    });
    result.forEach((tiers) => tiers.sort((a, b) => a.tier - b.tier));
    return result;
  }, [snapshot.progress]);
  const tricks = snapshot.tricks.filter((trick) =>
    trick.category === categoryFilter &&
    (stanceFilter === "all" || trick.stance === stanceFilter),
  );

  return (
    <div className="progression-stack">
      <section className="progression-page-intro">
        <p className="progression-eyebrow">140 primitives · 6 tiers</p>
        <h2>Build the whole bag.</h2>
        <p>Higher tiers unlock only after the previous tier is mastered.</p>
      </section>
      <div className="progression-filter-group" aria-label="Trick category">
        {[
          ["flat_gap", "Flat / Gaps"],
          ["ledge", "Ledges"],
          ["rail", "Rails"],
        ].map(([value, label]) => (
          <button key={value} className={categoryFilter === value ? "is-selected" : ""} onClick={() => setCategoryFilter(value as TrickCategory)}>{label}</button>
        ))}
      </div>
      <div className="progression-filter-group progression-filter-stance" aria-label="Stance">
        {(["all", ...STANCES] as const).map((stance) => (
          <button key={stance} className={stanceFilter === stance ? "is-selected" : ""} onClick={() => setStanceFilter(stance)}>{stance === "all" ? "All stances" : stance}</button>
        ))}
      </div>
      <section className="progression-card progression-tier-guide">
        <details>
          <summary>Obstacle tier guide <ChevronDown size={16} /></summary>
          {([
            ["flat_gap", "FLATGROUND / GAPS"],
            ["ledge", "LEDGES"],
            ["rail", "RAILS"],
          ] as const).map(([category, label]) => (
            <div className="progression-tier-guide-group" key={category}>
              <span>{label}</span>
              {TIER_GUIDES[category].map((obstacle, index) => (
                <p key={obstacle}><strong>T{index + 1}</strong><span>{obstacle}</span></p>
              ))}
            </div>
          ))}
        </details>
      </section>
      <div className="progression-tree-list">
        {tricks.map((trick) => (
          <article className="progression-tree-card" key={trick.id}>
            <div className="progression-tree-title">
              <div>
                <span>{trick.category === "flat_gap" ? "FLAT / GAP" : `${trick.direction} · ${trick.category.toUpperCase()}`}</span>
                <h3>{getTrickName(trick)}</h3>
              </div>
              <span className="progression-stance-pill">{trick.stance}</span>
            </div>
            <div className="progression-tier-row">
              {(progressByTrick.get(trick.id) ?? []).map((progress) => {
                const locked = progress.tier > 1 && (progressByTrick.get(trick.id)?.find((item) => item.tier === progress.tier - 1)?.score ?? 0) !== 3;
                return (
                  <div key={progress.id} className={`progression-tier-badge tier-${progress.score}${locked ? " is-locked" : ""}`} aria-label={`Tier ${progress.tier}, ${locked ? "locked" : `score ${progress.score}`}`}>
                    {locked ? <LockKeyhole size={12} /> : <><small>T{progress.tier}</small><strong>{progress.score}</strong></>}
                  </div>
                );
              })}
            </div>
          </article>
        ))}
        {!tricks.length && <p className="progression-empty-state">No tricks match these filters.</p>}
      </div>
      <div className="progression-legend">
        <span><i className="tier-swatch tier-0" /> Zinc</span>
        <span><i className="tier-swatch tier-1" /> Landed</span>
        <span><i className="tier-swatch tier-2" /> Consistent</span>
        <span><i className="tier-swatch tier-3" /> Mastered</span>
      </div>
    </div>
  );
}

function MicroSkillsScreen({
  snapshot,
  activeSkillId,
  busy,
  onToggleBenchmark,
}: {
  snapshot: ProgressionSnapshot;
  activeSkillId: string | undefined;
  busy: boolean;
  onToggleBenchmark: (skill: MicroSkill) => void;
}) {
  const totalMinutes = snapshot.microSkills.reduce((sum, skill) => sum + skill.logged_minutes, 0);

  return (
    <div className="progression-stack">
      <section className="progression-page-intro">
        <p className="progression-eyebrow">Passive stats · 7 skills</p>
        <h2>Small cues. Big carryover.</h2>
        <p>Session time is credited automatically to the micro-skill equipped for that cycle.</p>
      </section>
      <section className="progression-micro-summary">
        <div><Sparkles size={19} /><span>Total focused practice</span></div>
        <strong>{(totalMinutes / 60).toFixed(1)} <small>hrs</small></strong>
        <ProgressBar value={totalMinutes / 60} max={700} />
        <p>{(totalMinutes / 60).toFixed(1)} of 700 total skill-hours</p>
      </section>
      {snapshot.microSkills.map((skill) => (
        <article className={`progression-micro-card${skill.id === activeSkillId ? " is-equipped" : ""}`} key={skill.id}>
          <div className="progression-micro-top">
            <div><span className="progression-eyebrow">{skill.id === activeSkillId ? "Equipped this cycle" : "Passive skill"}</span><h3>{skill.name}</h3></div>
            {skill.id === activeSkillId ? <span className="progression-equipped-dot" /> : <Sparkles size={17} />}
          </div>
          <div className="progression-micro-hours"><strong>{formatHours(skill.logged_minutes)}</strong><span>target</span></div>
          <ProgressBar value={skill.logged_minutes / 60} max={100} />
          <details className="progression-micro-details">
            <summary>Drill, cue & benchmark <ChevronDown size={15} /></summary>
            <div className="progression-detail-copy">
              <p><strong>Warm-up drill</strong>{skill.drill_description}</p>
              <p><strong>Trick overlay</strong>{skill.overlay_cue}</p>
              <p><strong>Benchmark</strong>{skill.benchmark_test}</p>
            </div>
          </details>
          <label className={`progression-benchmark-toggle${skill.benchmark_passed ? " is-passed" : ""}`}>
            <input
              type="checkbox"
              checked={skill.benchmark_passed}
              disabled={busy}
              onChange={() => onToggleBenchmark(skill)}
            />
            <span className="progression-checkbox"><Check size={13} /></span>
            <span>{skill.benchmark_passed ? "Benchmark passed" : "Mark benchmark passed"}</span>
            {skill.benchmark_passed ? <BadgeCheck size={17} /> : <CircleCheck size={17} />}
          </label>
        </article>
      ))}
    </div>
  );
}

function VaultScreen({
  snapshot,
  busy,
  name,
  obstacle,
  parents,
  date,
  setName,
  setObstacle,
  setParents,
  setDate,
  onSubmit,
  onToggleConsistency,
  onDelete,
}: {
  snapshot: ProgressionSnapshot;
  busy: boolean;
  name: string;
  obstacle: string;
  parents: string;
  date: string;
  setName: (value: string) => void;
  setObstacle: (value: string) => void;
  setParents: (value: string) => void;
  setDate: (value: string) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onToggleConsistency: (entry: ProgressionSnapshot["vault"][number]) => void;
  onDelete: (entry: ProgressionSnapshot["vault"][number]) => void;
}) {
  return (
    <div className="progression-stack">
      <section className="progression-page-intro">
        <p className="progression-eyebrow">20% emergence · 100% yours</p>
        <h2>Make room for play.</h2>
        <p>Log the unexpected links, combinations, and signature tricks that show up when you let it flow.</p>
      </section>
      <form className="progression-card progression-vault-form" onSubmit={onSubmit}>
        <div className="progression-section-heading"><div><p className="progression-eyebrow">New discovery</p><h2>Add to the vault</h2></div><div className="progression-vault-plus"><Plus size={17} /></div></div>
        <label className="progression-field"><span>Trick name</span><input required value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Nollie inward heel" /></label>
        <label className="progression-field"><span>Obstacle <small>optional</small></span><input value={obstacle} onChange={(event) => setObstacle(event.target.value)} placeholder="Hip ledge, bank, flat..." /></label>
        <label className="progression-field"><span>Parent tricks <small>optional</small></span><input value={parents} onChange={(event) => setParents(event.target.value)} placeholder="What did it grow from?" /></label>
        <label className="progression-field"><span>First landed</span><input type="date" required value={date} onChange={(event) => setDate(event.target.value)} /></label>
        <button className="progression-primary-button" disabled={busy}>Save discovery <ArrowUpRight size={17} /></button>
      </form>
      <div className="progression-section-heading progression-vault-heading">
        <div><p className="progression-eyebrow">Your signature list</p><h2>Playtime vault</h2></div>
        <span className="progression-count-badge">{snapshot.vault.length}</span>
      </div>
      {snapshot.vault.length ? snapshot.vault.map((entry) => (
        <article key={entry.id} className="progression-vault-entry">
          <div className="progression-vault-entry-icon"><Sparkles size={17} /></div>
          <div className="progression-vault-entry-copy">
            <strong>{entry.trick_name}</strong>
            <span>{[entry.obstacle, entry.parent_tricks].filter(Boolean).join(" · ") || "A new one of one"}</span>
            <small>First landed {new Date(`${entry.first_landed_at}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</small>
          </div>
          <button className={`progression-vault-check${entry.is_consistent ? " is-checked" : ""}`} aria-label={entry.is_consistent ? "Mark inconsistent" : "Mark consistent"} onClick={() => onToggleConsistency(entry)}>
            {entry.is_consistent ? <Check size={16} /> : <CircleCheck size={17} />}
          </button>
          <button className="progression-vault-delete" aria-label={`Delete ${entry.trick_name}`} onClick={() => onDelete(entry)}><X size={15} /></button>
        </article>
      )) : (
        <section className="progression-empty-state progression-vault-empty"><Sparkles size={20} /><strong>Your signature tricks live here.</strong><span>Log a new discovery from your next play session.</span></section>
      )}
    </div>
  );
}

function ProgressBar({ value, max }: { value: number; max: number }) {
  const percent = Math.max(0, Math.min(100, (value / max) * 100));
  return <div className="progression-progress-track" role="progressbar" aria-valuenow={Math.round(percent)} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${percent}%` }} /></div>;
}

function CycleSetupModal({
  snapshot,
  selectedMicroSkill,
  slotPicks,
  isExpired,
  busy,
  onMicroSkillChange,
  onSlotChange,
  onSubmit,
}: {
  snapshot: ProgressionSnapshot;
  selectedMicroSkill: string;
  slotPicks: SlotPicks;
  isExpired: boolean;
  busy: boolean;
  onMicroSkillChange: (id: string) => void;
  onSlotChange: (slot: QuestSlot, id: string) => void;
  onSubmit: (picks: {
    activeMicroSkillId: string;
    slotAProgressId: string;
    slotBProgressId: string;
    slotCProgressId: string;
    slotDProgressId: string;
  }) => void;
}) {
  const firstSlotA = eligibleProgress(snapshot, "A")[0]?.id ?? "";
  const initialSlotA = slotPicks.A || firstSlotA;
  const firstSlotB = eligibleProgress(snapshot, "B", [initialSlotA].filter(Boolean))[0]?.id ?? "";
  const initialSlotB = slotPicks.B || firstSlotB;
  const firstSlotC = eligibleProgress(snapshot, "C", [initialSlotA, initialSlotB].filter(Boolean))[0]?.id ?? "";
  const initialSlotC = slotPicks.C || firstSlotC;
  const firstSlotD = eligibleProgress(snapshot, "D", [initialSlotA, initialSlotB, initialSlotC].filter(Boolean))[0]?.id ?? "";
  const [pickedMicroSkill, setPickedMicroSkill] = useState(
    selectedMicroSkill || [...snapshot.microSkills].sort((a, b) => a.logged_minutes - b.logged_minutes)[0]?.id || "",
  );
  const [pickedSlots, setPickedSlots] = useState<SlotPicks>({
    A: initialSlotA,
    B: initialSlotB,
    C: initialSlotC,
    D: slotPicks.D || firstSlotD,
  });
  const candidates = {
    A: eligibleProgress(snapshot, "A", [pickedSlots.B, pickedSlots.C, pickedSlots.D].filter(Boolean)),
    B: eligibleProgress(snapshot, "B", [pickedSlots.A, pickedSlots.C, pickedSlots.D].filter(Boolean)),
    C: eligibleProgress(snapshot, "C", [pickedSlots.A, pickedSlots.B, pickedSlots.D].filter(Boolean)),
    D: eligibleProgress(snapshot, "D", [pickedSlots.A, pickedSlots.B, pickedSlots.C].filter(Boolean)),
  };
  const canSubmit = Boolean(pickedMicroSkill && pickedSlots.A && pickedSlots.B && pickedSlots.C && pickedSlots.D);

  return (
    <div className="progression-modal-scrim">
      <section className="progression-cycle-modal" role="dialog" aria-modal="true" aria-labelledby="cycle-modal-title">
        <header className="progression-modal-header">
          <div className="progression-brand-mark"><Sparkles size={19} /></div>
        </header>
        <p className="progression-eyebrow">{isExpired ? "New two-week cycle" : "Cycle setup · 01/02"}</p>
        <h2 id="cycle-modal-title">{isExpired ? "Your next cycle is ready." : "Pick your focus."}</h2>
        <p className="progression-modal-lede">Choose a micro-skill and four doable tricks. We&apos;ll tee up the next trick as soon as you master a slot.</p>
        <label className="progression-field">
          <span>Active micro-skill <small>recommendation: least-practiced</small></span>
          <select value={pickedMicroSkill} onChange={(event) => { setPickedMicroSkill(event.target.value); onMicroSkillChange(event.target.value); }}>
            {snapshot.microSkills.map((skill) => <option key={skill.id} value={skill.id}>{skill.name} · {(skill.logged_minutes / 60).toFixed(1)}h</option>)}
          </select>
        </label>
        <div className="progression-cycle-picks">
          {(["A", "B", "C", "D"] as QuestSlot[]).map((slot) => (
            <label className="progression-field" key={slot}>
              <span><i className={`progression-slot-dot slot-${slot.toLowerCase()}`} />Slot {slot} <small>{SLOT_NAMES[slot]}</small></span>
              <select value={pickedSlots[slot]} onChange={(event) => {
                setPickedSlots((current) => ({ ...current, [slot]: event.target.value }));
                onSlotChange(slot, event.target.value);
              }}>
                <option value="">Choose an eligible trick</option>
                {candidates[slot].map((progress) => {
                  const trick = snapshot.tricks.find((item) => item.id === progress.trick_id);
                  return <option key={progress.id} value={progress.id}>{trick ? getTrickLabel(trick) : "Trick"} · T{progress.tier} · {progress.score}/3</option>;
                })}
              </select>
              {!candidates[slot].length && <small className="progression-field-help">No eligible tricks remain for this slot.</small>}
            </label>
          ))}
        </div>
        <div className="progression-modal-footnote"><Check size={15} /><span>Slots only show unlocked tricks rated 0–2. Mastery needs three clean makes in a row.</span></div>
        <button
          className="progression-primary-button"
          disabled={!canSubmit || busy}
          onClick={() => onSubmit({
            activeMicroSkillId: pickedMicroSkill,
            slotAProgressId: pickedSlots.A,
            slotBProgressId: pickedSlots.B,
            slotCProgressId: pickedSlots.C,
            slotDProgressId: pickedSlots.D,
          })}
        >
          {busy ? "Locking in..." : "Lock in this cycle"} <ArrowUpRight size={17} />
        </button>
      </section>
    </div>
  );
}

function QuestPickerDrawer({
  snapshot,
  slot,
  cycle,
  busy,
  onClose,
  onChoose,
}: {
  snapshot: ProgressionSnapshot;
  slot: QuestSlot;
  cycle: TrainingCycle;
  busy: boolean;
  onClose: () => void;
  onChoose: (progressId: string) => void;
}) {
  const cycleProgressIds: Record<QuestSlot, string> = {
    A: cycle.slot_a_progress_id,
    B: cycle.slot_b_progress_id,
    C: cycle.slot_c_progress_id,
    D: cycle.slot_d_progress_id,
  };
  const previousId = cycleProgressIds[slot];
  const excluded = Object.values(cycleProgressIds).filter((id) => id !== previousId);
  const options = eligibleProgress(snapshot, slot, excluded);

  return (
    <div className="progression-modal-scrim progression-drawer-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="progression-picker-drawer" role="dialog" aria-modal="true" aria-labelledby="quest-picker-title">
        <div className="progression-drawer-grip" />
        <header className="progression-drawer-heading">
          <div><p className="progression-eyebrow">Slot {slot} · {SLOT_NAMES[slot]}</p><h2 id="quest-picker-title">Pick your next trick.</h2></div>
          <button className="progression-icon-button" aria-label="Close trick picker" onClick={onClose}><X size={19} /></button>
        </header>
        <p className="progression-picker-copy">Only unlocked tricks with a score of 0–2 are shown. The next tier opens after mastery.</p>
        <div className="progression-picker-list">
          {options.filter((progress) => progress.id !== previousId).map((progress) => {
            const trick = snapshot.tricks.find((item) => item.id === progress.trick_id);
            return (
              <button key={progress.id} className="progression-picker-option" disabled={busy} onClick={() => onChoose(progress.id)}>
                <span className="progression-picker-tier">T{progress.tier}</span>
                <span className="progression-picker-name"><strong>{trick ? getTrickLabel(trick) : "Trick unavailable"}</strong><small>{progress.score === 0 ? "Not unlocked" : progress.score === 1 ? "Landed" : "Consistent"} · {progress.consecutive_makes}/3 streak</small></span>
                <ArrowUpRight size={17} />
              </button>
            );
          })}
          {!options.filter((progress) => progress.id !== previousId).length && <p className="progression-empty-state">No more eligible tricks in this slot yet. Master more tricks to unlock the next tier.</p>}
        </div>
      </section>
    </div>
  );
}

function SessionModal({
  minutes,
  type,
  filmed,
  questWork,
  notes,
  busy,
  setMinutes,
  setType,
  setFilmed,
  setQuestWork,
  setNotes,
  onClose,
  onSubmit,
}: {
  minutes: number;
  type: string;
  filmed: boolean;
  questWork: boolean;
  notes: string;
  busy: boolean;
  setMinutes: (minutes: number) => void;
  setType: (type: string) => void;
  setFilmed: (filmed: boolean) => void;
  setQuestWork: (worked: boolean) => void;
  setNotes: (notes: string) => void;
  onClose: () => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div className="progression-modal-scrim progression-session-scrim">
      <section className="progression-cycle-modal progression-session-modal" role="dialog" aria-modal="true" aria-labelledby="session-modal-title">
        <header className="progression-modal-header">
          <div className="progression-brand-mark"><Footprints size={20} /></div>
          <button className="progression-icon-button" aria-label="Close session form" onClick={onClose}><X size={19} /></button>
        </header>
        <p className="progression-eyebrow">Nice work showing up</p>
        <h2 id="session-modal-title">Log your session.</h2>
        <form className="progression-stack" onSubmit={onSubmit}>
          <label className="progression-field"><span>Time on board · minutes</span><input type="number" min={1} max={600} step={1} required value={minutes} onChange={(event) => setMinutes(Number(event.target.value))} /></label>
          <label className="progression-field"><span>Session feel</span><select value={type} onChange={(event) => setType(event.target.value)}>
            <option value="high_impact">High impact</option><option value="technical_low">Technical / low impact</option><option value="speed_flow">Speed & flow</option><option value="benchmark_film">Benchmark / film</option>
          </select></label>
          <ToggleField checked={questWork} onChange={setQuestWork} title="Worked on cycle trick goals" detail="Adds up to 45 minutes of trick-overlay XP." />
          <ToggleField checked={filmed} onChange={setFilmed} title="Filmed a diagnostic clip" detail="Target 2–3 clips each week." />
          <label className="progression-field"><span>Session note <small>optional</small></span><textarea rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Anything worth remembering?" /></label>
          <div className="progression-xp-note"><Sparkles size={16} /><span>Automatic credit: up to <strong>15m warm-up</strong>{questWork ? " + 45m trick overlay" : ""} to the active micro-skill.</span></div>
          <button className="progression-primary-button" disabled={busy}>{busy ? "Saving session..." : "Save session"} <Check size={17} /></button>
        </form>
      </section>
    </div>
  );
}

function ToggleField({ checked, onChange, title, detail }: { checked: boolean; onChange: (checked: boolean) => void; title: string; detail: string }) {
  return (
    <label className="progression-session-toggle">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span className="progression-checkbox"><Check size={13} /></span>
      <span><strong>{title}</strong><small>{detail}</small></span>
    </label>
  );
}
