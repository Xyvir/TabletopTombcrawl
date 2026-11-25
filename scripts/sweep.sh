#!/usr/bin/env bash
#
# Run the corpus sweep under a hard memory lid.
#
# A sweep is the one job here that will happily take the whole machine: every worker runs a Vite module
# runner around a solver whose frontier holds thousands of boards, and four of them at once is enough to
# push an 8GB laptop to the point where nothing else opens. So the batch may not pass three quarters of the
# physical RAM in total, which means the per-worker heap is that share divided between the workers. A worker
# that overruns its share dies with an out-of-memory error instead of dragging the desktop down with it, and
# its shard keeps whatever it had already found.
#
# WORKERS=<n> SPAN=<seeds per worker> FROM=<first seed> to change the shape of the run. GOAL, ENGINE,
# STRATEGY and BUDGET pass through to the solver, so a fresh-seed sweep can run the plan arm on clears
# without a second copy of this script.
set -u
cd "$(dirname "$0")/.."

TOTAL_MB=$(powershell -NoProfile -Command '(Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory/1MB' | tr -d '\r' | cut -d. -f1)
WORKERS=${WORKERS:-3}
SPAN=${SPAN:-2000}
FROM=${FROM:-30001}
GOAL=${GOAL:-boss}
ENGINE=${ENGINE:-flat}
STRATEGY=${STRATEGY:-hybrid}
BUDGET=${BUDGET:-300000}
# MEM_MB is the most this batch may take together; it defaults to three quarters of the machine. Raise it
# for an overnight run nobody is sitting in front of, lower it when you are working beside the sweep — and
# when two sweeps run at once, give each of them a share of that, because the lid is per batch.
MEM_MB=${MEM_MB:-$(( TOTAL_MB * 3 / 4 ))}
HEAP_MB=$(( MEM_MB / WORKERS ))
# TAG keeps a second sweep's files beside the first one's instead of overwriting them.
TAG=${TAG:-}

mkdir -p corpus
for i in $(seq 0 $(( WORKERS - 1 ))); do
	start=$(( FROM + i * SPAN ))
	end=$(( start + SPAN - 1 ))
	VITE_HMR_PORT=$(( 24700 + i )) NODE_OPTIONS="--max-old-space-size=${HEAP_MB}" \
		MODE=scan FROM="$start" TO="$end" GOAL="$GOAL" ENGINE="$ENGINE" STRATEGY="$STRATEGY" BUDGET="$BUDGET" \
		OUT="corpus/scan-${TAG}w${i}.json" node scripts/run.mjs scripts/corpus.ts > "corpus/newlog-${TAG}${i}.txt" 2>&1 &
done

echo "sweep: ${WORKERS} workers, ${HEAP_MB}MB heap each (${MEM_MB}MB of ${TOTAL_MB}MB in total), seeds ${FROM}..$(( FROM + WORKERS * SPAN - 1 ))"
wait
echo SWEEPDONE
