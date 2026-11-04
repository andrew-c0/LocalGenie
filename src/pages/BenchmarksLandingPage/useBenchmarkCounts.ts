import { useEffect, useState } from "react";
import {
  listBenchmarkPrompts,
  listBenchmarkRuns,
  listBenchmarkSuites,
} from "../../services/benchmark";
import { countLabel } from "../../utils/format";

interface CountedList {
  /** The landing row the count belongs to. */
  routeId: string;
  read: () => Promise<readonly unknown[]>;
  singular: string;
  plural: string;
}

const COUNTED_LISTS: CountedList[] = [
  {
    routeId: "benchmarks-prompts",
    read: listBenchmarkPrompts,
    singular: "prompt",
    plural: "prompts",
  },
  { routeId: "benchmarks-suites", read: listBenchmarkSuites, singular: "suite", plural: "suites" },
  { routeId: "benchmarks-runs", read: listBenchmarkRuns, singular: "run", plural: "runs" },
];

/**
 * The live fact on each Benchmarks landing row ("3 prompts"), keyed by route id. Each list is read once
 * on mount. A row has no fact while its list loads, and none if the read fails.
 */
export function useBenchmarkCounts(): Record<string, string> {
  const [facts, setFacts] = useState<Record<string, string>>({});

  useEffect(() => {
    let active = true;
    for (const counted of COUNTED_LISTS) {
      counted
        .read()
        .then((items) => {
          if (!active) return;
          const label = countLabel(items.length, counted.singular, counted.plural);
          setFacts((current) => ({ ...current, [counted.routeId]: label }));
        })
        .catch(() => undefined);
    }
    return () => {
      active = false;
    };
  }, []);

  return facts;
}
