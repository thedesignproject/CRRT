import type { CSSProperties } from "react";
import { cn } from "../lib/utils";

/** The pixel carrot. Brand mark and the one metaphor (quota, 404, empty states). */
export function CarrotMark({ size = 22, className, style }: { size?: number; className?: string; style?: CSSProperties }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 8 8"
      aria-hidden="true"
      style={style}
      className={cn("shrink-0 [image-rendering:pixelated]", className)}
    >
      <rect x="4" y="0" width="1" height="2" className="fill-leaf" />
      <rect x="5" y="1" width="1" height="1" className="fill-leaf" />
      <rect x="3" y="2" width="3" height="2" className="fill-carrot" />
      <rect x="2" y="4" width="3" height="2" className="fill-carrot" />
      <rect x="1" y="6" width="2" height="1" className="fill-carrot" />
      <rect x="0" y="7" width="1" height="1" className="fill-carrot" />
    </svg>
  );
}
