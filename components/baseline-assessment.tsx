"use client";

import { ArrowLeft, ArrowRight, Check, Footprints, RotateCcw, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { getLevelData } from "@/lib/game";
import type {
  ProgressionSnapshot,
  Stance,
  StanceComfortRatings,
  Trick,
} from "@/lib/progression";

type TrickAssessment = {
  highestTier: number;
  workingOnNext: boolean;
};

export type BaselineSubmission = {
  stanceComfort: StanceComfortRatings;
  trickAssessments: {
    trickId: string;
    highestTier: number;
    workingOnNext: boolean;
  }[];
  microSkillHours: {
    microSkillId: string;
    hours: number;
  }[];
};

const STANCES: Stance[] = ["Regular", "Fakie", "Nollie", "Switch"];
const FLAT_TIERS = ["None", "T1 Flat", "T2 2-Stair", "T3 4-Stair", "T4 6-Stair", "T5 8-Stair", "T6 10+"];
const LEDGE_TIERS = ["None", "T1 Curb", "T2 Shin", "T3 Knee", "T4 Mid-thigh", "T5 Hip", "T6 Tech"];
const RAIL_TIERS = ["None", "T1 Floor bar", "T2 Knee bar", "T3 Thigh bar", "T4 Small down-rail", "T5 Medium down-rail", "T6 Handrail"];

function initialAssessments(snapshot: ProgressionSnapshot) {
  return Object.fromEntries(snapshot.tricks.map((trick) => {
    const trickProgress = snapshot.progress.filter((progress) => progress.trick_id === trick.id);
    const highestTier = trickProgress.reduce(
      (highest, progress) => progress.score === 3 ? Math.max(highest, progress.tier) : highest,
      0,
    );
    const nextTier = trickProgress.find((progress) => progress.tier === highestTier + 1);
    return [trick.id, {
      highestTier,
      workingOnNext: Boolean(nextTier && nextTier.score > 0),
    }];
  }));
}

function formatTrickName(trick: Trick) {
  return `${trick.direction === "none" ? "" : `${trick.direction} `}${trick.name}`;
}

function getTrickGroups(tricks: Trick[], includeDirection: boolean) {
  const groups = new Map<string, Trick[]>();
  for (const trick of tricks) {
    const key = includeDirection ? `${trick.direction} ${trick.name}` : trick.name;
    groups.set(key, [...(groups.get(key) ?? []), trick]);
  }
  return [...groups.entries()].sort((first, second) =>
    Math.min(...first[1].map((trick) => trick.sort_order)) -
    Math.min(...second[1].map((trick) => trick.sort_order)),
  );
}

export default function BaselineAssessment({
  snapshot,
  busy,
  error,
  onDismissError,
  onSubmit,
}: {
  snapshot: ProgressionSnapshot;
  busy: boolean;
  error: string;
  onDismissError: () => void;
  onSubmit: (input: BaselineSubmission) => void | Promise<void>;
}) {
  const [step, setStep] = useState(1);
  const [stanceComfort] = useState<StanceComfortRatings>(
    () => snapshot.baseline?.stance_comfort ?? {
      Regular: "Solid",
      Fakie: "Solid",
      Nollie: "Solid",
      Switch: "Solid",
    },
  );
  const [assessments, setAssessments] = useState<Record<string, TrickAssessment>>(
    () => initialAssessments(snapshot),
  );
  const [stanceTab, setStanceTab] = useState<Stance>("Regular");
  const [grindCategory, setGrindCategory] = useState<"ledge" | "rail">("ledge");
  const [skillHours, setSkillHours] = useState<Record<string, number>>(() =>
    Object.fromEntries(snapshot.microSkills.map((skill) => [
      skill.id,
      Math.min(50, Math.round(skill.logged_minutes / 30) / 2),
    ])),
  );

  const flatGroups = useMemo(
    () => getTrickGroups(snapshot.tricks.filter((trick) => trick.category === "flat_gap"), false),
    [snapshot.tricks],
  );
  const grindGroups = useMemo(
    () => getTrickGroups(
      snapshot.tricks.filter((trick) => trick.category === grindCategory && trick.stance === stanceTab),
      true,
    ),
    [snapshot.tricks, stanceTab, grindCategory],
  );
  const summary = useMemo(() => {
    const mastered = Object.values(assessments).reduce((sum, assessment) => sum + assessment.highestTier, 0);
    const scorePoints = Object.values(assessments).reduce(
      (sum, assessment) => sum + assessment.highestTier * 3 + Number(assessment.workingOnNext),
      0,
    );
    const ready = Object.values(assessments).filter((assessment) => assessment.highestTier < 6).length;
    const totalXp = scorePoints * 100;
    return { mastered, ready, totalXp, level: getLevelData(totalXp).level };
  }, [assessments]);

  const assessmentComplete = snapshot.tricks.length === 140 &&
    snapshot.progress.length >= 840 &&
    snapshot.microSkills.length === 7;

  function updateAssessment(trickId: string, value: TrickAssessment) {
    setAssessments((current) => ({ ...current, [trickId]: value }));
  }

  function markRemainingStancesUnrated() {
    setAssessments((current) => {
      const next = { ...current };
      snapshot.tricks
        .filter((trick) => trick.category === grindCategory && trick.stance !== stanceTab)
        .forEach((trick) => { next[trick.id] = { highestTier: 0, workingOnNext: false }; });
      return next;
    });
  }

  function submitBaseline() {
    if (!assessmentComplete) return;
    void onSubmit({
      stanceComfort: stanceComfort as StanceComfortRatings,
      trickAssessments: snapshot.tricks.map((trick) => ({
        trickId: trick.id,
        highestTier: assessments[trick.id]?.highestTier ?? 0,
        workingOnNext: assessments[trick.id]?.workingOnNext ?? false,
      })),
      microSkillHours: snapshot.microSkills.map((skill) => ({
        microSkillId: skill.id,
        hours: skillHours[skill.id] ?? 0,
      })),
    });
  }

  return (
    <main className="progression-app progression-baseline-app">
      <section className="progression-baseline-shell" aria-labelledby="baseline-title">
        <header className="progression-header">
          <div className="progression-wordmark">
            <div className="progression-brand-mark"><Footprints size={21} /></div>
            <div>
              <p className="progression-eyebrow">Skate / Progress</p>
              <h1 id="baseline-title">{snapshot.baseline ? "Recalibrate baseline" : "Starting baseline"}</h1>
            </div>
          </div>
          <span className="progression-baseline-step">{step} / 4</span>
        </header>

        {error && (
          <div className="progression-error" role="alert">
            <span>{error}</span>
            <button aria-label="Dismiss error" onClick={onDismissError}>×</button>
          </div>
        )}

        <div className="progression-baseline-progress" aria-label={`Assessment step ${step} of 4`}>
          {[1, 2, 3, 4].map((item) => <span key={item} className={item <= step ? "is-current" : ""} />)}
        </div>

        {step === 1 && (
          <div className="progression-baseline-body">
            <p className="progression-eyebrow">Step 1 · about 30 seconds</p>
            <h2>Where are you starting from?</h2>
            <p className="progression-modal-lede">Credit hours you have already put into each micro-skill toward its 100-hour goal.</p>

            <section className="progression-baseline-section">
              <div className="progression-baseline-section-heading">
                <h3>Micro-skill hours</h3>
                <span>0–50 each</span>
              </div>
              {snapshot.microSkills.map((skill) => (
                <label className="progression-hours-row" key={skill.id}>
                  <span><strong>{skill.name}</strong><output>{(skillHours[skill.id] ?? 0).toFixed(1)} hrs</output></span>
                  <input
                    type="range"
                    min={0}
                    max={50}
                    step={0.5}
                    value={skillHours[skill.id] ?? 0}
                    aria-label={`${skill.name} prior hours`}
                    onChange={(event) => setSkillHours((current) => ({
                      ...current,
                      [skill.id]: Number(event.target.value),
                    }))}
                  />
                </label>
              ))}
            </section>

            <button className="progression-primary-button" onClick={() => setStep(2)}>
              Flatground & gaps <ArrowRight size={17} />
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="progression-baseline-body">
            <p className="progression-eyebrow">Step 2 · 28 tricks</p>
            <h2>Flatground & gaps</h2>
            <p className="progression-modal-lede">For each trick and stance, pick the highest tier you have mastered with three clean makes in a row.</p>
            <div className="progression-baseline-trick-list">
              {flatGroups.map(([name, tricks]) => (
                <section className="progression-baseline-trick-group" key={name}>
                  <h3>{name}</h3>
                  {tricks.map((trick) => (
                    <BaselineTrickRow
                      key={trick.id}
                      trick={trick}
                      tiers={FLAT_TIERS}
                      assessment={assessments[trick.id] ?? { highestTier: 0, workingOnNext: false }}
                      onChange={(value) => updateAssessment(trick.id, value)}
                    />
                  ))}
                </section>
              ))}
            </div>
            <div className="progression-baseline-actions">
              <button className="progression-secondary-button" onClick={() => setStep(1)}><ArrowLeft size={16} /> Back</button>
              <button className="progression-primary-button" onClick={() => setStep(3)}>Ledges & rails <ArrowRight size={17} /></button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="progression-baseline-body">
            <p className="progression-eyebrow">Step 3 · 112 tricks</p>
            <h2>Ledges & rails</h2>
            <p className="progression-modal-lede">Choose a category and stance. Unrated tricks stay at zero; you can clear the other stances with one tap.</p>
            <div className="progression-stance-tabs" role="tablist" aria-label="Ledges or rails">
              {(["ledge", "rail"] as const).map((category) => (
                <button
                  key={category}
                  type="button"
                  role="tab"
                  aria-selected={grindCategory === category}
                  className={grindCategory === category ? "is-selected" : ""}
                  onClick={() => setGrindCategory(category)}
                >
                  {category === "ledge" ? "Ledges" : "Rails"}
                </button>
              ))}
            </div>
            <div className="progression-stance-tabs" role="tablist" aria-label={`${grindCategory} stance`}>
              {STANCES.map((stance) => (
                <button
                  key={stance}
                  type="button"
                  role="tab"
                  aria-selected={stanceTab === stance}
                  className={stanceTab === stance ? "is-selected" : ""}
                  onClick={() => setStanceTab(stance)}
                >
                  {stance}
                </button>
              ))}
            </div>
            <button className="progression-reset-stance" onClick={markRemainingStancesUnrated}>
              <RotateCcw size={15} /> Set remaining stances to 0
            </button>
            <div className="progression-baseline-trick-list">
              {grindGroups.map(([name, tricks]) => (
                <section className="progression-baseline-trick-group" key={name}>
                  <h3>{name}</h3>
                  {tricks.map((trick) => (
                    <BaselineTrickRow
                      key={trick.id}
                      trick={trick}
                      tiers={grindCategory === "ledge" ? LEDGE_TIERS : RAIL_TIERS}
                      assessment={assessments[trick.id] ?? { highestTier: 0, workingOnNext: false }}
                      onChange={(value) => updateAssessment(trick.id, value)}
                    />
                  ))}
                </section>
              ))}
            </div>
            <div className="progression-baseline-actions">
              <button className="progression-secondary-button" onClick={() => setStep(2)}><ArrowLeft size={16} /> Back</button>
              <button className="progression-primary-button" onClick={() => setStep(4)}>Review baseline <ArrowRight size={17} /></button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="progression-baseline-body progression-baseline-summary">
            <p className="progression-eyebrow">Step 4 · character card</p>
            <h2>Your starting point.</h2>
            <p className="progression-modal-lede">These mastered tiers are credited now. The next unlocked tier for each trick will be ready for your cycle.</p>
            <section className="progression-baseline-level-card">
              <div><span>Starting skate level</span><strong>{summary.level}</strong></div>
              <div><span>Total skate XP</span><strong>{summary.totalXp.toLocaleString()}</strong></div>
              <small>Calculated at 100 XP per progression score point.</small>
            </section>
            <section className="progression-baseline-counts">
              <div><strong>{summary.mastered}</strong><span>Tiers mastered</span></div>
              <div><strong>{summary.ready}</strong><span>Next tiers unlocked</span></div>
            </section>
            <div className="progression-modal-footnote"><Sparkles size={16} /><span>Prior tiers will be marked mastered automatically. Current work on the next tier starts at score 1.</span></div>
            {!assessmentComplete && (
              <div className="progression-error" role="alert">
                <span>The catalog or progress data is incomplete. Check your database setup before saving.</span>
              </div>
            )}
            <div className="progression-baseline-actions">
              <button className="progression-secondary-button" disabled={busy} onClick={() => setStep(3)}><ArrowLeft size={16} /> Back</button>
              <button className="progression-primary-button" disabled={!assessmentComplete || busy} onClick={submitBaseline}>
                {busy ? "Saving baseline..." : "Save Baseline & Pick Cycle"} <Check size={17} />
              </button>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

function BaselineTrickRow({
  trick,
  tiers,
  assessment,
  onChange,
}: {
  trick: Trick;
  tiers: string[];
  assessment: TrickAssessment;
  onChange: (assessment: TrickAssessment) => void;
}) {
  return (
    <div className="progression-baseline-trick-row">
      <strong>{formatTrickName(trick)} <small>{trick.stance}</small></strong>
      <div className="progression-tier-pills" role="group" aria-label={`${formatTrickName(trick)} ${trick.stance} highest mastered tier`}>
        {tiers.map((label, index) => (
          <button
            key={label}
            type="button"
            aria-pressed={assessment.highestTier === index}
            className={assessment.highestTier === index ? "is-selected" : ""}
            onClick={() => onChange({
              highestTier: index,
              workingOnNext: assessment.workingOnNext && index < 6,
            })}
          >
            {label}
          </button>
        ))}
      </div>
      {assessment.highestTier < 6 && (
        <label className="progression-next-tier-toggle">
          <input
            type="checkbox"
            checked={assessment.workingOnNext}
            onChange={(event) => onChange({ ...assessment, workingOnNext: event.target.checked })}
          />
          <span className="progression-checkbox"><Check size={13} /></span>
          Currently working on T{assessment.highestTier + 1}
        </label>
      )}
    </div>
  );
}
