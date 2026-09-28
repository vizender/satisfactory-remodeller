import type { Edge, Node } from "@xyflow/react";
import {
  solverClockMultiplier,
  resolveOperatingPoint,
} from "@/lib/machineOperatingPoint";
import { pairedContainerInputPortId } from "@/lib/containerFlow";
import {
  combine,
  FlowLinearModel,
  negative,
  type Expression,
} from "@/lib/flowLinearModel";
import {
  portItemsCompatible,
  type ContainerFrameData,
  type ItemPortData,
  type MachineFrameData,
} from "@/types/graph";
import type { FlowSolveResult } from "@/types/flowSolve";

const EPS = 1e-5;
const compareId = (a: { id: string }, b: { id: string }) =>
  a.id.localeCompare(b.id);
const differs = (a: number, b: number) =>
  Math.abs(a - b) > EPS * (1 + Math.max(Math.abs(a), Math.abs(b)));

interface Port {
  id: string;
  machine: string;
  kind: "in" | "out";
  container: boolean;
  rate: Expression;
  incoming: Edge[];
  outgoing: Edge[];
}

function emptyResult(): FlowSolveResult {
  return {
    machineMultiplier: {},
    machineClockPercent: {},
    portAdvice: {},
    effectiveRate: {},
    edgeFlow: {},
    portDelta: {},
    hardConflict: false,
    conflictMachineIds: [],
    conflictEdgeIds: [],
    conflictPortIds: [],
    overriddenPortIds: [],
    portStoredPerMin: {},
    errorMessage: null,
  };
}

/** SCCs identify recycling independently of node/edge order, including container paths. */
function stronglyConnected(
  ids: string[],
  links: [string, string][],
): Map<string, number> {
  const adjacency = new Map(ids.map((id) => [id, [] as string[]]));
  for (const [a, b] of links) adjacency.get(a)!.push(b);
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const stack: string[] = [];
  const active = new Set<string>();
  const component = new Map<string, number>();
  let next = 0;
  let group = 0;
  function visit(id: string) {
    index.set(id, next);
    low.set(id, next++);
    stack.push(id);
    active.add(id);
    for (const to of adjacency.get(id)!) {
      if (!index.has(to)) {
        visit(to);
        low.set(id, Math.min(low.get(id)!, low.get(to)!));
      } else if (active.has(to)) {
        low.set(id, Math.min(low.get(id)!, index.get(to)!));
      }
    }
    if (low.get(id) !== index.get(id)) return;
    let member: string;
    do {
      member = stack.pop()!;
      active.delete(member);
      component.set(member, group);
    } while (member !== id);
    group++;
  }
  for (const id of ids) if (!index.has(id)) visit(id);
  return component;
}

