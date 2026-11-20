"use client";

import {
  ArrowUpRight,
  Brain,
  Check,
  Dumbbell,
  Footprints,
  Handshake,
  HeartPulse,
  Languages,
  Sparkles,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { DAILY_CHECKLIST_TASK_IDS, getLevelData } from "@/lib/game";
import type { Task } from "@/lib/game";
import MainNavigation from "@/components/main-navigation";

const CHECKLIST_ICONS = {
  mobility: Footprints,
  recovery: HeartPulse,
  japanese: Languages,
  mind: Brain,
  character: Handshake,
};

export default function DashboardHome({
  displayName,
  totalXp,
  todayXp,
  streak,
  completedToday,
  completedDates,
  tasks,
  busy,
  message,
  onCompleteTask,
}: {
  displayName: string;
  totalXp: number;
  todayXp: number;
  streak: number;
  completedToday: Record<string, boolean>;
  completedDates: string[];
  tasks: Task[];
  busy: boolean;
  message: string;
  onCompleteTask: (task: Task) => void;
}) {
  const level = getLevelData(totalXp);
  const checklist = DAILY_CHECKLIST_TASK_IDS.flatMap((id) => {
    const task = tasks.find((candidate) => candidate.id === id);
    return task ? [{ ...task, id }] : [];
  });
  const weekDays = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - index));
    const key = [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0"),
    ].join("-");
    return {
      key,
      label: new Intl.DateTimeFormat("en", { weekday: "short" }).format(date).slice(0, 2),
      completed: completedDates.includes(key),
      isToday: index === 6,
    };
  });
  const doneCount = checklist.filter((task) => completedToday[task.id]).length;

  return (
    <div className="progression-app">
      <main className="progression-content progression-dashboard-content">
        <header className="progression-header">
          <div className="progression-wordmark">
            <div className="progression-brand-mark"><Footprints size={21} /></div>
            <div>
              <p className="progression-eyebrow">
                {new Intl.DateTimeFormat("en", { weekday: "long", day: "numeric", month: "short" }).format(new Date())}
              </p>
              <h1>Hey, {displayName}</h1>
            </div>
          </div>
          <Link className="progression-icon-button" href="/settings" aria-label="Profile and settings">
            <UserRound size={19} />
          </Link>
        </header>

        <section className="progression-dashboard-level">
          <div className="progression-dashboard-level-top">
            <div>
              <p className="progression-eyebrow">SKATE LEVEL</p>
              <div className="progression-dashboard-xp-line">
                <strong>{level.level}</strong>
                <span>{totalXp.toLocaleString()} XP total</span>
              </div>
            </div>
            <div className="progression-dashboard-streak">
              <span aria-hidden="true">🔥</span>
              <strong>{streak} day streak</strong>
            </div>
          </div>
          <div className="progression-progress-meta">
            <span>Level progress</span>
            <strong>{level.currentLevelXp.toLocaleString()} / {level.xpToNextLevel.toLocaleString()} XP</strong>
          </div>
          <div className="progression-progress-track" role="progressbar" aria-valuenow={Math.round(level.progress)} aria-valuemin={0} aria-valuemax={100}>
            <span style={{ width: `${level.progress}%` }} />
          </div>
          <div className="progression-dashboard-week" aria-label="Activity over the last seven days">
            {weekDays.map((day) => (
              <div className={day.isToday ? "is-today" : ""} key={day.key}>
                <span>{day.label}</span>
                <i className={day.completed ? "is-complete" : ""} />
              </div>
            ))}
          </div>
        </section>

        <section className="progression-dashboard-checklist">
          <div className="progression-section-heading">
            <div>
              <p className="progression-eyebrow">DAILY CHECKLIST</p>
              <h2>Small wins, every day</h2>
            </div>
            <span className="progression-count-badge">{doneCount} / {checklist.length}</span>
          </div>
          <div className="progression-dashboard-tasks">
            {checklist.map((task) => {
              const Icon = CHECKLIST_ICONS[task.id];
              const done = Boolean(completedToday[task.id]);
              return (
                <button
                  type="button"
                  key={task.id}
                  className={`progression-dashboard-task${done ? " is-complete" : ""}`}
                  disabled={done || busy}
                  onClick={() => onCompleteTask(task)}
                >
                  <span className="progression-dashboard-task-icon"><Icon size={18} /></span>
                  <span className="progression-dashboard-task-copy">
                    <strong>{task.name}</strong>
                    <small>{done ? "Done for today" : `+${task.xp} XP`}</small>
                  </span>
                  <span className="progression-dashboard-task-check">{done ? <Check size={17} /> : null}</span>
                </button>
              );
            })}
          </div>
          <div className="progression-dashboard-earned">
            <Sparkles size={16} aria-hidden="true" />
            <span><strong>+{todayXp.toLocaleString()} XP today</strong> · skate from sessions and skate benchmarks, workouts from completion</span>
          </div>
          {message && <p className="progression-dashboard-message" role="status">{message}</p>}
        </section>

        <div className="progression-dashboard-shortcuts">
          <Link href="/progress"><Footprints size={17} /><span>Log skate session</span><ArrowUpRight size={16} /></Link>
          <Link href="/workouts"><Dumbbell size={17} /><span>Workouts</span><ArrowUpRight size={16} /></Link>
        </div>
      </main>

      <MainNavigation active="Today" />
    </div>
  );
}
