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
  /** Cible déjà alimentée par un recyclage : ne pas propager m depuis l’externe. */
  recycleFedTarget: boolean;
}

/**
 * Arêtes recycle : boucle sur la même machine, ou retour vers un ancêtre
 * (sous-produit plus bas dans la chaîne). DFS depuis les sources du graphe dirigé.
 */
function findRecycleEdgeIds(
  nodes: Node[],
  realEdges: Edge[],
  machineOf: Map<string, string>,
): Set<string> {
  const recycle = new Set<string>();
  const machineEdges: { id: string; ma: string; mb: string }[] = [];

  for (const e of realEdges) {
    const ma = machineOf.get(e.source);
    const mb = machineOf.get(e.target);
    if (!ma || !mb) continue;
    if (edgeTouchesContainer(nodes, e.source, e.target)) continue;
    if (ma === mb) {
      recycle.add(e.id);
      continue;
    }
    machineEdges.push({ id: e.id, ma, mb });
  }

  const adj = new Map<string, { to: string; id: string }[]>();
  const incomingCount = new Map<string, number>();
  const machineSet = new Set<string>();
  for (const me of machineEdges) {
    machineSet.add(me.ma);
    machineSet.add(me.mb);
    if (!adj.has(me.ma)) adj.set(me.ma, []);
    adj.get(me.ma)!.push({ to: me.mb, id: me.id });
    incomingCount.set(me.mb, (incomingCount.get(me.mb) ?? 0) + 1);
    if (!incomingCount.has(me.ma)) incomingCount.set(me.ma, 0);
  }

  const sources = [...machineSet].filter((id) => (incomingCount.get(id) ?? 0) === 0);
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>();
  const backEdges = new Set<string>();

  function dfs(u: string) {
    color.set(u, GRAY);
    for (const { to, id } of adj.get(u) ?? []) {
      const c = color.get(to) ?? 0;
      if (c === GRAY) backEdges.add(id);
      else if (c === 0) dfs(to);
    }
    color.set(u, BLACK);
  }

  const start = sources.length > 0 ? sources : [...machineSet].sort();
  for (const s of start) {
    if ((color.get(s) ?? 0) === 0) dfs(s);
  }
  for (const id of [...machineSet].sort()) {
    if ((color.get(id) ?? 0) === 0) dfs(id);
  }

  /**
   * Un back-edge n’est un recyclage que s’il fusionne avec une autre arrivée
   * (sous-produit + apport externe). Un lien unique qui referme un cycle DFS
   * reste un flux principal — sinon un split 48+60 est marqué recycle à tort.
   */
  for (const id of backEdges) {
    const e = realEdges.find((x) => x.id === id);
    if (!e) continue;
    if (incomingTo(realEdges, e.target).length > 1) recycle.add(id);
  }

  return recycle;
}

function incomingTo(realEdges: Edge[], targetPortId: string): Edge[] {
  return realEdges.filter((e) => e.target === targetPortId);
}

