// Tooltip/label placement: keep the label inside the viewport, flipping
// below the anchor when there is no room above. Pure math, unit tested.

export interface LabelPlacement {
  x: number;
  y: number;
  below: boolean;
}

export function clampLabel(
  anchorX: number,
  anchorY: number,
  labelW: number,
  labelH: number,
  hostW: number,
  hostH: number,
  margin = 4,
): LabelPlacement {
  let x = anchorX - labelW / 2;
  x = Math.max(margin, Math.min(x, hostW - labelW - margin));

  let below = false;
  let y = anchorY - labelH - 6;
  if (y < margin) {
    below = true;
    y = anchorY + 10;
  }
  y = Math.max(margin, Math.min(y, hostH - labelH - margin));
  return { x, y, below };
}
