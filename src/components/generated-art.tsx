/**
 * Drawing for generated shop items (catalog.ts): one SVG per decoration family,
 * coloured by the item's palette, plus the particle effects.
 */
import { memo, useId, type CSSProperties } from "react";
import { genItem } from "@/lib/vela/catalog";
import { cn } from "@/lib/utils";

const around = (n: number, offset = 0) =>
  Array.from({ length: n }, (_, i) => offset + (360 / n) * i);
const onCircle = (deg: number, r: number) => {
  const rad = (deg * Math.PI) / 180;
  return [50 + Math.cos(rad) * r, 50 + Math.sin(rad) * r] as const;
};

export const GenDecorationLayer = memo(function GenDecorationLayer({ id }: { id: string }) {
  const uid = useId().replace(/:/g, "");
  const g = genItem("decoration", id);
  if (!g) return null;
  const { a, b, c } = g.palette;
  const glow = (
    <defs>
      <filter id={`${uid}g`} x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation={2.2} result="b" />
        <feMerge>
          <feMergeNode in="b" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
  );
  let art;
  switch (g.family) {
    case "ring":
      art = (
        <>
          <circle
            className="deco-anim deco-pulse"
            style={{ transformOrigin: "50px 50px" }}
            cx={50}
            cy={50}
            r={54}
            fill="none"
            stroke={a}
            strokeWidth={3.2}
          />
          <circle cx={50} cy={50} r={58} fill="none" stroke={b} strokeWidth={1} opacity={0.7} />
        </>
      );
      break;
    case "perlen":
      art = around(24).map((deg, i) => {
        const [x, y] = onCircle(deg, 56);
        return (
          <circle
            key={deg}
            cx={x}
            cy={y}
            r={i % 2 ? 4.6 : 5.8}
            fill={i % 3 ? a : b}
            stroke={c}
            strokeWidth={0.6}
          />
        );
      });
      break;
    case "orbit":
      art = (
        <>
          <circle cx={50} cy={50} r={56} fill="none" stroke={a} strokeWidth={0.8} opacity={0.6} />
          <g
            className="deco-anim deco-spin-slow"
            style={{ transformOrigin: "50px 50px", animationDuration: "16s" }}
          >
            {around(6).map((deg, i) => {
              const [x, y] = onCircle(deg, 56);
              const r = i % 2 ? 3 : 5;
              return (
                <path
                  key={deg}
                  d={`M${x} ${y - r} Q${x} ${y} ${x + r} ${y} Q${x} ${y} ${x} ${y + r} Q${x} ${y} ${x - r} ${y} Q${x} ${y} ${x} ${y - r}Z`}
                  fill={i % 2 ? b : a}
                />
              );
            })}
          </g>
        </>
      );
      break;
    case "strahlen":
      art = (
        <g className="deco-anim deco-spin-slow" style={{ transformOrigin: "50px 50px" }}>
          {around(36).map((deg, i) => (
            <line
              key={deg}
              x1={50}
              y1={-4 - (i % 3) * 2.5}
              x2={50}
              y2={5}
              stroke={i % 2 ? a : b}
              strokeWidth={i % 2 ? 1.6 : 2.4}
              strokeLinecap="round"
              transform={`rotate(${deg} 50 50)`}
            />
          ))}
        </g>
      );
      break;
    case "blueten":
      art = [150, 115, 90, 65, 30, 200, 340].map((deg, i) => {
        const [x, y] = onCircle(deg, 55);
        const r = i === 2 ? 9 : 6.5;
        return (
          <g key={deg} transform={`translate(${x} ${y}) rotate(${deg})`}>
            {around(5).map((p) => (
              <ellipse
                key={p}
                cx={0}
                cy={-r * 0.55}
                rx={r * 0.42}
                ry={r * 0.6}
                fill={b}
                transform={`rotate(${p})`}
              />
            ))}
            <circle r={r * 0.3} fill={a} />
          </g>
        );
      });
      break;
    case "flammen":
      art = around(14).map((deg, i) => (
        <g key={deg} transform={`rotate(${deg} 50 50)`}>
          <path
            className="deco-anim deco-flicker"
            style={{ transformOrigin: "50px 2px", animationDelay: `${(i % 5) * 0.17}s` }}
            d={`M44 2 C44 -4 49 -6 50 ${-9 - (i % 3) * 3} C51 -6 56 -4 56 2 Z`}
            fill={i % 2 ? a : b}
          />
        </g>
      ));
      break;
    case "herzen":
      art = around(10).map((deg, i) => {
        const [x, y] = onCircle(deg, 56);
        const s = i % 2 ? 0.8 : 1.1;
        // Position on the outer group: the CSS animation replaces the inner transform.
        return (
          <g key={deg} transform={`translate(${x} ${y}) scale(${s})`}>
            <path
              className="deco-anim deco-twinkle"
              style={{ transformOrigin: "0px 0px", animationDelay: `${i * 0.25}s` }}
              d="M0 3 C-6 -2 -4 -7 0 -4 C4 -7 6 -2 0 3 Z"
              fill={i % 2 ? b : a}
            />
          </g>
        );
      });
      break;
    default:
      // kristalle
      art = around(8).map((deg, i) => {
        const [x, y] = onCircle(deg, 56);
        return (
          <g key={deg} transform={`translate(${x} ${y}) rotate(${deg + 90})`}>
            <path d="M0 -8 L4 0 L0 8 L-4 0 Z" fill={a} />
            <path d="M0 -8 L4 0 L0 0 Z" fill={b} opacity={0.8} />
            {i % 2 ? null : <circle cx={0} cy={-11} r={1.1} fill={b} />}
          </g>
        );
      });
  }
  return (
    <svg
      aria-hidden="true"
      viewBox="-18 -18 136 136"
      className="pointer-events-none absolute -inset-[18%] h-[136%] w-[136%] overflow-visible"
    >
      {glow}
      <g filter={`url(#${uid}g)`}>{art}</g>
    </svg>
  );
});

export const GenEffectLayer = memo(function GenEffectLayer({
  id,
  className,
}: {
  id: string;
  className?: string;
}) {
  const g = genItem("effect", id);
  if (!g) return null;
  const { a, b } = g.palette;
  const rise = g.family === "funken";
  return (
    <div
      aria-hidden="true"
      className={cn("pointer-events-none absolute overflow-hidden", className)}
    >
      {Array.from({ length: 18 }, (_, i) => {
        const size = rise ? 3 + (i % 4) : 6 + ((i * 3) % 6);
        const style: CSSProperties = {
          left: `${(i * 37 + 11) % 100}%`,
          width: size,
          height: size,
          animationDelay: `${((i * 7) % 12) * 0.6}s`,
          animationDuration: `${7 + ((i * 5) % 6)}s`,
          background: i % 3 ? a : b,
          boxShadow: rise ? `0 0 8px 2px ${a}` : undefined,
          borderRadius: rise ? 999 : "80% 0 80% 0",
        };
        return (
          <span
            key={i}
            className={cn("fx-particle deco-anim absolute", rise && "fx-gen-rise")}
            style={style}
          />
        );
      })}
    </div>
  );
});
