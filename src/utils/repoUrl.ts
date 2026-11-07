/**
 * Turns the repo-relative paths of a Hugging Face model card (`assets/x.png`, `./img.jpg`, `../up.png`,
 * `<img src>`, `srcset`) into Hub URLs, so they load in the app instead of resolving against the app's own
 * origin. Pure functions; the HTML walk mutates the parsed tree it is given.
 */

const HUB_ORIGIN = "https://huggingface.co";

/** Hub sections a leading `/` names on the site (`/spaces/...`), rather than a path inside the repo. */
const HUB_SECTIONS = new Set(["spaces", "datasets", "models", "docs", "papers"]);

/** Anything with a scheme (`https:`, `data:`, `mailto:`, ...) is already an address. */
const HAS_SCHEME = /^[a-z][a-z\d+.-]*:/i;

/** The two bases a repo's paths resolve against: the raw file for images, the file page for links. */
export interface RepoFileBases {
  /** `https://huggingface.co/<repo>/resolve/main/`: the raw file. */
  fileBase: string;
  /** `https://huggingface.co/<repo>/blob/main/`: the file's page on the Hub. */
  linkBase: string;
}

/** The bases of a Hugging Face repo id such as `org/name`. */
export function repoFileBases(repoId: string): RepoFileBases {
  const repoPath = repoId.split("/").map(encodeURIComponent).join("/");
  return {
    fileBase: `${HUB_ORIGIN}/${repoPath}/resolve/main/`,
    linkBase: `${HUB_ORIGIN}/${repoPath}/blob/main/`,
  };
}

/** Decodes a segment that is already encoded, so it is not encoded twice. A stray `%` is kept as it is. */
function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/** The path's segments, with `.` dropped and `..` taking one level back, never above the repo root. */
function normalisedSegments(path: string): string[] {
  const segments: string[] = [];
  for (const segment of path.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") segments.pop();
    else segments.push(segment);
  }
  return segments;
}

/** The segments joined with `/`, each encoded once (spaces and other unsafe characters). `@` stays readable. */
function encodedPath(segments: string[]): string {
  return segments
    .map((segment) => encodeURIComponent(decodeSegment(segment)).replace(/%40/g, "@"))
    .join("/");
}

/**
 * One address from a model card, resolved against a base. Absolute addresses (`https:`, `data:`,
 * `mailto:`) and `#anchors` are returned as they are; `//host/x` gets https. A leading `/` names the repo
 * root, except for a Hub section (`/spaces/...`). The query and fragment are kept.
 */
export function resolveRepoUrl(address: string, base: string): string {
  const target = address.trim();
  if (target === "" || target.startsWith("#") || HAS_SCHEME.test(target)) return target;
  if (target.startsWith("//")) return `https:${target}`;

  const cut = target.search(/[?#]/);
  const pathPart = cut === -1 ? target : target.slice(0, cut);
  const suffix = cut === -1 ? "" : target.slice(cut).replace(/ /g, "%20");
  const segments = normalisedSegments(pathPart);
  if (pathPart.startsWith("/") && HUB_SECTIONS.has(segments[0] ?? "")) {
    return `${HUB_ORIGIN}/${encodedPath(segments)}${suffix}`;
  }
  return `${base}${encodedPath(segments)}${suffix}`;
}

/**
 * Resolves each candidate of a `srcset` (`a.png 1x, b.png 2x`). The result has the same form as the
 * input: a string in, a string out; a list (how the HTML parser hands it over) in, a list out.
 */
export function resolveSrcSet(srcSet: string | string[], base: string): string | string[] {
  const candidates = (typeof srcSet === "string" ? srcSet.split(",") : srcSet)
    .map((candidate) => candidate.trim())
    .filter((candidate) => candidate !== "");
  const resolved = candidates.map((candidate) => {
    const [address = "", ...descriptors] = candidate.split(/\s+/);
    return [resolveRepoUrl(address, base), ...descriptors].join(" ");
  });
  return typeof srcSet === "string" ? resolved.join(", ") : resolved;
}

/** The part of a parsed HTML tree (markdown or raw HTML) that the rewrite reads. */
export interface HastNode {
  type: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  /** The text of a text node. */
  value?: string;
  children?: HastNode[];
}

/**
 * Rewrites, in place, the `src` and `srcSet` of every element and the `href` of every link in a tree to
 * the repo's URLs. Images use the file base; links use the file page base.
 */
export function rewriteRepoUrls(node: HastNode, bases: RepoFileBases): void {
  const { properties } = node;
  if (node.type === "element" && properties) {
    if (node.tagName === "a" && typeof properties.href === "string") {
      properties.href = resolveRepoUrl(properties.href, bases.linkBase);
    }
    if (typeof properties.src === "string") {
      properties.src = resolveRepoUrl(properties.src, bases.fileBase);
    }
    const { srcSet } = properties;
    if (typeof srcSet === "string" || Array.isArray(srcSet)) {
      properties.srcSet = resolveSrcSet(srcSet, bases.fileBase);
    }
  }
  for (const child of node.children ?? []) rewriteRepoUrls(child, bases);
}
