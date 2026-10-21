"use client";

import { useState } from "react";
import type { SeasonQuest } from "@/lib/state-types";
import { getSeasonProgress } from "@/lib/training-program";
import { SEASON_MODIFIERS } from "@/lib/workouts";

export default function SeasonProgram({
  quests,
  accumulatedFocusMinutes,
  onReorder,
  onRename,
  onStart,
}: {
  quests: SeasonQuest[];
  accumulatedFocusMinutes: number;
  onReorder: (orderedIds: string[]) => Promise<void>;
  onRename: (quest: SeasonQuest, name: string, description: string) => Promise<void>;
  onStart: (quest: SeasonQuest) => Promise<void>;
}) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const progress = getSeasonProgress(quests);
  const activeQuest = quests.find((quest) => quest.status === "active");
  const nextQuest = quests.find((quest) => quest.status === "planned");
  const currentSeason = activeQuest?.sortOrder ?? nextQuest?.sortOrder ?? 10;
  const modifier = SEASON_MODIFIERS[currentSeason];
  const totalFocusedHours = accumulatedFocusMinutes / 60;

  async function reorder(fromId: string, toId: string) {
    const fromIndex = quests.findIndex((quest) => quest.id === fromId);
    const toIndex = quests.findIndex((quest) => quest.id === toId);
    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return;
    if (quests[fromIndex].status !== "planned" || quests[toIndex].status !== "planned") return;
    const segmentStart = Math.min(fromIndex, toIndex);
    const segmentEnd = Math.max(fromIndex, toIndex);
    if (quests.slice(segmentStart, segmentEnd + 1).some((quest) => quest.status !== "planned")) return;

    const reordered = [...quests];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);
    setMessage("");
    try {
      await onReorder(reordered.map((quest) => quest.id));
    } catch (error) {
      setMessage((error as Error).message);
    }
  }

  async function runAction(id: string, action: () => Promise<void>) {
    setBusyId(id);
    setMessage("");
    try {
      await action();
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="rounded-3xl border border-white/10 bg-[#111214] p-5 shadow-xl shadow-black/20">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-amber-300">1,000-hour masterplan</p>
          <h2 className="mt-2 text-2xl font-black text-white">Season {currentSeason} of 10 · {modifier.name}</h2>
          <p className="mt-1 text-sm text-slate-300">
            {totalFocusedHours.toFixed(1)} / 1,000 focused hours · {quests.filter((quest) => quest.status === "completed").length} seasons complete
          </p>
        </div>
        <strong className="text-sm text-amber-200">{Math.floor(progress.percent)}%</strong>
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-amber-400" style={{ width: `${Math.min(100, progress.percent)}%` }} />
      </div>
      <div className="mt-5 rounded-2xl border border-white/10 bg-black/15 p-4">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Season progression · 100 focused hours each</p>
        <div className="mt-4 grid h-24 grid-cols-10 items-end gap-2" role="img" aria-label="Progress across ten 100-hour seasons">
          {quests.map((quest) => {
            const height = Math.max(5, Math.min(100, (quest.focusedMinutes / quest.targetFocusMinutes) * 100));
            return (
              <div key={quest.id} className="flex h-full flex-col items-center justify-end gap-1">
                <div className="flex w-full flex-1 items-end">
                  <div
                    className={`w-full rounded-t ${quest.status === "completed" ? "bg-emerald-400" : quest.status === "active" ? "bg-amber-400" : "bg-white/15"}`}
                    style={{ height: `${quest.status === "planned" ? 5 : height}%` }}
                    title={`Season ${quest.sortOrder}: ${(quest.focusedMinutes / 60).toFixed(1)} of 100 hours`}
                  />
                </div>
                <span className="text-[10px] text-slate-400">{quest.sortOrder}</span>
              </div>
            );
          })}
        </div>
      </div>

      {activeQuest && (
        <div className="mt-5 rounded-2xl border border-amber-300/30 bg-amber-300/5 p-4">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-200">Active · locked in place</p>
          <h3 className="mt-1 text-lg font-bold text-white">{activeQuest.name}</h3>
          <p className="mt-1 text-sm text-slate-300">{activeQuest.focusedMinutes / 60} / 100 focused hours · started {activeQuest.startedAt}</p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-amber-400" style={{ width: `${(activeQuest.focusedMinutes / activeQuest.targetFocusMinutes) * 100}%` }} />
          </div>
          <div className="mt-3 space-y-1 text-sm text-amber-100">
            {modifier.cues.map((cue) => <p key={cue}>{cue}</p>)}
            {modifier.warmup.map((cue) => <p key={cue}>Warmup: {cue}</p>)}
            {modifier.restSeconds && <p>Gym rest timer: {modifier.restSeconds} seconds.</p>}
          </div>
        </div>
      )}

      <ol className="mt-5 space-y-2" aria-label="Reorderable season principles">
        {quests.map((quest, index) => {
          const locked = quest.status !== "planned";
          const canStart = quest.id === nextQuest?.id && !activeQuest;
          const seasonCue = SEASON_MODIFIERS[quest.sortOrder];
          return (
            <li
              key={quest.id}
              draggable={!locked}
              onDragStart={() => setDraggedId(quest.id)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => {
                if (draggedId) void reorder(draggedId, quest.id);
                setDraggedId(null);
              }}
              onDragEnd={() => setDraggedId(null)}
              className={`rounded-2xl border p-3 ${quest.status === "active" ? "border-amber-300/30 bg-amber-300/5" : "border-white/10 bg-black/15"} ${draggedId === quest.id ? "opacity-50" : ""}`}
            >
              <div className="flex items-start gap-3">
                <div className="flex flex-col gap-1" aria-label="Move unstarted quest">
                  <button
                    type="button"
                    disabled={locked || index === 0 || quests[index - 1].status !== "planned" || busyId === quest.id}
                    onClick={() => void reorder(quest.id, quests[index - 1].id)}
                    aria-label={`Move ${quest.name} up`}
                    className="rounded border border-white/10 px-2 text-sm text-slate-300 disabled:opacity-30"
                  >↑</button>
                  <button
                    type="button"
                    disabled={locked || index === quests.length - 1 || quests[index + 1].status !== "planned" || busyId === quest.id}
                    onClick={() => void reorder(quest.id, quests[index + 1].id)}
                    aria-label={`Move ${quest.name} down`}
                    className="rounded border border-white/10 px-2 text-sm text-slate-300 disabled:opacity-30"
                  >↓</button>
                </div>
                <div className="min-w-0 flex-1">
                  {editingId === quest.id ? (
                    <form
                      className="space-y-2"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void runAction(quest.id, async () => {
                          await onRename(quest, editName, editDescription);
                          setEditingId(null);
                        });
                      }}
                    >
                      <input aria-label="Principle name" value={editName} onChange={(event) => setEditName(event.target.value)} className="w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-white" />
                      <input aria-label="Principle description" value={editDescription} onChange={(event) => setEditDescription(event.target.value)} className="w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-white" />
                      <div className="flex gap-2">
                        <button type="submit" disabled={busyId === quest.id} className="rounded-lg bg-amber-400 px-3 py-1.5 text-sm font-bold text-zinc-950">Save</button>
                        <button type="button" onClick={() => setEditingId(null)} className="rounded-lg border border-white/10 px-3 py-1.5 text-sm text-slate-300">Cancel</button>
                      </div>
                    </form>
                  ) : (
                    <>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-bold text-white">{quest.name}</h3>
                        <span className="rounded-full border border-white/10 px-2 py-0.5 text-xs text-slate-400">Season {quest.sortOrder} · {seasonCue.name}</span>
                        <span className="text-xs uppercase tracking-wide text-slate-400">{quest.status}</span>
                      </div>
                      <p className="mt-1 text-sm text-slate-400">{quest.description}</p>
                    </>
                  )}
                </div>
                {quest.status === "planned" && editingId !== quest.id && (
                  <div className="flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(quest.id);
                        setEditName(quest.name);
                        setEditDescription(quest.description);
                      }}
                      className="rounded-lg border border-white/10 px-2 py-1 text-xs text-slate-300"
                    >Edit</button>
                    {canStart && (
                      <button
                        type="button"
                        disabled={busyId === quest.id}
                        onClick={() => void runAction(quest.id, () => onStart(quest))}
                        className="rounded-lg bg-amber-400 px-3 py-1.5 text-xs font-bold text-zinc-950 disabled:opacity-50"
                      >Start</button>
                    )}
                  </div>
                )}
                {quest.status === "completed" && <span aria-label="Completed" className="text-emerald-300">✓</span>}
              </div>
            </li>
          );
        })}
      </ol>
      {message && <p role="alert" className="mt-3 text-sm text-rose-200">{message}</p>}
    </section>
  );
}
