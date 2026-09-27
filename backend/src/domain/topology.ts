import {
  DEFAULT_TIMING,
  DistrictCode,
  DISTRICT_CODES,
  Edge,
  Leg,
  LinkType,
  NodeCode,
  Route,
  SEA,
  TimingConfig,
  TopologyGraph,
  TransferMode,
} from './types';

// The bay is a node of the graph, like the annex's diagram. That is what lets
// Echo and Zion trade without sharing a border, and it keeps path-finding
// uniform instead of forking into a separate maritime branch.
export const REFERENCE_EDGES: readonly Edge[] = [
  { from: 'A', to: 'E', type: 'LAND' },
  { from: 'A', to: 'W', type: 'LAND' },
  { from: 'A', to: 'X', type: 'LAND' },
  { from: 'E', to: 'X', type: 'LAND' },
  { from: 'W', to: 'X', type: 'LAND' },
  { from: 'W', to: 'Z', type: 'LAND' },
  { from: 'X', to: 'Z', type: 'LAND' },
  { from: 'E', to: SEA, type: 'SEA' },
  { from: 'X', to: SEA, type: 'SEA' },
  { from: 'Z', to: SEA, type: 'SEA' },
];

export const REFERENCE_GRAPH: TopologyGraph = { edges: REFERENCE_EDGES };

export function isDistrictCode(node: NodeCode | string): node is DistrictCode {
  return (DISTRICT_CODES as readonly string[]).includes(node);
}

export function neighbours(
  graph: TopologyGraph,
  node: NodeCode,
  type?: LinkType,
): NodeCode[] {
  const out = new Set<NodeCode>();
  for (const e of graph.edges) {
    if (type && e.type !== type) continue;
    if (e.from === node) out.add(e.to);
    else if (e.to === node) out.add(e.from);
  }
  return [...out];
}

export function areAdjacent(
  graph: TopologyGraph,
  a: DistrictCode,
  b: DistrictCode,
): boolean {
  return graph.edges.some(
    (e) =>
      e.type === 'LAND' &&
      ((e.from === a && e.to === b) || (e.from === b && e.to === a)),
  );
}

export function hasSeaAccess(graph: TopologyGraph, d: DistrictCode): boolean {
  return graph.edges.some(
    (e) =>
      e.type === 'SEA' && ((e.from === d && e.to === SEA) || (e.from === SEA && e.to === d)),
  );
}

export function findLandPath(
  graph: TopologyGraph,
  from: DistrictCode,
  to: DistrictCode,
): DistrictCode[] | null {
  const all = findAllShortestLandPaths(graph, from, to);
  return all.length > 0 ? all[0] : null;
}

// All shortest paths, not one. A -> Z can go through Warden or Xeno, both two
// hops. Returning whichever the edge order happened to yield would hide a legal
// route from the LC.
export function findAllShortestLandPaths(
  graph: TopologyGraph,
  from: DistrictCode,
  to: DistrictCode,
): DistrictCode[][] {
  if (from === to) return [[from]];

  let frontier: DistrictCode[][] = [[from]];
  const visited = new Set<DistrictCode>([from]);
  const found: DistrictCode[][] = [];

  while (frontier.length > 0 && found.length === 0) {
    const nextFrontier: DistrictCode[][] = [];
    const reachedThisRound = new Set<DistrictCode>();

    for (const path of frontier) {
      const tail = path[path.length - 1];
      for (const n of neighbours(graph, tail, 'LAND')) {
        if (!isDistrictCode(n) || visited.has(n)) continue;
        const next = [...path, n];
        if (n === to) found.push(next);
        else {
          reachedThisRound.add(n);
          nextFrontier.push(next);
        }
      }
    }

    for (const n of reachedThisRound) visited.add(n);
    frontier = nextFrontier;
  }

  return found;
}

function buildLegs(
  path: NodeCode[],
  type: LinkType,
  etaPerLeg: number,
): Leg[] {
  const legs: Leg[] = [];
  for (let i = 0; i < path.length - 1; i += 1) {
    const from = path[i];
    const to = path[i + 1];
    const isIntermediateStart = i > 0 && isDistrictCode(from);
    legs.push({
      sequence: i,
      from,
      to,
      type,
      approvalRequired: isIntermediateStart,
      etaHours: etaPerLeg,
    });
  }
  return legs;
}

export function buildRoutes(
  graph: TopologyGraph,
  from: DistrictCode,
  to: DistrictCode,
  timing: TimingConfig = DEFAULT_TIMING,
): Route[] {
  const routes: Route[] = [];
  if (from === to) return routes;

  const landPaths = findAllShortestLandPaths(graph, from, to);

  for (const path of landPaths) {
    const legs = buildLegs(path, 'LAND', timing.baseLegHours);
    const transitDistricts = path.slice(1, -1) as DistrictCode[];
    routes.push({
      mode: path.length === 2 ? 'DIRECT' : 'TRANSIT',
      legs,
      transitDistricts,
      totalEtaHours: legs.length * timing.baseLegHours,
    });
  }

  if (hasSeaAccess(graph, from) && hasSeaAccess(graph, to)) {
    const eta = timing.baseLegHours * timing.maritimeMultiplier;
    routes.push({
      mode: 'MARITIME',
      legs: [
        { sequence: 0, from, to: SEA, type: 'SEA', approvalRequired: false, etaHours: eta / 2 },
        { sequence: 1, from: SEA, to, type: 'SEA', approvalRequired: false, etaHours: eta / 2 },
      ],
      transitDistricts: [],
      totalEtaHours: eta,
    });
  }

  const MODE_RANK: Record<TransferMode, number> = { DIRECT: 0, TRANSIT: 1, MARITIME: 2 };

  return routes.sort((a, b) => {
    if (a.totalEtaHours !== b.totalEtaHours) return a.totalEtaHours - b.totalEtaHours;
    if (MODE_RANK[a.mode] !== MODE_RANK[b.mode]) return MODE_RANK[a.mode] - MODE_RANK[b.mode];
    const aHub = a.transitDistricts.includes('X') ? 1 : 0;
    const bHub = b.transitDistricts.includes('X') ? 1 : 0;
    if (aHub !== bHub) return aHub - bHub;
    return a.transitDistricts.join().localeCompare(b.transitDistricts.join());
  });
}

// Annex rule 5: whatever only crosses Xeno waits behind Xeno's own business.
// Lower number = handled first.
export function computePriority(route: Route, from: DistrictCode, to: DistrictCode): number {
  const xenoIsEndpoint = from === 'X' || to === 'X';
  if (xenoIsEndpoint) return 10;
  if (route.transitDistricts.includes('X')) return 90;
  return 50;
}