function solveComponent(
  nodes: Node[],
  edges: Edge[],
  forced: Record<string, number | undefined>,
): FlowSolveResult {
  const result = emptyResult();
  const model = new FlowLinearModel();
  const frames = nodes.filter(
    (n) => n.type === "machineFrame" || n.type === "containerFrame",
  );
  const frameById = new Map(frames.map((n) => [n.id, n]));
  const multipliers = new Map<string, Expression>();
  for (const n of frames)
    if (n.type === "machineFrame") multipliers.set(n.id, model.variable());
  const ports = new Map<string, Port>();
  for (const n of nodes) {
    if (n.type !== "itemPort" || !n.parentId) continue;
    const frame = frameById.get(n.parentId);
    if (!frame) continue;
    const d = n.data as ItemPortData;
    const container = frame.type === "containerFrame";
    const base = Number.isFinite(d.perMinute)
      ? Math.max(0, d.perMinute) *
        (container ? 1 : solverClockMultiplier(frame.data as MachineFrameData))
      : 0;
    const rate = container
      ? model.variable()
      : new Map([...multipliers.get(frame.id)!].map(([v, c]) => [v, c * base]));
    ports.set(n.id, {
      id: n.id,
      machine: frame.id,
      kind: d.kind,
      container,
      rate,
      incoming: edges.filter((e) => e.target === n.id),
      outgoing: edges.filter((e) => e.source === n.id),
    });
  }
  const flow = new Map(edges.map((e) => [e.id, model.variable()]));
  const edgeSum = (es: Edge[]) => combine(...es.map((e) => flow.get(e.id)!));
  const deficits: Expression[] = [];
  const surplus = new Map<string, Expression>();
  const storage: Expression[] = [];

  for (const p of ports.values()) {
    if (p.container) {
      model.constrain(
        combine(
          p.rate,
          negative(edgeSum(p.kind === "in" ? p.incoming : p.outgoing)),
        ),
        { equal: 0 },
      );
      if (p.kind === "out") {
        const input = ports.get(pairedContainerInputPortId(p.id) ?? "");
        const enabled =
          (frameById.get(p.machine)!.data as ContainerFrameData)
            .outputEnabled !== false;
        model.constrain(combine(p.rate, negative(input?.rate ?? new Map())), {
          max: 0,
        });
        if (!enabled) model.constrain(p.rate, { equal: 0 });
      } else {
        const output = ports.get(p.id.replace(/-in-(\d+)$/, "-out-$1"));
        storage.push(combine(p.rate, negative(output?.rate ?? new Map())));
      }
    } else if (p.kind === "in" && p.incoming.length) {
      const deficit = model.variable();
      deficits.push(deficit);
      model.constrain(combine(edgeSum(p.incoming), deficit, negative(p.rate)), {
        equal: 0,
      });
    } else if (p.kind === "out") {
      const unused = model.variable();
      model.constrain(combine(edgeSum(p.outgoing), unused, negative(p.rate)), {
        equal: 0,
      });
      if (p.outgoing.length) surplus.set(p.id, unused);
    }
  }

  const links: [string, string][] = edges.map((e) => [
    ports.get(e.source)!.machine,
    ports.get(e.target)!.machine,
  ]);
  const components = stronglyConnected(
    frames.map((n) => n.id),
    links,
  );
  const cyclic = new Set<number>();
  for (const [a, b] of links)
    if (components.get(a) === components.get(b)) cyclic.add(components.get(a)!);
  const forcedPorts = Object.entries(forced)
    .filter(
      ([id, value]) =>
        ports.has(id) &&
        value !== undefined &&
        Number.isFinite(value) &&
        value >= 0,
    )
    .sort(([a], [b]) => a.localeCompare(b)) as [string, number][];
  const predecessors = new Map<number, Set<number>>();
  for (const group of components.values()) predecessors.set(group, new Set());
  for (const [a, b] of links) {
    if (components.get(a) !== components.get(b))
      predecessors.get(components.get(b)!)!.add(components.get(a)!);
  }
  const depths = new Map<number, number>();
  function depth(group: number): number {
    const cached = depths.get(group);
    if (cached !== undefined) return cached;
    const value = Math.max(
      0,
      ...[...predecessors.get(group)!].map((p) => depth(p) + 1),
    );
    depths.set(group, value);
    return value;
  }
  const priorityGroups = new Map<number, [string, number][]>();
  for (const pin of forcedPorts) {
    const p = ports.get(pin[0])!;
    // Inside one recipe/cycle there is no downstream machine: output goals take precedence.
    const priority =
      depth(components.get(p.machine)!) * 2 + (p.kind === "out" ? 1 : 0);
    const group = priorityGroups.get(priority) ?? [];
    group.push(pin);
    priorityGroups.set(priority, group);
  }
  const priorities = [...priorityGroups.keys()].sort((a, b) => b - a);
  function applyTargets(group: [string, number][]) {
    // Equal-priority targets share relative error rather than depending on IDs or edit order.
    const deviations = group.map(([id, target]) => {
      const distance = model.distance(ports.get(id)!.rate, target);
      return new Map(
        [...distance].map(([v, c]) => [v, c / Math.max(1, target)]),
      );
    });
    if (deviations.length > 1) {
      const worst = model.variable();
      for (const deviation of deviations)
        model.constrain(combine(deviation, negative(worst)), { max: 0 });
      model.minimize(worst);
    }
    model.minimize(combine(...deviations));
  }

  if (forcedPorts.length) {
    applyTargets(priorityGroups.get(priorities[0]!)!);
  } else {
    // One stable source anchors each otherwise unconstrained connected factory.
    const incomingGroups = new Set(
      links
        .filter(([a, b]) => components.get(a) !== components.get(b))
        .map(([, b]) => components.get(b)),
    );
    const anchor =
      frames.find(
        (n) =>
          multipliers.has(n.id) && !incomingGroups.has(components.get(n.id)),
      ) ?? frames.find((n) => multipliers.has(n.id));
    if (anchor) {
      const data = anchor.data as MachineFrameData;
      const cm = solverClockMultiplier(data);
      const reference = data.referenceThroughput;
      model.target(
        multipliers.get(anchor.id)!,
        cm > 0 && reference !== undefined && Number.isFinite(reference)
          ? reference / cm
          : 1,
      );
    }
  }

  // Only unavoidable shortages survive. Upstream pins may create surplus, never new shortages.
  model.minimize(combine(...deficits));
  for (const priority of priorities.slice(1))
    applyTargets(priorityGroups.get(priority)!);

  // Satisfy downstream demand first; keep unavoidable excess upstream instead of
  // manufacturing extra downstream products just to reduce the numeric waste total.
  const surplusByDepth = new Map<number, Expression[]>();
  for (const [id, unused] of surplus) {
    const rank = depth(components.get(ports.get(id)!.machine)!);
    const group = surplusByDepth.get(rank) ?? [];
    group.push(unused);
    surplusByDepth.set(rank, group);
  }
  const totalSurplus = combine(...surplus.values());
  model.minimize(totalSurplus, false);
  if (model.value(totalSurplus) === 0) {
    // Most plans balance exactly: one solve instead of one per chain depth.
    model.constrain(totalSurplus, { equal: 0 });
  } else {
    for (const rank of [...surplusByDepth.keys()].sort((a, b) => b - a)) {
      model.minimize(combine(...surplusByDepth.get(rank)!));
    }
  }
  // Use internal recycling before importing fresh material into a loop.
  const externalToLoops = edges.filter((e) => {
    const a = components.get(ports.get(e.source)!.machine)!;
    const b = components.get(ports.get(e.target)!.machine)!;
    return a !== b && cyclic.has(b);
  });
  model.minimize(edgeSum(externalToLoops));
  // A container passes material through before accumulating it.
  model.minimize(combine(...storage));

  // Forced rates have already fixed required branches. Equalize remaining choices in items/min.
  const fairness: Expression[] = [];
  for (const p of ports.values()) {
    const es = p.kind === "in" ? p.incoming : p.outgoing;
    // Recycling and external supplies are separate priority classes at merges.
    const groups = [
      es.filter((e) => !externalToLoops.includes(e)),
      es.filter((e) => externalToLoops.includes(e)),
    ];
    for (const group of groups)
      for (let i = 0; i < group.length; i++)
        for (let j = i + 1; j < group.length; j++) {
          fairness.push(
            model.distance(
              combine(
                flow.get(group[i]!.id)!,
                negative(flow.get(group[j]!.id)!),
              ),
              0,
            ),
          );
        }
  }
  model.minimize(combine(...fairness));
  // Bound otherwise free circulation and unnecessary machines without overriding priorities.
  model.minimize(combine(...multipliers.values(), ...flow.values()), false);

  const conflictPorts = new Set<string>();
  for (const [id, m] of multipliers) {
    const data = frameById.get(id)!.data as MachineFrameData;
    const operating = resolveOperatingPoint(
      data,
      Math.max(0, model.value(m)) * solverClockMultiplier(data),
    );
    result.machineMultiplier[id] = operating.count;
    result.machineClockPercent[id] = operating.clock;
  }
  for (const n of frames)
    if (n.type === "containerFrame") result.machineMultiplier[n.id] = 1;
  for (const e of edges)
    result.edgeFlow[e.id] = Math.max(0, model.value(flow.get(e.id)!));
  for (const p of ports.values()) {
    const rate = Math.max(0, model.value(p.rate));
    result.effectiveRate[p.id] = rate;
    if (!forcedPorts.some(([id]) => id === p.id)) {
      if (
        cyclic.has(components.get(p.machine)!) ||
        forcedPorts.some(([id]) => ports.get(id)!.machine === p.machine)
      )
        result.portAdvice[p.id] = "coupled";
      else if (forcedPorts.length) result.portAdvice[p.id] = "derived";
    }
    const received = model.value(edgeSum(p.incoming));
    const sent = model.value(edgeSum(p.outgoing));
    let delta = p.container
      ? 0
      : p.kind === "out"
        ? rate - sent
        : p.incoming.length
          ? received - rate
          : 0;
    if (p.container && p.kind === "in") {
      const out = ports.get(p.id.replace(/-in-(\d+)$/, "-out-$1"));
      const stored = rate - (out ? model.value(out.rate) : 0);
      if (stored > EPS) result.portStoredPerMin[p.id] = stored;
    }
    if (p.container && p.kind === "out") {
      const input = ports.get(pairedContainerInputPortId(p.id) ?? "");
      delta = input ? model.value(input.rate) - rate : 0;
    }
    result.portDelta[p.id] = differs(delta, 0) ? delta : 0;
    if (
      !p.container &&
      p.kind === "in" &&
      p.incoming.length &&
      delta < 0 &&
      differs(received, rate)
    )
      conflictPorts.add(p.id);
  }
  for (const [id, target] of forcedPorts) {
    if (differs(result.effectiveRate[id]!, target))
      result.overriddenPortIds.push(id);
  }
  // Impossible downstream goals remain visible as conflicts (e.g. a stopped machine).
  for (const [id] of priorityGroups.get(priorities[0]!) ?? []) {
    if (result.overriddenPortIds.includes(id)) conflictPorts.add(id);
  }
  result.conflictPortIds = [...conflictPorts];
  result.conflictMachineIds = [
    ...new Set([...conflictPorts].map((id) => ports.get(id)!.machine)),
  ];
  result.conflictEdgeIds = edges
    .filter((e) => conflictPorts.has(e.source) || conflictPorts.has(e.target))
    .map((e) => e.id);
  result.hardConflict = conflictPorts.size > 0;
  if (result.hardConflict)
    result.errorMessage =
      "Débit demandé impossible : vérifiez les ports en rouge et les liaisons.";
  return result;
}

