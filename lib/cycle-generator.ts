export type SkateFamily =
  | "Flatground"
  | "Grinds"
  | "Slides"
  | "Manuals"
  | "Transition";

export type SkateStance = "Regular" | "Switch" | "Nollie" | "Fakie";

export type EligibleTrickStance = {
  trickId: string;
  family: SkateFamily;
  stance: SkateStance;
  sortOrder: number;
};

type PairRow = {
  first: EligibleTrickStance | null;
  second: EligibleTrickStance | null;
};

export type GeneratedCycleSession = {
  sessionNumber: number;
  supersetA: {
    regular: EligibleTrickStance | null;
    switch: EligibleTrickStance | null;
  };
  supersetB: {
    nollie: EligibleTrickStance | null;
    fakie: EligibleTrickStance | null;
  };
};

const STANCES: SkateStance[] = ["Regular", "Switch", "Nollie", "Fakie"];

function randomValue(random: () => number) {
  return Math.min(0.999999, Math.max(0, random()));
}

function shuffle<T>(values: T[], random: () => number) {
  const shuffled = [...values];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(randomValue(random) * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

function buildPairRows(
  first: EligibleTrickStance[],
  second: EligibleTrickStance[],
  random: () => number,
): PairRow[] {
  const secondByTrick = new Map(second.map((assignment) => [assignment.trickId, assignment]));
  const matchedIds = new Set<string>();
  const rows: PairRow[] = [];

  for (const assignment of shuffle(first, random)) {
    const mirror = secondByTrick.get(assignment.trickId);
    if (!mirror) continue;
    matchedIds.add(assignment.trickId);
    rows.push({ first: assignment, second: mirror });
  }

  const unmatchedFirst = shuffle(
    first.filter((assignment) => !matchedIds.has(assignment.trickId)),
    random,
  );
  const unmatchedSecond = shuffle(
    second.filter((assignment) => !matchedIds.has(assignment.trickId)),
    random,
  );
  const unmatchedCount = Math.max(unmatchedFirst.length, unmatchedSecond.length);

  for (let index = 0; index < unmatchedCount; index += 1) {
    rows.push({
      first: unmatchedFirst[index] ?? null,
      second: unmatchedSecond[index] ?? null,
    });
  }

  return rows;
}

function rowAssignments(row: PairRow | null) {
  return [row?.first ?? null, row?.second ?? null].filter(
    (assignment): assignment is EligibleTrickStance => assignment !== null,
  );
}

function arrangeSessionRows(
  supersetARows: PairRow[],
  supersetBRows: PairRow[],
  random: () => number,
) {
  const remainingA = shuffle(supersetARows, random);
  const remainingB = shuffle(supersetBRows, random);
  const sessions: { supersetA: PairRow | null; supersetB: PairRow | null }[] = [];
  const familyCounts = new Map<SkateFamily, number>();

  while (remainingA.length || remainingB.length) {
    let bestCost = Number.POSITIVE_INFINITY;
    let bestPairs: { aIndex: number | null; bIndex: number | null }[] = [];

    const aCandidates: (number | null)[] = remainingA.length
      ? remainingA.map((_, index) => index)
      : [null];
    const bCandidates: (number | null)[] = remainingB.length
      ? remainingB.map((_, index) => index)
      : [null];

    for (const aIndex of aCandidates) {
      for (const bIndex of bCandidates) {
        const rowA = aIndex === null ? null : remainingA[aIndex];
        const rowB = bIndex === null ? null : remainingB[bIndex];
        const assignments = [...rowAssignments(rowA), ...rowAssignments(rowB)];
        const sameTrickPenalty = rowAssignments(rowA).some((assignment) =>
          rowAssignments(rowB).some((other) => other.trickId === assignment.trickId),
        ) ? 10000 : 0;
        const duplicatedFamilyPenalty = assignments.length > 1
          ? assignments.length - new Set(assignments.map((assignment) => assignment.family)).size
          : 0;
        const cost = sameTrickPenalty
          + duplicatedFamilyPenalty * 10
          + assignments.reduce(
            (total, assignment) => total + (familyCounts.get(assignment.family) ?? 0),
            0,
          );
        if (cost < bestCost) {
          bestCost = cost;
          bestPairs = [{ aIndex, bIndex }];
        } else if (cost === bestCost) {
          bestPairs.push({ aIndex, bIndex });
        }
      }
    }

    const choiceIndex = Math.floor(randomValue(random) * bestPairs.length);
    const choice = bestPairs[choiceIndex];
    const rowA = choice.aIndex === null ? null : remainingA.splice(choice.aIndex, 1)[0];
    const rowB = choice.bIndex === null ? null : remainingB.splice(choice.bIndex, 1)[0];
    sessions.push({ supersetA: rowA, supersetB: rowB });

    for (const assignment of [...rowAssignments(rowA), ...rowAssignments(rowB)]) {
      familyCounts.set(assignment.family, (familyCounts.get(assignment.family) ?? 0) + 1);
    }
  }

  return sessions;
}

export function generateCycleSessions(
  eligibleAssignments: EligibleTrickStance[],
  random: () => number = Math.random,
): GeneratedCycleSession[] {
  const assignmentsByStance = new Map<SkateStance, EligibleTrickStance[]>(
    STANCES.map((stance) => [stance, []]),
  );
  const seen = new Set<string>();

  for (const assignment of eligibleAssignments) {
    const key = `${assignment.trickId}:${assignment.stance}`;
    if (seen.has(key)) {
      throw new Error(`Duplicate eligible trick and stance: ${key}`);
    }
    seen.add(key);
    assignmentsByStance.get(assignment.stance)?.push(assignment);
  }

  const supersetARows = buildPairRows(
    assignmentsByStance.get("Regular") ?? [],
    assignmentsByStance.get("Switch") ?? [],
    random,
  );
  const supersetBRows = buildPairRows(
    assignmentsByStance.get("Nollie") ?? [],
    assignmentsByStance.get("Fakie") ?? [],
    random,
  );
  const arrangedSessions = arrangeSessionRows(supersetARows, supersetBRows, random);

  return arrangedSessions.map((session, index) => {
    const supersetA = session.supersetA;
    const supersetB = session.supersetB;
    return {
      sessionNumber: index + 1,
      supersetA: {
        regular: supersetA?.first ?? null,
        switch: supersetA?.second ?? null,
      },
      supersetB: {
        nollie: supersetB?.first ?? null,
        fakie: supersetB?.second ?? null,
      },
    };
  });
}
