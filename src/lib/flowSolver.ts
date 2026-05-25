import type { Edge, Node } from "@xyflow/react";
import { clockMultiplier } from "@/lib/clockSpeed";
import {
  applyContainerFlow,
  edgeTouchesContainer,
  isContainerInputPort,
  isContainerMachineId,
  isContainerOutputPort,
  pairedContainerInputPortId,
} from "@/lib/containerFlow";
import type {
  ContainerFrameData,
  ItemPortData,
  MachineFrameData,
} from "@/types/graph";
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
  const frame = nodes.find((n) => n.id === machineFrameId);
  if (!frame) return 1;
  if (frame.type === "containerFrame") return 1;
  if (frame.type !== "machineFrame") return 1;
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
 * Besoin nominal attribué à une arête vers une entrée : une seule entrée → débit cible entier ;
 * fusion (plusieurs arêtes vers le même port) → répartition pondérée par débit nominal **sortie** amont.
 */
function portForcedRate(
  portId: string,
  forcedPortRates: Record<string, number | undefined>,
): number | undefined {
  const fv = forcedPortRates[portId];
  if (fv === undefined || Number.isNaN(fv)) return undefined;
  return fv;
}

function allocatedDemandOnEdge(
  e: Edge,
  nodes: Node[],
  effectiveRate: Record<string, number>,
  realEdges: Edge[],
  base: Map<string, number>,
  forcedPortRates: Record<string, number | undefined>,
): number {
  const tgt = e.target;
  if (isContainerInputPort(nodes, tgt)) {
    const forced = portForcedRate(tgt, forcedPortRates);
    if (forced !== undefined) return forced;
    return 0;
  }
  const totalNeed = effectiveRate[tgt] ?? 0;
  const incoming = realEdges.filter((x) => x.target === tgt);
  if (incoming.length <= 1) return totalNeed;
  const weights = incoming.map((x) => Math.max(base.get(x.source) ?? 0, EPS));
  const sumW = weights.reduce((a, b) => a + b, 0);
  const idx = incoming.findIndex((x) => x.id === e.id);
  if (idx < 0 || sumW <= EPS) return totalNeed / incoming.length;
  return totalNeed * (weights[idx]! / sumW);
}

const SCALE_UP_ITERS = 64;

/**
 * Monte les multiplicateurs **sans port forcé** pour que chaque sortie couvre la somme des besoins
 * nominaux en aval (splits et merges), par point fixe sur `m`.
 */
