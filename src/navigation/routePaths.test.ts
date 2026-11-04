import { describe, expect, it } from "vitest";
// The source text, not the module: `Navigation.tsx` declares its routes in JSX and exports nothing to compare.
import navigationSource from "../Navigation.tsx?raw";
import { ROUTES, type RouteMeta } from "./routes";

/**
 * Paths Navigation.tsx declares with no route-table entry: the catch-all and the redirects from the old
 * benchmark URLs. Each must still be declared, so this list cannot keep a path Navigation has dropped.
 */
const NAVIGATION_ONLY_PATHS = ["*", "/benchmark", "/prompt-benchmark/*"];

/** Every `path="..."` attribute in Navigation.tsx, in source order. */
const declaredPaths = [...navigationSource.matchAll(/\bpath="([^"]+)"/g)].map((match) => match[1]);

function tablePathsOf(routes: readonly RouteMeta[]): string[] {
  return routes.flatMap((route) => [route.path, ...tablePathsOf(route.children ?? [])]);
}

/**
 * The route table (sidebar, landings, breadcrumbs) and Navigation.tsx (what actually renders) each list the
 * paths. Keeping one list would mean rebuilding Navigation from data, so instead this test compares the two
 * texts: a page added or renamed on one side only fails here. Navigation's paths are absolute so they can be
 * compared as written.
 */
describe("route table and Navigation.tsx", () => {
  const tablePaths = tablePathsOf(ROUTES);

  it("declares every route-table path in Navigation.tsx", () => {
    const undeclared = tablePaths.filter((path) => !declaredPaths.includes(path));
    expect(undeclared).toEqual([]);
  });

  it("has a route-table entry for every path Navigation.tsx declares, apart from the known extras", () => {
    const unlisted = declaredPaths.filter(
      (path) => !tablePaths.includes(path) && !NAVIGATION_ONLY_PATHS.includes(path),
    );
    expect(unlisted).toEqual([]);
  });

  it("still declares each known extra path", () => {
    const stale = NAVIGATION_ONLY_PATHS.filter((path) => !declaredPaths.includes(path));
    expect(stale).toEqual([]);
  });
});