function recycleAvailableOnInput(
  tgt: string,
  realEdges: Edge[],
  recycleIds: Set<string>,
  rateOfSource: (sourcePortId: string) => number,
): number {
  let rec = 0;
  for (const e of incomingTo(realEdges, tgt)) {
    if (!recycleIds.has(e.id)) continue;
    rec += Math.max(0, rateOfSource(e.source));
  }
  return rec;
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

/** Le débit affiché / d’offre d’un port forcé est la valeur imposée, pas m × nominal. */
function applyForcedPortRates(
  effectiveRate: Record<string, number>,
  forcedPortRates: Record<string, number | undefined>,
  portIds: Iterable<string>,
): void {
  for (const pid of portIds) {
    const fv = portForcedRate(pid, forcedPortRates);
    if (fv !== undefined) effectiveRate[pid] = fv;
  }
}

function outgoingDemandOnPort(
  pid: string,
  nodes: Node[],
  effectiveRate: Record<string, number>,
  realEdges: Edge[],
  base: Map<string, number>,
  forcedPortRates: Record<string, number | undefined>,
  recycleIds: Set<string>,
): number {
  let demand = 0;
  for (const e of realEdges) {
    if (e.source !== pid) continue;
    demand += allocatedDemandOnEdge(
      e,
      nodes,
      effectiveRate,
      realEdges,
      base,
      forcedPortRates,
      recycleIds,
    );
  }
  return demand;
}

function allocatedDemandOnEdge(
  e: Edge,
  nodes: Node[],
  effectiveRate: Record<string, number>,
  realEdges: Edge[],
  base: Map<string, number>,
  forcedPortRates: Record<string, number | undefined>,
  recycleIds: Set<string>,
): number {
  const tgt = e.target;
  if (isContainerInputPort(nodes, tgt)) {
    const forced = portForcedRate(tgt, forcedPortRates);
    if (forced !== undefined) return forced;
    return 0;
  }
  if (recycleIds.has(e.id)) return 0;

  const totalNeed = effectiveRate[tgt] ?? 0;
  const incoming = incomingTo(realEdges, tgt);
  const recycleAvail = recycleAvailableOnInput(
    tgt,
    realEdges,
    recycleIds,
    (src) => effectiveRate[src] ?? 0,
  );
  const externalNeed = Math.max(0, totalNeed - recycleAvail);
  const externals = incoming.filter((x) => !recycleIds.has(x.id));
  if (externals.length <= 1) return externalNeed;
  const weights = externals.map((x) => Math.max(base.get(x.source) ?? 0, EPS));
  const sumW = weights.reduce((a, b) => a + b, 0);
  const idx = externals.findIndex((x) => x.id === e.id);
  if (idx < 0 || sumW <= EPS) return externalNeed / externals.length;
  return externalNeed * (weights[idx]! / sumW);
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
  recycleIds: Set<string>,
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
            recycleIds,
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

/**
 * Recyclage d’abord, puis externes : chaque cible prend min(besoin restant, offre),
 * au prorata des offres s’il y a fusion. Ne pas écrire `0` : un passage suivant peut encore servir l’arête.
 */
function fillMachineInputsFromEdges(
  nodes: Node[],
  edges: Edge[],
  remainingNeed: Record<string, number>,
  remainingSupply: Record<string, number>,
  edgeFlow: Record<string, number>,
): void {
  const byTarget = new Map<string, Edge[]>();
  for (const e of edges) {
    if (isContainerInputPort(nodes, e.target)) continue;
    if (!byTarget.has(e.target)) byTarget.set(e.target, []);
    byTarget.get(e.target)!.push(e);
  }
  for (const [tgt, es] of byTarget) {
    const need = remainingNeed[tgt] ?? 0;
    if (need <= EPS) continue;
    const supplies = es.map((e) => Math.max(remainingSupply[e.source] ?? 0, 0));
    const sumS = supplies.reduce((a, b) => a + b, 0);
    if (sumS <= EPS) continue;
    const totalTake = Math.min(need, sumS);
    for (let i = 0; i < es.length; i++) {
      const e = es[i]!;
      const take = totalTake * (supplies[i]! / sumS);
      edgeFlow[e.id] = take;
      remainingSupply[e.source] = Math.max(
        0,
        (remainingSupply[e.source] ?? 0) - take,
      );
    }
    remainingNeed[tgt] = Math.max(0, need - totalTake);
  }
}

function allocateRemainingToContainers(
  containerIn: Edge[],
  remaining: number,
  forcedPortRates: Record<string, number | undefined>,
  edgeFlow: Record<string, number>,
): void {
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

  let left = remaining;
  for (const ed of forcedEdges) {
    const need = portForcedRate(ed.target, forcedPortRates)!;
    const f = Math.min(left, need);
    edgeFlow[ed.id] = f;
    left = Math.max(0, left - f);
  }

  if (flexEdges.length === 0) return;

  if (flexEdges.length === 1) {
    edgeFlow[flexEdges[0]!.id] = left;
    return;
  }

  const share = left / flexEdges.length;
  for (const ed of flexEdges) {
    edgeFlow[ed.id] = share;
  }
}

/** Sorties conteneur (et repli) : machines selon la demande nette, surplus vers conteneurs. */
function allocateFlowsFromSourcePort(
  nodes: Node[],
  supply: number,
  edges: Edge[],
  effectiveRate: Record<string, number>,
  realEdges: Edge[],
  base: Map<string, number>,
  forcedPortRates: Record<string, number | undefined>,
  edgeFlow: Record<string, number>,
  recycleIds: Set<string>,
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
        recycleIds,
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

  const remaining = Math.max(
    0,
    supply - regular.reduce((s, ed) => s + (edgeFlow[ed.id] ?? 0), 0),
  );
  allocateRemainingToContainers(
    containerIn,
    remaining,
    forcedPortRates,
    edgeFlow,
  );
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
  recycleIds: Set<string>,
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

      const rows = es.map((ed) => {
        const mid = machineOf.get(ed.target);
        const need = allocatedDemandOnEdge(
          ed,
          nodes,
          effectiveRate,
          realEdges,
          base,
          forcedPortRates,
          recycleIds,
        );
        const locked =
          !mid ||
          machineHasForcedRate(mid, portsOfMachine, forcedPortRates) ||
          isContainerMachineId(nodes, mid);
        return { ed, mid, need, locked };
      });
      const sumNeed = rows.reduce((a, r) => a + r.need, 0);
      if (sumNeed <= EPS) continue;

      if (sumNeed > supply + EPS) {
        const lockedNeed = rows
          .filter((r) => r.locked)
          .reduce((a, r) => a + r.need, 0);
        const unlockedNeed = rows
          .filter((r) => !r.locked)
          .reduce((a, r) => a + r.need, 0);
        if (unlockedNeed <= EPS) continue;
        const free = Math.max(0, supply - lockedNeed);
        const factor = Math.min(1, free / unlockedNeed);
        if (factor >= 1 - EPS) continue;
        const seenMid = new Set<string>();
        for (const r of rows) {
          if (r.locked || !r.mid || seenMid.has(r.mid)) continue;
          seenMid.add(r.mid);
          const prev = m[r.mid] ?? 1;
          const next = Math.max(prev * factor, 1e-12);
          m[r.mid] = next;
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
  const recycleIds = findRecycleEdgeIds(nodes, realEdges, machineOf);

  /** Split : plusieurs départs machine depuis le même port → pas de ratio 1:1 (chaque aval prendrait 100 % de la sortie). */
  const splitSourcePorts = new Set<string>();
  const outMachineCount = new Map<string, number>();
  for (const e of realEdges) {
    if (recycleIds.has(e.id)) continue;
    if (edgeTouchesContainer(nodes, e.source, e.target)) continue;
    const ma = machineOf.get(e.source);
    const mb = machineOf.get(e.target);
    if (!ma || !mb || ma === mb) continue;
    const n = (outMachineCount.get(e.source) ?? 0) + 1;
    outMachineCount.set(e.source, n);
    if (n >= 2) splitSourcePorts.add(e.source);
  }

  const machLinks: MachLink[] = [];
  for (const e of realEdges) {
    const bo = base.get(e.source) ?? 0;
    const ma = machineOf.get(e.source);
    const mb = machineOf.get(e.target);
    if (!ma || !mb || ma === mb || bo <= 0) continue;
    if (edgeTouchesContainer(nodes, e.source, e.target)) continue;
    if (recycleIds.has(e.id)) continue;
    if (splitSourcePorts.has(e.source)) continue;
    const recycleAvailBase = recycleAvailableOnInput(
      e.target,
      realEdges,
      recycleIds,
      (src) => base.get(src) ?? 0,
    );
    const biFull = base.get(e.target) ?? 0;
    const bi = Math.max(0, biFull - recycleAvailBase);
    if (bi <= EPS) continue;
    machLinks.push({
      ma,
      mb,
      fwd: bo / bi,
      rev: bi / bo,
      recycleFedTarget: recycleAvailBase > EPS,
    });
  }

  /** Ancrage : les liaisons vers un port déjà recyclé ne fusionnent pas les composantes (l’externe ne dicte pas m). */
  const ratioLinks = machLinks.filter((L) => !L.recycleFedTarget);
  const comps = componentsOf(machines, ratioLinks);
  for (const members of comps) {
    const compSet = new Set(members);
    const hasForced = members.some((mid) =>
      machineHasForcedRate(mid, portsOfMachine, forcedPortRates),
    );
    if (hasForced) continue;

    const sources = sourceMachinesInComponent(compSet, ratioLinks);
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
      if (!L.recycleFedTarget && !Number.isNaN(m[L.ma])) {
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
    recycleIds,
  );

  rebalanceDeficitDownstream(
    m,
    nodes,
    realEdges,
    base,
    machineOf,
    portsOfMachine,
    forcedPortRates,
    recycleIds,
  );

  const effectiveRate: Record<string, number> = {};
  for (const pid of base.keys()) {
    const mid = machineOf.get(pid);
    const b = base.get(pid) ?? 0;
    effectiveRate[pid] = mid ? m[mid] * b : b;
  }
  applyForcedPortRates(effectiveRate, forcedPortRates, base.keys());

  const edgeFlow: Record<string, number> = {};

  const bySource = new Map<string, Edge[]>();
  for (const e of realEdges) {
    if (!bySource.has(e.source)) bySource.set(e.source, []);
    bySource.get(e.source)!.push(e);
  }

  const remainingSupply: Record<string, number> = {};
  const remainingNeed: Record<string, number> = {};
  for (const n of portNodes) {
    const d = n.data as ItemPortData;
    if (d.kind === "out") {
      if (!isContainerOutputPort(nodes, n.id)) {
        remainingSupply[n.id] = effectiveRate[n.id] ?? 0;
      }
    } else if (!isContainerInputPort(nodes, n.id)) {
      remainingNeed[n.id] = effectiveRate[n.id] ?? 0;
    }
  }

  /** 1a) Recyclage d’abord, puis alimentations externes, puis surplus vers conteneurs. */
  const machineEdges = realEdges.filter(
    (e) =>
      !isContainerOutputPort(nodes, e.source) &&
      !isContainerInputPort(nodes, e.target),
  );
  fillMachineInputsFromEdges(
    nodes,
    machineEdges.filter((e) => recycleIds.has(e.id)),
    remainingNeed,
    remainingSupply,
    edgeFlow,
  );
  fillMachineInputsFromEdges(
    nodes,
    machineEdges.filter((e) => !recycleIds.has(e.id)),
    remainingNeed,
    remainingSupply,
    edgeFlow,
  );

  for (const [src, es] of bySource) {
    if (isContainerOutputPort(nodes, src)) continue;
    const { containerIn } = partitionEdgesByContainerTarget(nodes, es);
    if (containerIn.length === 0) continue;
    allocateRemainingToContainers(
      containerIn,
      remainingSupply[src] ?? 0,
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
      recycleIds,
    );
  }

  for (const e of realEdges) {
    if (edgeFlow[e.id] !== undefined) continue;
    const left = remainingSupply[e.source] ?? effectiveRate[e.source] ?? 0;
    const need =
      remainingNeed[e.target] ??
      allocatedDemandOnEdge(
        e,
        nodes,
        effectiveRate,
        realEdges,
        base,
        forcedPortRates,
        recycleIds,
      );
    const take = Math.min(left, Math.max(0, need));
    edgeFlow[e.id] = take;
    if (remainingSupply[e.source] !== undefined) {
      remainingSupply[e.source] = Math.max(0, remainingSupply[e.source]! - take);
    }
    if (remainingNeed[e.target] !== undefined) {
      remainingNeed[e.target] = Math.max(0, remainingNeed[e.target]! - take);
    }
  }

  /** 2) Sommes entrantes / sortantes par port (évite double comptage sur fusion). */
  const sumIn = new Map<string, number>();
  for (const e of realEdges) {
    const f = edgeFlow[e.id] ?? 0;
    sumIn.set(e.target, (sumIn.get(e.target) ?? 0) + f);
  }

  const portDelta: Record<string, number> = {};
  for (const pid of base.keys()) portDelta[pid] = 0;

  for (const n of portNodes) {
    const pid = n.id;
    const kind = (n.data as ItemPortData).kind;
    const nominal = effectiveRate[pid] ?? 0;
    if (kind === "out") {
      const demand = outgoingDemandOnPort(
        pid,
        nodes,
        effectiveRate,
        realEdges,
        base,
        forcedPortRates,
        recycleIds,
      );
      const fv = portForcedRate(pid, forcedPortRates);
      if (fv !== undefined) {
        /** Forcé : surplus ou déficit par rapport à la demande aval (50 vs 40+60). */
        portDelta[pid] = fv - demand;
      } else {
        /**
         * Surplus d’offre non consommé (108 produits, 100 pris) : pas un overflow.
         * Déficit si la demande aval dépasse l’offre.
         */
        portDelta[pid] = Math.min(0, nominal - demand);
      }
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
