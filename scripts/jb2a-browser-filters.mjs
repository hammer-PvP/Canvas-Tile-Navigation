/**
 * Non-authoritative discovery labels for installed Sequencer Database paths.
 * JB2A does not guarantee uniform metadata across releases or packages:
 * missing/unknown attributes stay available when filtering by "All".
 * No fabricated database keys, no media access, no changes to FX mechanics.
 */
const SHAPES = new Set(["circle", "cone", "square", "rectangle", "line", "ray", "ring", "beam", "wall", "burst", "hexagon"]);
const COLORS = ["purple", "orange", "yellow", "green", "white", "black", "blue", "red", "pink", "cyan", "teal", "gold", "silver", "grey", "gray", "brown", "violet", "indigo", "amber", "magenta", "rainbow"];
const COLOR_SET = new Set(COLORS);
const COLOR_PATTERN = new RegExp(`^(?:${COLORS.join("|")}){2,3}$`);

function colorOf(segments) {
  const tokens = segments.flatMap((s) => s.toLowerCase().split(/[_-]/).filter(Boolean));
  for (let i = 0; i < tokens.length; i++) {
    if (COLOR_SET.has(tokens[i]) && COLOR_SET.has(tokens[i + 1])) return `${tokens[i]}${tokens[i + 1]}`;
    if (COLOR_SET.has(tokens[i])) return tokens[i];
    if (COLOR_PATTERN.test(tokens[i])) return tokens[i];
  }
  return "";
}

export function describeJB2APath(path) {
  const segments = String(path).toLowerCase().split(".").slice(1);
  const category = segments[0] ?? "";
  const tokens = segments.flatMap((segment) => segment.split(/[_-]/).filter(Boolean));
  const format = tokens.find((token) => SHAPES.has(token)) ?? "";
  // Numeric DB-path components are variants only if present after the family.
  // Unspecified attributes are left blank, not guessed from asset files.
  const variation = segments.slice(1).filter((segment) => /^\d{1,3}[a-z]?$/.test(segment)).at(-1) ?? "";
  const distance = tokens.find((token) => /^\d{1,3}ft$/.test(token)) ?? "";
  const color = colorOf(segments.slice(1));
  return { category, color, format, variation, distance };
}

export const JB2A_FACETS = Object.freeze(["category", "color", "format", "variation", "distance"]);

export function indexJB2APaths(paths) {
  return paths.map((path) => ({ path, ...describeJB2APath(path) }));
}

export function facetValues(index, facet) {
  const values = [...new Set(index.map((item) => item[facet]).filter(Boolean))];
  return values.sort((a, b) => {
    if (facet === "distance") return parseInt(a, 10) - parseInt(b, 10);
    if (facet === "variation") return a.localeCompare(b, undefined, { numeric: true });
    return a.localeCompare(b);
  });
}

export function filterJB2AIndex(index, search, selectedFacets) {
  const terms = String(search).trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return index.filter((item) =>
    terms.every((term) => item.path.toLocaleLowerCase().includes(term)) &&
    JB2A_FACETS.every((facet) => !selectedFacets[facet] || item[facet] === selectedFacets[facet])
  );
}
