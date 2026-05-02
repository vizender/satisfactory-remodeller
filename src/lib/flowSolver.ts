import type { Edge, Node } from "@xyflow/react";
import { clockMultiplier } from "@/lib/clockSpeed";
import type { ItemPortData, MachineFrameData } from "@/types/graph";
import type { FlowSolveResult } from "@/types/flowSolve";

const EPS = 1e-3;

function machineOfPort(n: Node): string | null {
  if (n.type !== "itemPort") return null;
  return n.parentId ?? null;
}

function clockMultiplierForMachine(
  nodes: Node[],
  machineFrameId: string | undefined,
): number {
  if (!machineFrameId) return 1;
  const frame = nodes.find(
    (n) => n.id === machineFrameId && n.type === "machineFrame",
  );
  if (!frame) return 1;
  return clockMultiplier((frame.data as MachineFrameData).clockPercent);
}

interface MachLink {
  ma: string;
  mb: string;
  fwd: number;
  rev: number;
}

/** Union-find pour composantes connexes (machines reliées par au moins une arête item). */
function unionFind(machines: string[]) {
  const parent = new Map<string, string>();
  const rank = new Map<string, number>();

  function ensure(id: string) {
    if (!parent.has(id)) {
      parent.set(id, id);
      rank.set(id, 0);
    }
  }

  function find(id: string): string {
    ensure(id);
    const p = parent.get(id)!;
    if (p !== id) parent.set(id, find(p));
    return parent.get(id)!;
  }

  function union(a: string, b: string) {
    const ra = find(a);
    const rb = find(b);
    if (ra === rb) return;
    const rka = rank.get(ra) ?? 0;
    const rkb = rank.get(rb) ?? 0;
    if (rka < rkb) parent.set(ra, rb);
    else if (rka > rkb) parent.set(rb, ra);
    else {
      parent.set(rb, ra);
      rank.set(ra, rka + 1);
    }
  }

  for (const m of machines) ensure(m);
  return { find, union, parent, ensure };
}

function machineHasForcedRate(
  machineId: string,
  portsOfMachine: Map<string, string[]>,
  forcedPortRates: Record<string, number | undefined>,
): boolean {
  for (const pid of portsOfMachine.get(machineId) ?? []) {
    const fv = forcedPortRates[pid];
    if (fv !== undefined && !Number.isNaN(fv)) return true;
  }
  return false;
}

/**
 * Composantes : arêtes item (ma → mb) + machines isolées.
 */
function componentsOf(
  machines: string[],
  machLinks: MachLink[],
): string[][] {
  const uf = unionFind(machines);
  for (const L of machLinks) {
    uf.union(L.ma, L.mb);
  }
  const map = new Map<string, string[]>();
  for (const mid of machines) {
    const r = uf.find(mid);
    if (!map.has(r)) map.set(r, []);
    map.get(r)!.push(mid);
  }
  return [...map.values()];
}

/**
 * Machines sans arête entrante **depuis une autre machine de la composante**
 * (producteurs en tête de chaîne = ancrage à m = 1).
 */
function sourceMachinesInComponent(
  comp: Set<string>,
  machLinks: MachLink[],
): string[] {
  const incoming = new Set<string>();
  for (const L of machLinks) {
    if (comp.has(L.ma) && comp.has(L.mb)) incoming.add(L.mb);
  }
  return [...comp].filter((mid) => !incoming.has(mid));
}

function minId(ids: string[]): string {
  return ids.reduce((a, b) => (a < b ? a : b));
}

/**
 * Rééquilibrage quand la demande agrégée sur une sortie dépasse l’offre (split, etc.) :
 * réduit les multiplicateurs des machines **aval** (priorité aux déficits ; surplus toléré).
 * Les machines avec au moins un port **forcé** ne sont pas modifiées.
 */
