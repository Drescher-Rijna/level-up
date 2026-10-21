"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import type { BenchmarkLog, SeasonQuest } from "@/lib/state-types";
import { getCurrentDateKey } from "@/lib/game";
import { BENCHMARK_GOALS, getDueBenchmarkQuests } from "@/lib/training-program";

export default function BenchmarksDashboard({
  quests,
  defaultQuest,
  logs,
  onSave,
}: {
  quests: SeasonQuest[];
  defaultQuest?: SeasonQuest;
  logs: BenchmarkLog[];
  onSave: (entry: { questId: string; metric: string; value: number; notes: string; testedAt: string }) => Promise<void>;
}) {
  const [selectedQuestId, setSelectedQuestId] = useState("");
  const [metric, setMetric] = useState<string>(BENCHMARK_GOALS[0].id);
  const [value, setValue] = useState("");
  const [notes, setNotes] = useState("");
  const [testedAt, setTestedAt] = useState(getCurrentDateKey());
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const dueQuests = getDueBenchmarkQuests(quests, logs);
  const selectedQuest = quests.find((item) => item.id === selectedQuestId) ??
    dueQuests[0] ?? defaultQuest;
  const metricDefinition = BENCHMARK_GOALS.find((goal) => goal.id === metric) ?? BENCHMARK_GOALS[0];

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsedValue = Number(value);
    if (!selectedQuest || !Number.isFinite(parsedValue) || parsedValue < 0) {
      setMessage("Choose an active or completed season and enter a non-negative test result.");
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      await onSave({ questId: selectedQuest.id, metric, value: parsedValue, notes: notes.trim(), testedAt });
      setMessage("Benchmark result saved.");
      setValue("");
      setNotes("");
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="space-y-6">
      <section className="rounded-3xl border border-white/10 bg-[#111214] p-5">
        <p className="text-xs uppercase tracking-[0.3em] text-amber-300">Progress testing</p>
        <h2 className="mt-2 text-2xl font-black text-white">Benchmarks</h2>
        <p className="mt-1 text-sm text-slate-300">Record results by date and season. Units and criteria are shown with each goal.</p>
        {dueQuests.map((quest) => (
          <div key={quest.id} role="alert" className="mt-4 rounded-2xl border border-amber-300/40 bg-amber-300/10 p-4 text-amber-100">
            Season {quest.sortOrder} benchmark testing is due. Test at six weeks or 100 focused hours, whichever comes first.
          </div>
        ))}
        {!selectedQuest && <p className="mt-4 rounded-xl border border-white/10 p-3 text-sm text-slate-300">Start a season quest to associate benchmark results with a season.</p>}
        {selectedQuest && (
          <label className="mt-3 block text-sm text-slate-300">
            Testing season
            <select value={selectedQuest.id} onChange={(event) => setSelectedQuestId(event.target.value)} className="mt-1 block w-full rounded-xl border border-white/10 bg-zinc-950 px-3 py-2 text-white">
              {quests.filter((item) => item.status !== "planned").map((item) => (
                <option key={item.id} value={item.id}>Season {item.sortOrder} · {item.name}</option>
              ))}
            </select>
          </label>
        )}
      </section>

      <section className="rounded-3xl border border-white/10 bg-[#111214] p-5">
        <h3 className="text-xl font-bold text-white">Targets</h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {BENCHMARK_GOALS.map((goal) => {
            const latest = logs.find((entry) => entry.metric === goal.id);
            return (
              <article key={goal.id} className="rounded-2xl border border-white/10 bg-black/15 p-4">
                <h4 className="font-bold text-white">{goal.name}</h4>
                <p className="mt-1 text-sm text-amber-200">{goal.target}</p>
                <p className="mt-1 text-xs text-slate-400">
                  Record in {goal.unit}{goal.id === "hip-pancake" ? " (1 = pass, 0 = not yet)" : ""}
                  {latest ? ` · Latest: ${latest.value} ${goal.unit} on ${latest.testedAt}` : " · No result logged"}
                </p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="rounded-3xl border border-white/10 bg-[#111214] p-5">
        <h3 className="text-xl font-bold text-white">Log a test</h3>
        <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={(event) => void save(event)}>
          <label className="text-sm text-slate-300">
            Benchmark
            <select value={metric} onChange={(event) => setMetric(event.target.value)} className="mt-1 block w-full rounded-xl border border-white/10 bg-zinc-950 px-3 py-2 text-white">
              {BENCHMARK_GOALS.map((goal) => <option key={goal.id} value={goal.id}>{goal.name}</option>)}
            </select>
          </label>
          <label className="text-sm text-slate-300">
            Result ({metricDefinition.unit})
            <input type="number" min={0} step="any" value={value} onChange={(event) => setValue(event.target.value)} required className="mt-1 block w-full rounded-xl border border-white/10 bg-zinc-950 px-3 py-2 text-white" />
          </label>
          <label className="text-sm text-slate-300">
            Test date
            <input type="date" value={testedAt} onChange={(event) => setTestedAt(event.target.value)} required className="mt-1 block w-full rounded-xl border border-white/10 bg-zinc-950 px-3 py-2 text-white" />
          </label>
          <label className="text-sm text-slate-300">
            Notes (e.g. bodyweight, reps, pain)
            <input value={notes} onChange={(event) => setNotes(event.target.value)} className="mt-1 block w-full rounded-xl border border-white/10 bg-zinc-950 px-3 py-2 text-white" />
          </label>
          <div className="sm:col-span-2">
            <button type="submit" disabled={!selectedQuest || saving} className="rounded-xl bg-amber-400 px-4 py-2.5 font-bold text-zinc-950 disabled:opacity-50">{saving ? "Saving…" : "Save benchmark"}</button>
            {message && <p role="status" className="mt-2 text-sm text-slate-300">{message}</p>}
          </div>
        </form>
      </section>

      <section className="rounded-3xl border border-white/10 bg-[#111214] p-5">
        <h3 className="text-xl font-bold text-white">Test history</h3>
        {logs.length === 0 ? <p className="mt-2 text-sm text-slate-400">Logged benchmark results will appear here.</p> : (
          <ul className="mt-3 space-y-2">
            {logs.map((entry) => (
              <li key={entry.id} className="rounded-xl border border-white/10 px-3 py-2 text-sm">
                <span className="font-semibold text-white">{BENCHMARK_GOALS.find((goal) => goal.id === entry.metric)?.name ?? entry.metric}</span>
                <span className="ml-2 text-amber-200">{entry.value}</span>
                <span className="ml-2 text-slate-400">Season {entry.seasonOrder} · {entry.testedAt}</span>
                {entry.notes && <p className="mt-1 text-slate-400">{entry.notes}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
