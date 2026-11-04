import { generatePath, matchPath } from "react-router-dom";
import { OVERVIEW_ROUTE, ROUTES, type RouteMeta } from "./routes";

/** One breadcrumb: the label shown and the path it links to. */
export interface Crumb {
  label: string;
  to: string;
}

type Params = Readonly<Record<string, string | undefined>>;

interface RouteMatch {
  /** The matched route and its parents, from the top-level section down. */
  chain: RouteMeta[];
  params: Params;
}

/** A path segment decoded for display. `matchPath` leaves the parameters encoded; a bad escape stays as it is. */
function decodeSegment(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** The route whose path matches the pathname exactly, with the chain of routes above it. */
function matchRoute(
  routes: readonly RouteMeta[],
  pathname: string,
  parents: RouteMeta[] = [],
): RouteMatch | null {
  for (const route of routes) {
    const chain = [...parents, route];
    const match = matchPath({ path: route.path, end: true }, pathname);
    if (match) {
      const params = Object.fromEntries(
        Object.entries(match.params).map(([key, value]) => [key, decodeSegment(value)]),
      );
      return { chain, params };
    }
    const inChildren = route.children ? matchRoute(route.children, pathname, chain) : null;
    if (inChildren) return inChildren;
  }
  return null;
}

/** The route with this id, at any depth. */
function findRoute(routes: readonly RouteMeta[], id: string): RouteMeta | undefined {
  for (const route of routes) {
    if (route.id === id) return route;
    const inChildren = route.children ? findRoute(route.children, id) : undefined;
    if (inChildren) return inChildren;
  }
  return undefined;
}

/** The route with this id, at any depth, for a page that shows its own route's label. */
export function routeById(id: string): RouteMeta | undefined {
  return findRoute(ROUTES, id);
}

/** The parameter names in a path pattern, in order (`/models/local/:repoId` gives `repoId`). */
function paramNamesOf(path: string): string[] {
  return path
    .split("/")
    .filter((segment) => segment.startsWith(":"))
    .map((segment) => segment.slice(1));
}

/**
 * The label of one crumb. A route with a parameter defaults to its last parameter's decoded value
 * (an installed model's repo id), so a detail page reads as the item it shows. A `titleCrumb` route
 * shows its title instead (an opaque id is never a label), and so does any route without a parameter.
 */
function labelOf(route: RouteMeta, params: Params): string {
  if (route.titleCrumb) return route.title;
  const names = paramNamesOf(route.path);
  const lastName = names.length > 0 ? names[names.length - 1] : undefined;
  return lastName === undefined ? route.title : (params[lastName] ?? route.title);
}

/** `generatePath` takes `null` for an empty parameter, not `undefined`. */
function paramsForPath(params: Params): Record<string, string | null> {
  return Object.fromEntries(Object.entries(params).map(([key, value]) => [key, value ?? null]));
}

/**
 * Breadcrumbs for a pathname, from the route table. A landing or top-level page gives one crumb
 * (the page itself), so the layout shows no trail there. A pathname the table does not know gives none.
 */
export function breadcrumbsFor(pathname: string): Crumb[] {
  const found = matchRoute(ROUTES, pathname);
  if (!found) return [];
  return found.chain.map((route) => ({
    label: labelOf(route, found.params),
    to: generatePath(route.path, paramsForPath(found.params)),
  }));
}

/** The sub-pages of a route: the cards on its landing. Empty for an unknown id or a route with none. */
export function childrenOf(id: string): RouteMeta[] {
  return routeById(id)?.children ?? [];
}

/**
 * The top-level section a pathname belongs to, for the sidebar's highlighted item. Any sub-route of
 * a section counts. Anything else (including `/`) is the Overview.
 */
export function sectionOf(pathname: string): RouteMeta {
  const section = ROUTES.find(
    (route) =>
      route !== OVERVIEW_ROUTE &&
      (pathname === route.path || pathname.startsWith(`${route.path}/`)),
  );
  return section ?? OVERVIEW_ROUTE;
}
