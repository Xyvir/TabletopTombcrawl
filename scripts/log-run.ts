/**
 * Append-only log of every experiment run: one JSON object per line, so a later tuner can read
 * the whole history without re-paying for it.
 *
 * Each record carries the run's configuration, a snapshot of the solver's weights as they were,
 * and the per-seed outcomes — the three things a "what did we already try" question needs. The
 * file lives in `corpus/` (gitignored, like the shards): working history, not published artifact.
 * Point RUNS_LOG elsewhere to keep a probe out of the real log.
 */
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export interface RunRecord {
	/** What produced the record: the script's filename, e.g. `ab`. */
	tool: string;
	/** Budget, goal, engine, variants — everything that makes this run different from another. */
	config: Record<string, unknown>;
	/** The solver's weights as they were when the run started. */
	weights: Record<string, unknown>;
	/** One outcome per seed, in whatever shape the tool already keeps. */
	seeds: unknown[];
}

export function logRun(record: RunRecord): string {
	const path = process.env.RUNS_LOG || 'corpus/runs.jsonl';
	mkdirSync(dirname(path), { recursive: true });
	appendFileSync(path, JSON.stringify({ at: new Date().toISOString(), ...record }) + '\n');
	return path;
}