function rebalanceDeficitDownstream(
  m: Record<string, number>,
  realEdges: Edge[],
  base: Map<string, number>,
  machineOf: Map<string, string>,
  portsOfMachine: Map<string, string[]>,
  forcedPortRates: Record<string, number | undefined>,
): void {
  for (let iter = 0; iter < 48; iter++) {
    let changed = false;
    const effectiveRate: Record<string, number> = {};
    for (const pid of base.keys()) {
      const mid = machineOf.get(pid);
      const b = base.get(pid) ?? 0;
      effectiveRate[pid] = mid ? (m[mid] ?? 1) * b : b;
    }

    const bySource = new Map<string, Edge[]>();
    for (const e of realEdges) {
      if (!bySource.has(e.source)) bySource.set(e.source, []);
      bySource.get(e.source)!.push(e);
    }

    for (const es of bySource.values()) {
      if (es.length === 0) continue;
      const src = es[0]!.source;
      const supply = effectiveRate[src] ?? 0;
      if (supply <= EPS) continue;

      const needs = es.map((ed) => effectiveRate[ed.target] ?? 0);
      const sumNeed = needs.reduce((a, b) => a + b, 0);
      if (sumNeed <= EPS) continue;

      if (sumNeed > supply + EPS) {
        const factor = supply / sumNeed;
        const seenMid = new Set<string>();
        for (const ed of es) {
          const mid = machineOf.get(ed.target);
          if (!mid || seenMid.has(mid)) continue;
          seenMid.add(mid);
          if (machineHasForcedRate(mid, portsOfMachine, forcedPortRates)) {
            continue;
          }
          const prev = m[mid] ?? 1;
          const next = Math.max(prev * factor, 1e-12);
          m[mid] = next;
          if (Math.abs(next - prev) > EPS * (1e-9 + Math.abs(prev))) {
            changed = true;
          }
        }
      }
    }

    if (!changed) break;
  }
}

/**
 * Résout les débits : forçage manuel > sinon ancrage des sources (m=1) >
 * propagation le long des liaisons (conservation m_src×débit_nominal).
 */
