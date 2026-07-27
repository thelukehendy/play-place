/**
 * Stress-test Inertia board generation: every round for many seeds must be solvable.
 * Run: npx --yes tsx scripts/test-inertia-solvability.ts
 */
import { buildRound, isSolvable, countGems, ROUNDS, configForRound } from '../src/games/inertia/engine.ts';

const SEEDS = 200;
let fails = 0;
let total = 0;
const stopCounts: number[] = [];
const gemCounts: number[] = [];

for (let s = 1; s <= SEEDS; s++) {
  for (let round = 0; round < ROUNDS; round++) {
    total++;
    const board = buildRound(s * 10007 + 13, round);
    const gems = countGems(board.hasGem);
    const stops = board.cells.filter((c) => c === 'stop').length;
    gemCounts.push(gems);
    stopCounts.push(stops);
    const ok = gems > 0 && isSolvable(board);
    if (!ok) {
      fails++;
      console.error(`FAIL seed=${s} round=${round + 1} gems=${gems} stops=${stops} size=${board.size}`);
    }
  }
}

const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
console.log(`Checked ${total} boards (${SEEDS} seeds × ${ROUNDS} rounds)`);
console.log(`Failures: ${fails}`);
console.log(`Avg gems: ${avg(gemCounts).toFixed(2)} | Avg stops: ${avg(stopCounts).toFixed(2)}`);
for (let r = 0; r < ROUNDS; r++) {
  const cfg = configForRound(r);
  console.log(`  Round ${r + 1} target gems=${cfg.gems} stops=${cfg.stops} size=${cfg.size}`);
}

// Extra: same seed as a “play session” — all 5 rounds
let sessionFails = 0;
for (let s = 0; s < 500; s++) {
  const seed = (s * 0x9e3779b9) >>> 0 || 1;
  for (let round = 0; round < ROUNDS; round++) {
    const board = buildRound(seed, round);
    if (!isSolvable(board) || countGems(board.hasGem) === 0) {
      sessionFails++;
      console.error(`SESSION FAIL seed=${seed} round=${round + 1}`);
    }
  }
}
console.log(`Session sweep: ${500 * ROUNDS} boards, failures=${sessionFails}`);

if (fails + sessionFails > 0) {
  process.exit(1);
}
console.log('All boards solvable.');
