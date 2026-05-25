import type { Edge, Node } from "@xyflow/react";
import { CONTAINER_SLOT_COUNT } from "@/constants/container";
import type { FlowSolveResult } from "@/types/flowSolve";
import type { ContainerFrameData, ItemPortData } from "@/types/graph";
import { isPortItemAssigned } from "@/types/graph";

const EPS = 1e-3;

function parentIsContainer(nodes: Node[], parentId: string | undefined): boolean {
  if (!parentId) return false;
  return nodes.some((n) => n.id === parentId && n.type === "containerFrame");
}

function getContainerFrameIds(nodes: Node[]): string[] {
  return nodes.filter((n) => n.type === "containerFrame").map((n) => n.id);
}

/**
 * Après le solveur classique : rééquilibre ports / deltas des conteneurs,
 * calcule le stockage (entrées − sorties) et les conflits (sortie > entrée).
 */
export function applyContainerFlow(
  nodes: Node[],
  edges: Edge[],
  result: FlowSolveResult,
): FlowSolveResult {
  const realEdges = edges.filter((e) => !e.data?.suggested);
  const sumIn = new Map<string, number>();
  const sumOut = new Map<string, number>();
  for (const e of realEdges) {
    const f = result.edgeFlow[e.id] ?? 0;
    sumOut.set(e.source, (sumOut.get(e.source) ?? 0) + f);
    sumIn.set(e.target, (sumIn.get(e.target) ?? 0) + f);
  }

  const effectiveRate = { ...result.effectiveRate };
  const portDelta = { ...result.portDelta };
  const portStoredPerMin = { ...result.portStoredPerMin };
  const conflictMachineIds = new Set(result.conflictMachineIds);
  const conflictPorts = new Set(result.conflictPortIds);
  const conflictEdges = new Set(result.conflictEdgeIds);

  for (const frameId of getContainerFrameIds(nodes)) {
    const frame = nodes.find((n) => n.id === frameId);
    if (!frame) continue;
    const d = frame.data as ContainerFrameData;
    const variant = d.variant ?? "standard";
    const slotCount = CONTAINER_SLOT_COUNT[variant];
    const outputEnabled = d.outputEnabled !== false;

    for (let slot = 0; slot < slotCount; slot++) {
      const inId = `${frameId}-in-${slot}`;
      const outId = `${frameId}-out-${slot}`;
      const inNode = nodes.find((n) => n.id === inId);
      if (!inNode) continue;
      const inData = inNode.data as ItemPortData;
      if (!isPortItemAssigned(inData.itemId)) continue;

      const recv = sumIn.get(inId) ?? 0;
      const sent = outputEnabled ? (sumOut.get(outId) ?? 0) : 0;
      const stored = Math.max(0, recv - sent);

      effectiveRate[inId] = recv > EPS ? recv : effectiveRate[inId] ?? 0;
      if (outputEnabled) {
        effectiveRate[outId] = sent;
      } else {
        effectiveRate[outId] = 0;
      }

      portDelta[inId] = 0;
      if (outputEnabled) {
        portDelta[outId] = recv - sent;
        if (sent > recv + EPS * (1 + Math.abs(recv))) {
          conflictMachineIds.add(frameId);
          conflictPorts.add(inId);
          conflictPorts.add(outId);
          for (const e of realEdges) {
            if (e.source === outId || e.target === inId) conflictEdges.add(e.id);
          }
        }
      } else {
        portDelta[outId] = 0;
      }

      if (stored > EPS) {
        portStoredPerMin[inId] = stored;
      } else {
        delete portStoredPerMin[inId];
      }
    }
  }

  const hardConflict = conflictMachineIds.size > 0;
  let errorMessage = result.errorMessage;
  if (hardConflict && !errorMessage) {
    errorMessage =
      "Manque de débit sur la chaîne : vérifiez les ports en rouge et les débits forcés.";
  }

  return {
    ...result,
    effectiveRate,
    portDelta,
    portStoredPerMin,
    hardConflict,
    conflictMachineIds: [...conflictMachineIds],
    conflictPortIds: [...conflictPorts],
    conflictEdgeIds: [...conflictEdges],
    errorMessage,
  };
}

/** Exclure les liaisons dont une extrémité est un conteneur (pas de ratio recette). */
export function edgeTouchesContainer(
  nodes: Node[],
  sourcePortId: string,
  targetPortId: string,
): boolean {
  const src = nodes.find((n) => n.id === sourcePortId);
  const tgt = nodes.find((n) => n.id === targetPortId);
  return (
    parentIsContainer(nodes, src?.parentId) ||
    parentIsContainer(nodes, tgt?.parentId)
  );
}

export function isContainerMachineId(
  nodes: Node[],
  machineId: string,
): boolean {
  return nodes.some((n) => n.id === machineId && n.type === "containerFrame");
}

/** Port d’entrée d’un conteneur (consomme le surplus amont, pas un ratio recette). */
export function isContainerInputPort(
  nodes: Node[],
  portId: string,
): boolean {
  const n = nodes.find((node) => node.id === portId);
  if (n?.type !== "itemPort") return false;
  const d = n.data as ItemPortData;
  return d.kind === "in" && isContainerMachineId(nodes, n.parentId ?? "");
}

/** Port de sortie d’un conteneur (offre = débit reçu sur l’entrée jumelée). */
export function isContainerOutputPort(
  nodes: Node[],
  portId: string,
): boolean {
  const n = nodes.find((node) => node.id === portId);
  if (n?.type !== "itemPort") return false;
  const d = n.data as ItemPortData;
  return d.kind === "out" && isContainerMachineId(nodes, n.parentId ?? "");
}

/** `f3-out-1` → `f3-in-1` */
export function pairedContainerInputPortId(outPortId: string): string | null {
  const m = /^(.+)-out-(\d+)$/.exec(outPortId);
  if (!m) return null;
  return `${m[1]}-in-${m[2]}`;
}
