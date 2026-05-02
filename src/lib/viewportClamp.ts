/** Ajuste la position d’un panneau `position: fixed` (coin haut-gauche) pour qu’il reste dans la fenêtre. */
export function clampFixedPanelToViewport(
  rect: { width: number; height: number },
  anchorTopLeft: { x: number; y: number },
  margin = 8,
): { x: number; y: number } {
  const vw =
    typeof window !== "undefined" ? window.innerWidth : rect.width + anchorTopLeft.x;
  const vh =
    typeof window !== "undefined" ? window.innerHeight : rect.height + anchorTopLeft.y;
  let x = anchorTopLeft.x;
  let y = anchorTopLeft.y;
  if (x + rect.width > vw - margin) x = vw - rect.width - margin;
  if (x < margin) x = margin;
  if (y + rect.height > vh - margin) y = vh - rect.height - margin;
  if (y < margin) y = margin;
  return { x, y };
}
