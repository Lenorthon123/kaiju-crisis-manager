import {
  REFERENCE_GRAPH,
  areAdjacent,
  buildRoutes,
  computePriority,
  findAllShortestLandPaths,
  findLandPath,
  hasSeaAccess,
} from '../topology';
import { DISTRICT_CODES, DistrictCode } from '../types';
import { DISTRICTS, PUBLISHED_ADJACENCY } from '../reference-data';

describe('city topology', () => {
  it('reproduces every cell of the published adjacency matrix', () => {
    for (const a of DISTRICT_CODES) {
      for (const b of DISTRICT_CODES) {
        if (a === b) continue;
        expect({ a, b, adjacent: areAdjacent(REFERENCE_GRAPH, a, b) }).toEqual({
          a,
          b,
          adjacent: PUBLISHED_ADJACENCY[a][b] as boolean,
        });
      }
    }
  });

  it('is symmetric', () => {
    for (const a of DISTRICT_CODES) {
      for (const b of DISTRICT_CODES) {
        expect(areAdjacent(REFERENCE_GRAPH, a, b)).toBe(areAdjacent(REFERENCE_GRAPH, b, a));
      }
    }
  });

  it('grants sea access to Echo, Xeno and Zion only', () => {
    for (const d of DISTRICTS) {
      expect({ code: d.code, sea: hasSeaAccess(REFERENCE_GRAPH, d.code) }).toEqual({
        code: d.code,
        sea: d.hasSeaAccess,
      });
    }
  });

  it('makes Xeno the only quarter bordering all the others', () => {
    const borderAll = DISTRICT_CODES.filter((a) =>
      DISTRICT_CODES.every((b) => a === b || areAdjacent(REFERENCE_GRAPH, a, b)),
    );
    expect(borderAll).toEqual(['X']);
  });

  it('leaves exactly three non-adjacent land pairs', () => {
    const pairs: string[] = [];
    for (const a of DISTRICT_CODES) {
      for (const b of DISTRICT_CODES) {
        if (a < b && !areAdjacent(REFERENCE_GRAPH, a, b)) pairs.push(`${a}${b}`);
      }
    }
    expect(pairs.sort()).toEqual(['AZ', 'EW', 'EZ']);
  });

  it('enumerates every shortest overland route of each non-adjacent pair', () => {
    const intermediates = (from: DistrictCode, to: DistrictCode) =>
      findAllShortestLandPaths(REFERENCE_GRAPH, from, to)
        .map((p) => p[1])
        .sort();

    expect(intermediates('A', 'Z')).toEqual(['W', 'X']);
    expect(intermediates('E', 'W')).toEqual(['A', 'X']);
    expect(intermediates('E', 'Z')).toEqual(['X']);
  });

  it('prefers the route that avoids the Xeno hub at equal duration', () => {
    expect(findLandPath(REFERENCE_GRAPH, 'A', 'Z')).toEqual(['A', 'W', 'Z']);
    expect(findLandPath(REFERENCE_GRAPH, 'E', 'W')).toEqual(['E', 'A', 'W']);
  });

  describe('routes', () => {
    it('offers a single direct leg between adjacent quarters', () => {
      const routes = buildRoutes(REFERENCE_GRAPH, 'A', 'X');
      expect(routes[0].mode).toBe('DIRECT');
      expect(routes[0].legs).toHaveLength(1);
      expect(routes[0].transitDistricts).toEqual([]);
    });

    it('requires transit approval from the intermediate quarter for A -> Z', () => {
      const [route] = buildRoutes(REFERENCE_GRAPH, 'A', 'Z');
      expect(route.mode).toBe('TRANSIT');
      expect(route.transitDistricts).toEqual(['W']);
      expect(route.legs.filter((l) => l.approvalRequired)).toHaveLength(1);
      expect(route.legs[1].from).toBe('W');
    });

    it('requires transit approval from Xeno for E -> Z, the one forced hub route', () => {
      const overland = buildRoutes(REFERENCE_GRAPH, 'E', 'Z').find((r) => r.mode === 'TRANSIT')!;
      expect(overland.transitDistricts).toEqual(['X']);
      expect(overland.legs[1].from).toBe('X');
      expect(overland.legs[1].approvalRequired).toBe(true);
    });

    it('marks only the intermediate quarter as needing approval', () => {
      const [route] = buildRoutes(REFERENCE_GRAPH, 'A', 'Z');
      expect(route.legs.map((l) => l.approvalRequired)).toEqual([false, true]);
    });

    it('is deterministic regardless of edge insertion order', () => {
      const shuffled = { edges: [...REFERENCE_GRAPH.edges].reverse() };
      expect(buildRoutes(shuffled, 'A', 'Z')[0].transitDistricts).toEqual(
        buildRoutes(REFERENCE_GRAPH, 'A', 'Z')[0].transitDistricts,
      );
    });

    it('offers a maritime alternative for E -> Z, the only non-adjacent sea pair', () => {
      const routes = buildRoutes(REFERENCE_GRAPH, 'E', 'Z');
      const modes = routes.map((r) => r.mode);
      expect(modes).toContain('TRANSIT');
      expect(modes).toContain('MARITIME');
      const maritime = routes.find((r) => r.mode === 'MARITIME')!;
      expect(maritime.transitDistricts).toEqual([]);
      expect(maritime.legs.map((l) => l.to)).toEqual(['SEA', 'Z']);
    });

    it('never offers a maritime route to a landlocked quarter', () => {
      for (const landlocked of ['A', 'W'] as DistrictCode[]) {
        for (const other of DISTRICT_CODES) {
          if (other === landlocked) continue;
          const routes = buildRoutes(REFERENCE_GRAPH, landlocked, other);
          expect(routes.some((r) => r.mode === 'MARITIME')).toBe(false);
        }
      }
    });

    it('doubles the delivery time of the maritime route', () => {
      const timing = { baseLegHours: 2, maritimeMultiplier: 2 };
      const direct = buildRoutes(REFERENCE_GRAPH, 'X', 'Z', timing).find((r) => r.mode === 'DIRECT')!;
      const maritime = buildRoutes(REFERENCE_GRAPH, 'X', 'Z', timing).find((r) => r.mode === 'MARITIME')!;
      expect(maritime.totalEtaHours).toBe(direct.totalEtaHours * 2);
    });
  });

  describe('priority (annex rule #5)', () => {
    it("queues transiting requests behind Xeno's own requests", () => {
      const ownRoute = buildRoutes(REFERENCE_GRAPH, 'X', 'Z')[0];
      const transitingRoute = buildRoutes(REFERENCE_GRAPH, 'A', 'Z')[0];
      const own = computePriority(ownRoute, 'X', 'Z');
      const transiting = computePriority(transitingRoute, 'A', 'Z');
      expect(own).toBeLessThan(transiting);
    });
  });
});