/** Solve independent connected factories separately, prioritizing downstream targets.
 * Inputs without links are external raw materials. All displayed machine rates obey
 * one recipe multiplier, including targets overridden by downstream demand.
 */
export function solveFlow(
  nodes: Node[],
  edges: Edge[],
  forcedPortRates: Record<string, number | undefined>,
): FlowSolveResult {
  const result = emptyResult();
  const frames = new Map(
    nodes
      .filter((n) => n.type === "machineFrame" || n.type === "containerFrame")
      .map((n) => [n.id, n]),
  );
  const ports = new Map(
    nodes
      .filter((n) => n.type === "itemPort" && frames.has(n.parentId ?? ""))
      .map((n) => [n.id, n]),
  );
  const realEdges = edges
    .filter((e) => {
      const a = ports.get(e.source);
      const b = ports.get(e.target);
      return (
        !e.data?.suggested &&
        a &&
        b &&
        (a.data as ItemPortData).kind === "out" &&
        (b.data as ItemPortData).kind === "in" &&
        portItemsCompatible(
          (a.data as ItemPortData).itemId,
          (b.data as ItemPortData).itemId,
        )
      );
    })
    .sort(compareId);
  const neighbors = new Map(
    [...frames.keys()].map((id) => [id, new Set<string>()]),
  );
  for (const e of realEdges) {
    const a = ports.get(e.source)!.parentId!;
    const b = ports.get(e.target)!.parentId!;
    neighbors.get(a)!.add(b);
    neighbors.get(b)!.add(a);
  }
  const visited = new Set<string>();
  for (const id of [...frames.keys()].sort()) {
    if (visited.has(id)) continue;
    const group = new Set<string>();
    const queue = [id];
    while (queue.length) {
      const next = queue.pop()!;
      if (visited.has(next)) continue;
      visited.add(next);
      group.add(next);
      queue.push(...neighbors.get(next)!);
    }
    const groupNodes = [...frames.values(), ...ports.values()]
      .filter((n) => group.has(n.id) || group.has(n.parentId ?? ""))
      .sort(compareId);
    const groupEdges = realEdges.filter((e) =>
      group.has(ports.get(e.source)!.parentId!),
    );
    const part = solveComponent(groupNodes, groupEdges, forcedPortRates);
    for (const key of [
      "machineMultiplier",
      "machineClockPercent",
      "portAdvice",
      "effectiveRate",
      "edgeFlow",
      "portDelta",
      "portStoredPerMin",
    ] as const)
      Object.assign(result[key], part[key]);
    for (const key of [
      "conflictMachineIds",
      "conflictEdgeIds",
      "conflictPortIds",
      "overriddenPortIds",
    ] as const)
      result[key].push(...part[key]);
    result.hardConflict ||= part.hardConflict;
    result.errorMessage ??= part.errorMessage;
  }
  return result;
}
