/** Min length of the horizontal stub leaving/entering a port. */
export const MIN_PORT_STUB = 20;

/** Treat as forward when target is at least this far to the right of source. */
export const FORWARD_MIN_GAP = 24;

/** Extra run-out past a port on reverse M-to-N buses. */
export const BACKWARDS_STUB = 40;

/**
 * Min distance from every port to the reverse U-turn bus, so the long H
 * clears a min-height machine (~196px, port near vertical center) plus a
 * visible gutter. The bus sits above, below, or in a gap — whichever makes
 * the verticals shorter.
 */
export const REVERSE_CLEARANCE = 130;

/** Default source stub length on a bus (1-to-N / M-to-N). */
export const STUB_LEN = 28;

/** Default jog when inserting a kink / U-turn. */
export const KINK_JOG = 32;

/** Collapse / merge threshold (snap grid). */
export const MIN_SEG = 2;

/**
 * Flow-space grab distance for aligning a dragged segment to other buses / ports.
 * Overlay may raise this so it stays ~SNAP_ALIGN_SCREEN pixels on screen.
 */
export const SNAP_ALIGN = 12;

/** Minimum on-screen grab distance for alignment snapping. */
export const SNAP_ALIGN_SCREEN = 14;

export const EPS = 0.51;

/** CAD hop radius in canvas px. */
export const HOP_RADIUS = 8;

/** Padding around a dragged machine when testing foreign-wire hits. */
export const MACHINE_HIT_PAD = 8;