function scaleMachinesToMeetOutgoingDemand(
  m: Record<string, number>,
  machines: string[],
  nodes: Node[],
  portsOfMachine: Map<string, string[]>,
  realEdges: Edge[],
  base: Map<string, number>,
  machineOf: Map<string, string>,
  forcedPortRates: Record<string, number | undefined>,
): void {
  for (let iter = 0; iter < SCALE_UP_ITERS; iter++) {
    const effectiveRate: Record<string, number> = {};
    for (const pid of base.keys()) {
      const mid = machineOf.get(pid);
      const b = base.get(pid) ?? 0;
      effectiveRate[pid] = mid ? (m[mid] ?? 1) * b : b;
    }

    let changed = false;
    for (const mid of machines) {
      if (isContainerMachineId(nodes, mid)) continue;
      if (machineHasForcedRate(mid, portsOfMachine, forcedPortRates)) continue;
      let needM = m[mid] ?? 1;
      for (const pid of portsOfMachine.get(mid) ?? []) {
        const node = nodes.find((n) => n.id === pid && n.type === "itemPort");
        if (!node) continue;
        if ((node.data as ItemPortData).kind !== "out") continue;
        const outs = realEdges.filter((e) => e.source === pid);
        if (outs.length === 0) continue;
        let demand = 0;
        for (const e of outs) {
          demand += allocatedDemandOnEdge(
            e,
            nodes,
            effectiveRate,
            realEdges,
            base,
            forcedPortRates,
          );
        }
        const bp = base.get(pid) ?? 0;
        if (bp > EPS) needM = Math.max(needM, demand / bp);
      }
      if (needM > (m[mid] ?? 1) + EPS) {
        m[mid] = needM;
        changed = true;
      }
    }
    if (!changed) break;
  }
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

function partitionEdgesByContainerTarget(
  nodes: Node[],
  edges: Edge[],
): { regular: Edge[]; containerIn: Edge[] } {
  const regular: Edge[] = [];
  const containerIn: Edge[] = [];
  for (const ed of edges) {
    if (isContainerInputPort(nodes, ed.target)) containerIn.push(ed);
    else regular.push(ed);
  }
  return { regular, containerIn };
}

/** Répartit l’offre d’un port sortie : machines d’abord, puis surplus vers conteneurs. */
function allocateFlowsFromSourcePort(
  nodes: Node[],
  supply: number,
  edges: Edge[],
  effectiveRate: Record<string, number>,
  realEdges: Edge[],
  base: Map<string, number>,
  forcedPortRates: Record<string, number | undefined>,
  edgeFlow: Record<string, number>,
): void {
  const { regular, containerIn } = partitionEdgesByContainerTarget(nodes, edges);

  const assignRegular = (es: Edge[]) => {
    if (es.length === 0) return;
    const needsAlloc = es.map((ed) =>
      allocatedDemandOnEdge(
        ed,
        nodes,
        effectiveRate,
        realEdges,
        base,
        forcedPortRates,
      ),
    );
    const sumNeed = needsAlloc.reduce((a, b) => a + b, 0);

    if (es.length === 1) {
      const ed = es[0]!;
      const need = needsAlloc[0] ?? 0;
      edgeFlow[ed.id] = Math.min(supply, need);
      return;
    }
    if (sumNeed <= EPS) {
      const eq = supply / es.length;
      for (const ed of es) edgeFlow[ed.id] = eq;
      return;
    }
    for (let i = 0; i < es.length; i++) {
      const ed = es[i]!;
      const need = needsAlloc[i] ?? 0;
      const prop = (need / sumNeed) * supply;
      edgeFlow[ed.id] = Math.min(prop, need);
    }
  };

  assignRegular(regular);

  let remaining = Math.max(
    0,
    supply - regular.reduce((s, ed) => s + (edgeFlow[ed.id] ?? 0), 0),
  );

  if (containerIn.length === 0) return;

  const forcedEdges: Edge[] = [];
  const flexEdges: Edge[] = [];
  for (const ed of containerIn) {
    if (portForcedRate(ed.target, forcedPortRates) !== undefined) {
      forcedEdges.push(ed);
    } else {
      flexEdges.push(ed);
    }
  }

  for (const ed of forcedEdges) {
    const need = portForcedRate(ed.target, forcedPortRates)!;
    const f = Math.min(remaining, need);
    edgeFlow[ed.id] = f;
    remaining = Math.max(0, remaining - f);
  }

  if (flexEdges.length === 0) return;

  if (flexEdges.length === 1) {
    edgeFlow[flexEdges[0]!.id] = remaining;
    return;
  }

  const share = remaining / flexEdges.length;
  for (const ed of flexEdges) {
    edgeFlow[ed.id] = share;
  }
}

/**
 * Rééquilibrage quand la demande agrégée sur une sortie dépasse l’offre (split, etc.) :
 * réduit les multiplicateurs des machines **aval** (priorité aux déficits ; surplus toléré).
 * Les machines avec au moins un port **forcé** ne sont pas modifiées.
 */
function rebalanceDeficitDownstream(
  m: Record<string, number>,
  nodes: Node[],
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

      const needs = es.map((ed) =>
        allocatedDemandOnEdge(
          ed,
          nodes,
          effectiveRate,
          realEdges,
          base,
          forcedPortRates,
        ),
      );
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
          if (isContainerMachineId(nodes, mid)) continue;
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

interface FlowConflicts {
  machineIds: Set<string>;
  edgeIds: Set<string>;
  portIds: Set<string>;
}

function isPortDeficit(delta: number, tolerance: number): boolean {
  return delta < -tolerance;
}

function deficitTolerance(rate: number): number {
  return EPS * (1 + Math.abs(rate));
}

function portHasIncoming(pid: string, realEdges: Edge[]): boolean {
  return realEdges.some((e) => e.target === pid);
}

function portHasOutgoing(pid: string, realEdges: Edge[]): boolean {
  return realEdges.some((e) => e.source === pid);
}

function collectFinalConflicts(
  machines: string[],
  portsOfMachine: Map<string, string[]>,
  base: Map<string, number>,
  forcedPortRates: Record<string, number | undefined>,
  portDelta: Record<string, number>,
  machineOf: Map<string, string>,
  realEdges: Edge[],
  portNodes: Node[],
): FlowConflicts {
  const machineIds = new Set<string>();
  const conflictPorts = new Set<string>();

  for (const mid of machines) {
    const forcedOnPorts: Array<{ pid: string; mp: number }> = [];
    for (const pid of portsOfMachine.get(mid) ?? []) {
      const fv = forcedPortRates[pid];
      if (fv === undefined || Number.isNaN(fv)) continue;
      forcedOnPorts.push({ pid, mp: fv / (base.get(pid) ?? 1) });
    }
    if (forcedOnPorts.length < 2) continue;
    const anchor = forcedOnPorts[0]!.mp;
    for (let i = 1; i < forcedOnPorts.length; i++) {
      if (Math.abs(forcedOnPorts[i]!.mp - anchor) > EPS) {
        machineIds.add(mid);
        for (const fp of forcedOnPorts) conflictPorts.add(fp.pid);
        break;
      }
    }
  }

  /** Manque de débit seulement (surplus toléré ; entrées sans liaison = matière première). */
  for (const n of portNodes) {
    const pid = n.id;
    const kind = (n.data as ItemPortData).kind;
    if (kind === "in" && !portHasIncoming(pid, realEdges)) continue;
    if (kind === "out" && !portHasOutgoing(pid, realEdges)) continue;
    const delta = portDelta[pid] ?? 0;
    const fv = forcedPortRates[pid];
    const refRate =
      fv !== undefined && !Number.isNaN(fv)
        ? fv
        : (base.get(pid) ?? 0);
    if (!isPortDeficit(delta, deficitTolerance(refRate))) continue;
    const mid = machineOf.get(pid);
    if (mid) machineIds.add(mid);
    conflictPorts.add(pid);
  }

  const edgeIds = new Set<string>();
  if (conflictPorts.size > 0) {
    for (const e of realEdges) {
      if (conflictPorts.has(e.source) || conflictPorts.has(e.target)) {
        edgeIds.add(e.id);
      }
    }
  }

  return { machineIds, edgeIds, portIds: conflictPorts };
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
    if (edgeTouchesContainer(nodes, e.source, e.target)) continue;
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
      m[minId(sources)] = 1;
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
        }
      }
      if (!Number.isNaN(m[L.mb])) {
        const candMa = m[L.mb] * L.rev;
        if (Number.isNaN(m[L.ma])) {
          m[L.ma] = candMa;
          changed = true;
        }
      }
    }
    if (!changed) break;
  }

  for (const mid of machines) {
    if (Number.isNaN(m[mid])) m[mid] = 1;
  }

  scaleMachinesToMeetOutgoingDemand(
    m,
    machines,
    nodes,
    portsOfMachine,
    realEdges,
    base,
    machineOf,
    forcedPortRates,
  );

  rebalanceDeficitDownstream(
    m,
    nodes,
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

  /** 1a) Flux amont → machines / entrées conteneur (pas depuis sortie conteneur). */
  for (const [src, es] of bySource) {
    if (isContainerOutputPort(nodes, src)) continue;
    allocateFlowsFromSourcePort(
      nodes,
      effectiveRate[src] ?? 0,
      es,
      effectiveRate,
      realEdges,
      base,
      forcedPortRates,
      edgeFlow,
    );
  }

  /** 1b) Sorties conteneur : offre = débit entrant sur le port jumelé. */
  for (const [src, es] of bySource) {
    if (!isContainerOutputPort(nodes, src)) continue;
    const outNode = nodes.find((n) => n.id === src);
    const frame = outNode?.parentId
      ? nodes.find((n) => n.id === outNode.parentId)
      : undefined;
    if (
      frame?.type === "containerFrame" &&
      (frame.data as ContainerFrameData).outputEnabled === false
    ) {
      continue;
    }
    const inId = pairedContainerInputPortId(src);
    if (!inId) continue;
    let supply = 0;
    for (const e of realEdges) {
      if (e.target === inId) supply += edgeFlow[e.id] ?? 0;
    }
    allocateFlowsFromSourcePort(
      nodes,
      supply,
      es,
      effectiveRate,
      realEdges,
      base,
      forcedPortRates,
      edgeFlow,
    );
  }

  for (const e of realEdges) {
    if (edgeFlow[e.id] !== undefined) continue;
    const supply = effectiveRate[e.source] ?? 0;
    const need = allocatedDemandOnEdge(
      e,
      nodes,
      effectiveRate,
      realEdges,
      base,
      forcedPortRates,
    );
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

  const conflicts = collectFinalConflicts(
    machines,
    portsOfMachine,
    base,
    forcedPortRates,
    portDelta,
    machineOf,
    realEdges,
    portNodes,
  );
  const hardConflict = conflicts.machineIds.size > 0;

  let errorMessage: string | null = null;
  if (hardConflict) {
    if (multiSourceWithoutForce) {
      errorMessage =
        "Plusieurs « sources » dans la même chaîne sans débit forcé : imposez un débit sur un port ou fusionnez en une seule ligne.";
    } else {
      errorMessage =
        "Manque de débit sur la chaîne : vérifiez les ports en rouge et les débits forcés.";
    }
  }

  const baseResult: FlowSolveResult = {
    machineMultiplier: m,
    effectiveRate,
    edgeFlow,
    portDelta,
    hardConflict,
    conflictMachineIds: [...conflicts.machineIds],
    conflictEdgeIds: [...conflicts.edgeIds],
    conflictPortIds: [...conflicts.portIds],
    portStoredPerMin: {},
    errorMessage,
  };

  return applyContainerFlow(nodes, edges, baseResult);
}