export function solveFlow(
  nodes: Node[],
  edges: Edge[],
  forcedPortRates: Record<string, number | undefined>,
): FlowSolveResult {
  const conflictMachineIds = new Set<string>();
  let multiSourceWithoutForce = false;

  const portNodes = nodes.filter((n) => n.type === "itemPort");
  const base = new Map<string, number>();
  const machineOf = new Map<string, string>();
  const portsOfMachine = new Map<string, string[]>();

  for (const n of portNodes) {
    const d = n.data as ItemPortData;
    const mid = machineOfPort(n);
    const cm = clockMultiplierForMachine(nodes, mid ?? undefined);
    base.set(n.id, d.perMinute * cm);
    if (mid) {
      machineOf.set(n.id, mid);
      if (!portsOfMachine.has(mid)) portsOfMachine.set(mid, []);
      portsOfMachine.get(mid)!.push(n.id);
    }
  }

  const machines = [...portsOfMachine.keys()];
  const m: Record<string, number> = {};
  for (const mid of machines) m[mid] = Number.NaN;

  for (const pid of Array.from(portsOfMachine.values()).flat()) {
    const fv = forcedPortRates[pid];
    if (fv === undefined || Number.isNaN(fv)) continue;
    const mid = machineOf.get(pid);
    if (!mid) continue;
    const b = base.get(pid) ?? 1;
    const mp = fv / b;
    if (Number.isNaN(m[mid])) {
      m[mid] = mp;
    } else if (Math.abs(m[mid] - mp) > EPS) {
      conflictMachineIds.add(mid);
    }
  }

  const realEdges = edges.filter((e) => !e.data?.suggested);
  const machLinks: MachLink[] = [];
  for (const e of realEdges) {
    const bo = base.get(e.source) ?? 0;
    const bi = base.get(e.target) ?? 0;
    const ma = machineOf.get(e.source);
    const mb = machineOf.get(e.target);
    if (!ma || !mb || ma === mb || bi <= EPS || bo <= 0) continue;
    machLinks.push({
      ma,
      mb,
      fwd: bo / bi,
      rev: bi / bo,
    });
  }

  /** Ancrage : sans aucun débit forcé dans la composante, une seule « source » → m = 1 ; plusieurs sources → conflit. */
  const comps = componentsOf(machines, machLinks);
  for (const members of comps) {
    const compSet = new Set(members);
    const hasForced = members.some((mid) =>
      machineHasForcedRate(mid, portsOfMachine, forcedPortRates),
    );
    if (hasForced) continue;

    const sources = sourceMachinesInComponent(compSet, machLinks);
    if (sources.length === 1) {
      m[sources[0]!] = 1;
    } else if (sources.length === 0) {
      /* Cycle : ancrage arbitraire stable */
      m[minId(members)] = 1;
    } else {
      multiSourceWithoutForce = true;
      for (const mid of members) conflictMachineIds.add(mid);
    }
  }

  for (let iter = 0; iter < 64; iter++) {
    let changed = false;
    for (const L of machLinks) {
      if (!Number.isNaN(m[L.ma])) {
        const candMb = m[L.ma] * L.fwd;
        if (Number.isNaN(m[L.mb])) {
          m[L.mb] = candMb;
          changed = true;
        } else if (Math.abs(m[L.mb] - candMb) > EPS * (1 + Math.abs(candMb))) {
          conflictMachineIds.add(L.ma);
          conflictMachineIds.add(L.mb);
        }
      }
      if (!Number.isNaN(m[L.mb])) {
        const candMa = m[L.mb] * L.rev;
        if (Number.isNaN(m[L.ma])) {
          m[L.ma] = candMa;
          changed = true;
        } else if (Math.abs(m[L.ma] - candMa) > EPS * (1 + Math.abs(candMa))) {
          conflictMachineIds.add(L.ma);
          conflictMachineIds.add(L.mb);
        }
      }
    }
    if (!changed) break;
  }

  for (const mid of machines) {
    if (Number.isNaN(m[mid])) m[mid] = 1;
  }

  rebalanceDeficitDownstream(
    m,
    realEdges,
    base,
    machineOf,
    portsOfMachine,
    forcedPortRates,
  );

  const effectiveRate: Record<string, number> = {};
  for (const pid of base.keys()) {
    const mid = machineOf.get(pid);
    const b = base.get(pid) ?? 0;
    effectiveRate[pid] = mid ? m[mid] * b : b;
  }

  const edgeFlow: Record<string, number> = {};

  const bySource = new Map<string, Edge[]>();
  for (const e of realEdges) {
    if (!bySource.has(e.source)) bySource.set(e.source, []);
    bySource.get(e.source)!.push(e);
  }

  /** 1) Calcul des flux par arête (répartition sorties multiples). */
  for (const [src, es] of bySource) {
    const supply = effectiveRate[src] ?? 0;
    const needs = es.map((ed) => effectiveRate[ed.target] ?? 0);
    const sumNeed = needs.reduce((a, b) => a + b, 0);

    if (es.length === 1) {
      const ed = es[0];
      const need = needs[0] ?? 0;
      const f = Math.min(supply, need);
      edgeFlow[ed.id] = f;
    } else if (es.length > 1) {
      if (sumNeed <= EPS) {
        const eq = supply / es.length;
        es.forEach((ed) => {
          edgeFlow[ed.id] = eq;
        });
      } else {
        es.forEach((ed, i) => {
          const need = needs[i] ?? 0;
          const prop = (need / sumNeed) * supply;
          const f = Math.min(prop, need);
          edgeFlow[ed.id] = f;
        });
      }
    }
  }

  for (const e of realEdges) {
    if (edgeFlow[e.id] !== undefined) continue;
    const supply = effectiveRate[e.source] ?? 0;
    const need = effectiveRate[e.target] ?? 0;
    edgeFlow[e.id] = Math.min(supply, need);
  }

  /** 2) Sommes entrantes / sortantes par port (évite double comptage sur fusion). */
  const sumOut = new Map<string, number>();
  const sumIn = new Map<string, number>();
  for (const e of realEdges) {
    const f = edgeFlow[e.id] ?? 0;
    sumOut.set(e.source, (sumOut.get(e.source) ?? 0) + f);
    sumIn.set(e.target, (sumIn.get(e.target) ?? 0) + f);
  }

  const portDelta: Record<string, number> = {};
  for (const pid of base.keys()) portDelta[pid] = 0;

  for (const n of portNodes) {
    const pid = n.id;
    const kind = (n.data as ItemPortData).kind;
    const nominal = effectiveRate[pid] ?? 0;
    if (kind === "out") {
      const sent = sumOut.get(pid) ?? 0;
      portDelta[pid] = nominal - sent;
    } else {
      const recv = sumIn.get(pid) ?? 0;
      portDelta[pid] = recv - nominal;
    }
  }

  const hardConflict = conflictMachineIds.size > 0;

  let errorMessage: string | null = null;
  if (hardConflict) {
    if (multiSourceWithoutForce) {
      errorMessage =
        "Plusieurs « sources » dans la même chaîne sans débit forcé : imposez un débit sur un port ou fusionnez en une seule ligne.";
    } else {
      errorMessage =
        "Impossible de satisfaire toutes les contraintes : retirez des débits forcés sur les machines en rouge.";
    }
  }

  return {
    machineMultiplier: m,
    effectiveRate,
    edgeFlow,
    portDelta,
    hardConflict,
    conflictMachineIds: [...conflictMachineIds],
    errorMessage,
  };
}
