/**
 * Discord-style avatar decorations (animated frames around the profile picture)
 * and profile effects (particles over the profile header). Drawn with SVG/CSS,
 * so they stay sharp at every size; animations pause for "reduce motion".
 */
import { useId, type ReactNode } from "react";
import type { AvatarDecoration, ProfileEffect } from "@/lib/vela/decorations";
import { cn } from "@/lib/utils";

/** Avatar with its decoration. The decoration overflows the avatar box by 18 %. */
export function DecoratedAvatar({
  src,
  name,
  decoration,
  className,
  imgClassName,
  letterClassName = "text-2xl",
}: {
  src: string | null;
  name: string;
  decoration: AvatarDecoration | null | undefined;
  /** Size (e.g. "size-28"). */
  className?: string;
  /** Extra classes for the round picture (border, ring …). */
  imgClassName?: string;
  letterClassName?: string;
}) {
  return (
    <span className={cn("relative inline-block shrink-0", className)}>
      <span
        className={cn(
          "block h-full w-full overflow-hidden rounded-full bg-bg-subtle",
          imgClassName,
        )}
      >
        {src ? (
          <img src={src} alt="" className="h-full w-full object-cover" />
        ) : (
          <span
            className={cn("grid h-full w-full place-items-center font-display", letterClassName)}
          >
            {name.charAt(0)}
          </span>
        )}
      </span>
      {decoration ? <DecorationLayer id={decoration} /> : null}
    </span>
  );
}

export function DecorationLayer({ id }: { id: AvatarDecoration }) {
  if (id === "neon" || id === "regenbogen") {
    return (
      <span aria-hidden="true" className="pointer-events-none absolute -inset-[9%]">
        <span
          className={cn("deco-ring deco-anim absolute inset-0 rounded-full", `deco-ring-${id}`)}
        />
        <span
          className={cn(
            "deco-ring deco-anim absolute inset-0 rounded-full opacity-70 blur-md",
            `deco-ring-${id}`,
          )}
        />
      </span>
    );
  }
  return (
    <svg
      aria-hidden="true"
      viewBox="-18 -18 136 136"
      className="pointer-events-none absolute -inset-[18%] h-[136%] w-[136%] overflow-visible"
    >
      <DecorationArt id={id} />
    </svg>
  );
}

/** A flame tongue standing on (x, y), curling sideways at the tip. */
const flame = (x: number, y: number, w: number, h: number, curl: number) =>
  `M${x - w} ${y} C${x - w} ${y - h * 0.45} ${x - w * 0.2 + curl} ${y - h * 0.55} ${x + curl} ${y - h}` +
  ` C${x + w * 0.35} ${y - h * 0.6} ${x + w} ${y - h * 0.4} ${x + w} ${y} Z`;

const around = (n: number, offset = 0) =>
  Array.from({ length: n }, (_, i) => offset + (360 / n) * i);

function Flower({
  x,
  y,
  r,
  fill,
  center,
  rot = 0,
}: {
  x: number;
  y: number;
  r: number;
  fill: string;
  center: string;
  rot?: number;
}) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot})`}>
      {around(5).map((a) => (
        <ellipse
          key={a}
          cx={0}
          cy={-r * 0.55}
          rx={r * 0.42}
          ry={r * 0.6}
          fill={fill}
          transform={`rotate(${a})`}
        />
      ))}
      <circle r={r * 0.28} fill={center} />
    </g>
  );
}

function Rose({ x, y, r, rot = 0 }: { x: number; y: number; r: number; rot?: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot})`}>
      <circle r={r} fill="#5b1a6e" />
      <path
        d={`M${-r * 0.7} 0 A${r * 0.7} ${r * 0.7} 0 1 1 ${r * 0.5} ${r * 0.5}`}
        fill="none"
        stroke="#b24ad1"
        strokeWidth={r * 0.18}
      />
      <path
        d={`M${-r * 0.35} 0 A${r * 0.35} ${r * 0.35} 0 1 1 ${r * 0.25} ${r * 0.25}`}
        fill="none"
        stroke="#d98cf0"
        strokeWidth={r * 0.14}
      />
      <ellipse
        cx={-r * 1.1}
        cy={r * 0.5}
        rx={r * 0.6}
        ry={r * 0.28}
        fill="#2f5d3a"
        transform="rotate(-25)"
      />
    </g>
  );
}

function PaleRose({ x, y, r, rot = 0 }: { x: number; y: number; r: number; rot?: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot})`}>
      <ellipse
        cx={-r * 1.1}
        cy={r * 0.5}
        rx={r * 0.6}
        ry={r * 0.26}
        fill="#b8b0d8"
        transform="rotate(-25)"
      />
      <ellipse
        cx={r * 1.1}
        cy={r * 0.5}
        rx={r * 0.6}
        ry={r * 0.26}
        fill="#b8b0d8"
        transform="rotate(25)"
      />
      <circle r={r} fill="#f4f0ff" />
      <path
        d={`M${-r * 0.7} 0 A${r * 0.7} ${r * 0.7} 0 1 1 ${r * 0.5} ${r * 0.5}`}
        fill="none"
        stroke="#c9bff0"
        strokeWidth={r * 0.16}
      />
      <path
        d={`M${-r * 0.35} 0 A${r * 0.35} ${r * 0.35} 0 1 1 ${r * 0.25} ${r * 0.25}`}
        fill="none"
        stroke="#a99ee0"
        strokeWidth={r * 0.13}
      />
    </g>
  );
}

function Star({
  x,
  y,
  r,
  delay,
  color = "#fff6c7",
}: {
  x: number;
  y: number;
  r: number;
  delay: number;
  color?: string;
}) {
  return (
    <path
      className="deco-anim deco-twinkle"
      style={{ animationDelay: `${delay}s`, transformOrigin: `${x}px ${y}px` }}
      d={`M${x} ${y - r} Q${x} ${y} ${x + r} ${y} Q${x} ${y} ${x} ${y + r} Q${x} ${y} ${x - r} ${y} Q${x} ${y} ${x} ${y - r}Z`}
      fill={color}
    />
  );
}

function Paw({ x, y, s, rot }: { x: number; y: number; s: number; rot: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot}) scale(${s})`} fill="#f4c7d9">
      <ellipse cx={0} cy={2} rx={4} ry={3.4} />
      <ellipse cx={-4.2} cy={-2.6} rx={1.6} ry={2} />
      <ellipse cx={-1.4} cy={-4.6} rx={1.6} ry={2} />
      <ellipse cx={1.6} cy={-4.6} rx={1.6} ry={2} />
      <ellipse cx={4.3} cy={-2.6} rx={1.6} ry={2} />
    </g>
  );
}

function Glow({ id, children, std = 2.2 }: { id: string; children: ReactNode; std?: number }) {
  return (
    <>
      <defs>
        <filter id={id} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation={std} result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <g filter={`url(#${id})`}>{children}</g>
    </>
  );
}

function DecorationArt({ id }: { id: AvatarDecoration }) {
  const uid = useId().replace(/:/g, "");
  switch (id) {
    case "flammen":
      return (
        <>
          <defs>
            <linearGradient id={`${uid}f`} x1="0" y1="1" x2="0" y2="0">
              <stop offset="0" stopColor="#ff3d00" />
              <stop offset="0.55" stopColor="#ff9800" />
              <stop offset="1" stopColor="#ffe082" />
            </linearGradient>
          </defs>
          <Glow id={`${uid}g`} std={1.6}>
            <circle cx={50} cy={50} r={52} fill="none" stroke="#ff6d00" strokeWidth={3} />
            {around(14).map((a, i) => (
              <g key={a} transform={`rotate(${a} 50 50)`}>
                <g
                  className="deco-anim deco-flicker"
                  style={{ animationDelay: `${(i % 5) * 0.17}s`, transformOrigin: "50px 2px" }}
                >
                  <path
                    d={flame(50, 2, 6 + (i % 2), 13 + (i % 4) * 2.5, i % 2 ? 3 : -3)}
                    fill={`url(#${uid}f)`}
                  />
                  <path
                    d={flame(50, 2, 3, 6 + (i % 3) * 1.5, i % 2 ? 1.5 : -1.5)}
                    fill="#fff3b0"
                    opacity={0.9}
                  />
                </g>
              </g>
            ))}
          </Glow>
        </>
      );
    case "sakura":
      return (
        <>
          <path
            d="M8 88 Q-8 50 12 14"
            fill="none"
            stroke="#6b3b2a"
            strokeWidth={2.2}
            strokeLinecap="round"
          />
          <path
            d="M92 12 Q108 40 96 70"
            fill="none"
            stroke="#6b3b2a"
            strokeWidth={2}
            strokeLinecap="round"
          />
          {[
            [4, 82, 7, 0],
            [-3, 60, 8, 20],
            [0, 36, 6.5, 40],
            [10, 16, 7.5, 10],
            [96, 16, 7, 30],
            [104, 38, 8, 5],
            [100, 62, 6.5, 50],
          ].map(([x, y, r, rot], i) => (
            <Flower key={i} x={x!} y={y!} r={r!} rot={rot} fill="#ffc1d9" center="#e25586" />
          ))}
          {[20, 60, 85].map((x, i) => (
            <ellipse
              key={x}
              className="deco-anim deco-petal"
              style={{ animationDelay: `${i * 1.3}s` }}
              cx={x}
              cy={-6}
              rx={2.4}
              ry={1.5}
              fill="#ffb0cf"
            />
          ))}
        </>
      );
    case "rosen":
      return (
        <>
          <path
            d="M-2 70 Q-10 40 10 12 Q30 -8 52 -6"
            fill="none"
            stroke="#3f2350"
            strokeWidth={2}
            strokeDasharray="1 4"
            strokeLinecap="round"
          />
          <path
            d="M60 106 Q90 104 104 80"
            fill="none"
            stroke="#3f2350"
            strokeWidth={2}
            strokeLinecap="round"
          />
          <Rose x={2} y={84} r={9} rot={-20} />
          <Rose x={-4} y={62} r={6} rot={30} />
          <Rose x={18} y={100} r={6.5} rot={60} />
          <Rose x={96} y={10} r={8} rot={140} />
          <Rose x={78} y={-4} r={5.5} rot={200} />
          <Glow id={`${uid}g`} std={1.5}>
            {[
              [30, -8],
              [106, 30],
              [-10, 40],
            ].map(([x, y], i) => (
              <circle
                key={i}
                className="deco-anim deco-twinkle"
                style={{ animationDelay: `${i * 0.8}s`, transformOrigin: `${x}px ${y}px` }}
                cx={x}
                cy={y}
                r={1.4}
                fill="#e7a6ff"
              />
            ))}
          </Glow>
        </>
      );
    case "sterne":
      return (
        <Glow id={`${uid}g`} std={1.2}>
          <circle
            cx={50}
            cy={50}
            r={53}
            fill="none"
            stroke="#fff3b0"
            strokeOpacity={0.35}
            strokeWidth={0.8}
          />
          <g className="deco-anim deco-spin-slow" style={{ transformOrigin: "50px 50px" }}>
            {around(9, 12).map((a, i) => {
              const rr = 56 + (i % 3) * 4;
              const x = 50 + rr * Math.cos((a * Math.PI) / 180);
              const y = 50 + rr * Math.sin((a * Math.PI) / 180);
              return <Star key={a} x={x} y={y} r={3 + (i % 3)} delay={i * 0.35} />;
            })}
          </g>
        </Glow>
      );
    case "pfoten":
      return (
        <g className="deco-anim deco-spin-slow" style={{ transformOrigin: "50px 50px" }}>
          <circle
            cx={50}
            cy={50}
            r={52.5}
            fill="none"
            stroke="#f4c7d9"
            strokeOpacity={0.6}
            strokeWidth={1.5}
            strokeDasharray="2 5"
          />
          {around(7).map((a) => {
            const x = 50 + 60 * Math.cos((a * Math.PI) / 180);
            const y = 50 + 60 * Math.sin((a * Math.PI) / 180);
            return <Paw key={a} x={x} y={y} s={1.15} rot={a + 90} />;
          })}
        </g>
      );
    case "katze":
      return (
        <>
          <g className="deco-anim deco-ear" style={{ transformOrigin: "22px 14px" }}>
            <path
              d="M8 22 L14 -12 L38 6 Z"
              fill="#fde7ee"
              stroke="#f3b6c9"
              strokeWidth={1.5}
              strokeLinejoin="round"
            />
            <path d="M15 14 L18 -3 L30 7 Z" fill="#f6a8c1" />
          </g>
          <g
            className="deco-anim deco-ear"
            style={{ transformOrigin: "78px 14px", animationDelay: "1.1s" }}
          >
            <path
              d="M92 22 L86 -12 L62 6 Z"
              fill="#fde7ee"
              stroke="#f3b6c9"
              strokeWidth={1.5}
              strokeLinejoin="round"
            />
            <path d="M85 14 L82 -3 L70 7 Z" fill="#f6a8c1" />
          </g>
          <path
            d="M20 4 Q50 -10 80 4"
            fill="none"
            stroke="#fde7ee"
            strokeWidth={6}
            strokeLinecap="round"
          />
          {["M-12 60 L10 64", "M-12 70 L10 68", "M112 60 L90 64", "M112 70 L90 68"].map((d) => (
            <path key={d} d={d} stroke="#fde7ee" strokeWidth={1.4} strokeLinecap="round" />
          ))}
          <Star x={96} y={-6} r={3.5} delay={0.4} color="#fff" />
        </>
      );
    case "blasen":
      return (
        <>
          <defs>
            <radialGradient id={`${uid}p`} cx="0.35" cy="0.3" r="0.8">
              <stop offset="0" stopColor="#ffffff" />
              <stop offset="0.5" stopColor="#d7ecff" />
              <stop offset="1" stopColor="#b58cff" />
            </radialGradient>
          </defs>
          {around(22).map((a, i) => {
            const x = 50 + 53 * Math.cos((a * Math.PI) / 180);
            const y = 50 + 53 * Math.sin((a * Math.PI) / 180);
            return (
              <circle key={a} cx={x} cy={y} r={i % 3 === 0 ? 4.2 : 3} fill={`url(#${uid}p)`} />
            );
          })}
          {[15, 80, 95].map((x, i) => (
            <circle
              key={x}
              className="deco-anim deco-rise"
              style={{ animationDelay: `${i * 1.1}s` }}
              cx={x}
              cy={104}
              r={3 + i}
              fill="none"
              stroke="#cfe6ff"
              strokeWidth={0.8}
            />
          ))}
        </>
      );
    case "finsternis":
      return (
        <>
          <defs>
            <radialGradient id={`${uid}c`} cx="0.5" cy="0.5" r="0.5">
              <stop offset="0.72" stopColor="#ffb300" stopOpacity="0" />
              <stop offset="0.8" stopColor="#ffca28" stopOpacity="0.95" />
              <stop offset="0.9" stopColor="#ff6f00" stopOpacity="0.5" />
              <stop offset="1" stopColor="#ff6f00" stopOpacity="0" />
            </radialGradient>
          </defs>
          <circle
            className="deco-anim deco-pulse"
            style={{ transformOrigin: "50px 50px" }}
            cx={50}
            cy={50}
            r={68}
            fill={`url(#${uid}c)`}
          />
          <circle cx={50} cy={50} r={52} fill="none" stroke="#1a1208" strokeWidth={3} />
          <circle
            cx={50}
            cy={50}
            r={54.5}
            fill="none"
            stroke="#ffd54f"
            strokeWidth={1}
            strokeDasharray="30 8 4 8"
            className="deco-anim deco-spin-slow"
            style={{ transformOrigin: "50px 50px" }}
          />
        </>
      );
    case "frost":
      return (
        <Glow id={`${uid}g`} std={1}>
          <circle
            cx={50}
            cy={50}
            r={52.5}
            fill="none"
            stroke="#bfe8ff"
            strokeWidth={2}
            strokeOpacity={0.8}
          />
          {around(6, -90).map((a, i) => {
            const x = 50 + 55 * Math.cos((a * Math.PI) / 180);
            const y = 50 + 55 * Math.sin((a * Math.PI) / 180);
            const s = i % 2 === 0 ? 8 : 5.5;
            return (
              <g
                key={a}
                className="deco-anim deco-twinkle"
                style={{ animationDelay: `${i * 0.5}s`, transformOrigin: `${x}px ${y}px` }}
                stroke="#e3f6ff"
                strokeWidth={1.3}
                strokeLinecap="round"
              >
                {around(3).map((b) => (
                  <path
                    key={b}
                    d={`M${x - s} ${y} L${x + s} ${y} M${x - s * 0.6} ${y - s * 0.3} L${x - s * 0.8} ${y} L${x - s * 0.6} ${y + s * 0.3} M${x + s * 0.6} ${y - s * 0.3} L${x + s * 0.8} ${y} L${x + s * 0.6} ${y + s * 0.3}`}
                    transform={`rotate(${b} ${x} ${y})`}
                    fill="none"
                  />
                ))}
              </g>
            );
          })}
        </Glow>
      );
    case "schmetterling":
      return (
        <>
          <Glow id={`${uid}g`} std={2.5}>
            <circle
              className="deco-anim deco-pulse"
              style={{ transformOrigin: "50px 50px" }}
              cx={50}
              cy={50}
              r={53}
              fill="none"
              stroke="#ff1744"
              strokeWidth={2.4}
            />
          </Glow>
          <g transform="translate(90 4) rotate(20)">
            <g className="deco-anim deco-flap" style={{ transformOrigin: "0px 0px" }}>
              <path d="M0 0 C-10 -14 -20 -6 -12 2 C-18 8 -8 14 0 4 Z" fill="#ff1744" />
              <path d="M0 0 C10 -14 20 -6 12 2 C18 8 8 14 0 4 Z" fill="#ff5c7c" />
            </g>
            <path d="M0 -3 L0 7" stroke="#2b0b12" strokeWidth={1.4} strokeLinecap="round" />
          </g>
        </>
      );
    case "mondsichel":
      return (
        <>
          <defs>
            <linearGradient id={`${uid}m`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#ffffff" />
              <stop offset="0.6" stopColor="#e6e0ff" />
              <stop offset="1" stopColor="#b9aef0" />
            </linearGradient>
          </defs>
          <Glow id={`${uid}g`} std={2.6}>
            <path
              className="deco-anim deco-pulse"
              style={{ transformOrigin: "50px 50px" }}
              d="M50 -6 A56 56 0 1 0 50 106 A60 60 0 1 1 50 -6 Z"
              fill={`url(#${uid}m)`}
            />
          </Glow>
          {[
            [8, 104, 11],
            [24, 110, 13],
            [44, 113, 12],
            [64, 111, 13],
            [84, 105, 11],
            [98, 96, 9],
            [-2, 94, 9],
          ].map(([x, y, r], i) => (
            <circle key={i} cx={x} cy={y} r={r} fill="#e9e4ff" opacity={0.85 - (i % 3) * 0.12} />
          ))}
          {[
            [34, 112, 9],
            [56, 116, 8],
            [76, 114, 9],
          ].map(([x, y, r], i) => (
            <circle key={i} cx={x} cy={y} r={r} fill="#ffffff" opacity={0.9} />
          ))}
          <Star x={104} y={8} r={4} delay={0} color="#ffffff" />
          <Star x={92} y={-8} r={2.6} delay={0.8} color="#e6e0ff" />
          <Star x={112} y={30} r={2.2} delay={1.5} color="#ffffff" />
        </>
      );
    case "silberrosen":
      return (
        <>
          <Glow id={`${uid}g`} std={1.4}>
            <circle cx={50} cy={50} r={54} fill="none" stroke="#efeaff" strokeWidth={1.6} />
            <circle
              cx={50}
              cy={50}
              r={58}
              fill="none"
              stroke="#cfc6f2"
              strokeWidth={1}
              strokeDasharray="1.5 4"
            />
            {[
              "M14 8 C4 -4 -8 6 2 14 C8 18 12 12 8 9",
              "M86 8 C96 -4 108 6 98 14 C92 18 88 12 92 9",
              "M50 -8 C44 -16 36 -12 40 -6 M50 -8 C56 -16 64 -12 60 -6",
              "M-6 50 C-14 42 -12 32 -4 36",
              "M106 50 C114 42 112 32 104 36",
            ].map((d) => (
              <path
                key={d}
                d={d}
                fill="none"
                stroke="#e8e2ff"
                strokeWidth={1.5}
                strokeLinecap="round"
              />
            ))}
          </Glow>
          {[
            [18, 100, 9, -20],
            [50, 110, 11, 0],
            [82, 100, 9, 20],
            [-4, 76, 6.5, -40],
            [104, 76, 6.5, 40],
          ].map(([x, y, r, rot], i) => (
            <PaleRose key={i} x={x!} y={y!} r={r!} rot={rot} />
          ))}
          <Star x={96} y={-6} r={3} delay={0.4} color="#ffffff" />
          <Star x={2} y={-4} r={2.4} delay={1.2} color="#ffffff" />
        </>
      );
    case "lichtfalter":
      return (
        <>
          <circle
            cx={50}
            cy={50}
            r={55}
            fill="none"
            stroke="#e9e4ff"
            strokeWidth={0.8}
            opacity={0.5}
          />
          <Glow id={`${uid}g`} std={2}>
            {[
              [104, 22, 1.2, 25],
              [110, 58, 0.8, 60],
              [96, 92, 1, 110],
              [66, 112, 0.7, 150],
              [-6, 30, 0.9, -30],
              [2, 90, 0.7, -120],
              [30, -10, 0.8, -10],
            ].map(([x, y, s, rot], i) => (
              <g key={i} transform={`translate(${x} ${y}) rotate(${rot}) scale(${s})`}>
                <g
                  className="deco-anim deco-flap"
                  style={{ transformOrigin: "0px 0px", animationDelay: `${i * 0.13}s` }}
                >
                  <path d="M0 0 C-8 -12 -18 -6 -11 2 C-16 7 -7 12 0 4 Z" fill="#ffffff" />
                  <path d="M0 0 C8 -12 18 -6 11 2 C16 7 7 12 0 4 Z" fill="#e4dcff" />
                </g>
              </g>
            ))}
          </Glow>
        </>
      );
    case "perlen": {
      const colors = ["#ffc4e1", "#d8c8ff", "#bfe3ff", "#c8f5e4", "#fff0b8"];
      return (
        <>
          <defs>
            {colors.map((c, i) => (
              <radialGradient key={c} id={`${uid}p${i}`} cx="0.35" cy="0.35" r="0.7">
                <stop offset="0" stopColor="#ffffff" />
                <stop offset="0.45" stopColor={c} />
                <stop offset="1" stopColor={c} stopOpacity={0.75} />
              </radialGradient>
            ))}
          </defs>
          {around(26).map((a, i) => {
            const rad = (a * Math.PI) / 180;
            return (
              <circle
                key={a}
                cx={50 + Math.cos(rad) * 56}
                cy={50 + Math.sin(rad) * 56}
                r={i % 2 ? 5.2 : 6.2}
                fill={`url(#${uid}p${i % colors.length})`}
              />
            );
          })}
          <Star x={104} y={0} r={4} delay={0} color="#ffffff" />
          <Star x={-6} y={100} r={3.2} delay={1} color="#ffffff" />
        </>
      );
    }
    case "schleier": {
      const colors = ["#ff9ecf", "#ffd59e", "#fff59e", "#a8f0c8", "#9ed8ff", "#c9a8ff"];
      return (
        <g className="deco-anim deco-spin-slow" style={{ transformOrigin: "50px 50px" }}>
          <Glow id={`${uid}g`} std={2.2}>
            {around(48).map((a, i) => (
              <line
                key={a}
                x1={50}
                y1={-2 - (i % 3) * 3}
                x2={50}
                y2={6}
                stroke={colors[i % colors.length]}
                strokeWidth={i % 2 ? 1.6 : 2.6}
                strokeLinecap="round"
                opacity={0.75}
                transform={`rotate(${a} 50 50)`}
              />
            ))}
          </Glow>
        </g>
      );
    }
    case "delfine":
      return (
        <>
          <defs>
            <linearGradient id={`${uid}d`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#ffc8ec" />
              <stop offset="0.5" stopColor="#c9b8ff" />
              <stop offset="1" stopColor="#9ee6ff" />
            </linearGradient>
          </defs>
          <Glow id={`${uid}g`} std={2.4}>
            <circle cx={50} cy={50} r={53} fill="none" stroke="#d9ccff" strokeWidth={2} />
          </Glow>
          <g className="deco-anim deco-spin-slow" style={{ transformOrigin: "50px 50px" }}>
            {[0, 180].map((rot) => (
              <g key={rot} transform={`rotate(${rot} 50 50) translate(50 -4) rotate(-8)`}>
                <path
                  d="M-16 2 C-10 -9 8 -10 15 -3 C17 -1 20 -1 22 -2 C20 2 17 3 15 3 C8 9 -8 9 -16 2 Z"
                  fill={`url(#${uid}d)`}
                />
                <path d="M-2 -7 L2 -14 L5 -6 Z" fill="#c9b8ff" />
                <path d="M-16 2 L-23 -5 L-21 3 L-25 9 Z" fill="#ffc8ec" />
                <circle cx={11} cy={-2} r={0.9} fill="#3b2a5c" />
              </g>
            ))}
          </g>
          <Star x={100} y={6} r={3} delay={0.3} color="#ffffff" />
          <Star x={0} y={96} r={2.6} delay={1.1} color="#ffffff" />
        </>
      );
    case "blutmond":
      return (
        <>
          <defs>
            <radialGradient id={`${uid}r`} cx="0.3" cy="0.35" r="0.8">
              <stop offset="0" stopColor="#ff9a7a" />
              <stop offset="0.5" stopColor="#d4432b" />
              <stop offset="1" stopColor="#6e1410" />
            </radialGradient>
            <mask id={`${uid}k`}>
              <rect x={-20} y={-20} width={140} height={140} fill="#fff" />
              <circle cx={62} cy={46} r={50} fill="#000" />
            </mask>
          </defs>
          <Glow id={`${uid}g`} std={3}>
            <circle cx={50} cy={50} r={58} fill={`url(#${uid}r)`} mask={`url(#${uid}k)`} />
          </Glow>
          {[
            [8, 40, 3],
            [14, 70, 4],
            [0, 56, 2.2],
            [22, 94, 2.6],
          ].map(([x, y, r], i) => (
            <circle key={i} cx={x} cy={y} r={r} fill="#8a1c14" opacity={0.7} />
          ))}
        </>
      );
    case "planet":
      return (
        <>
          <Glow id={`${uid}g`} std={2.4}>
            <ellipse
              cx={50}
              cy={50}
              rx={66}
              ry={22}
              fill="none"
              stroke="#c77dff"
              strokeWidth={2.4}
              transform="rotate(-24 50 50)"
              opacity={0.9}
            />
            <ellipse
              cx={50}
              cy={50}
              rx={60}
              ry={18}
              fill="none"
              stroke="#ffb3f0"
              strokeWidth={1}
              transform="rotate(-24 50 50)"
              opacity={0.7}
            />
          </Glow>
          <g className="deco-anim deco-spin-slow" style={{ transformOrigin: "50px 50px" }}>
            <circle cx={50} cy={-8} r={6} fill="#9d8cff" />
            <circle cx={48} cy={-10} r={2.2} fill="#e4ddff" />
          </g>
          <Star x={106} y={20} r={3} delay={0.2} color="#ffd6ff" />
          <Star x={-6} y={84} r={2.6} delay={1} color="#ffd6ff" />
        </>
      );
    case "kometen":
      return (
        <>
          <Glow id={`${uid}g`} std={1.6}>
            <circle
              cx={50}
              cy={50}
              r={55}
              fill="none"
              stroke="#8fd3ff"
              strokeWidth={1.2}
              opacity={0.6}
            />
            {around(40).map((a, i) => {
              const rad = (a * Math.PI) / 180;
              return (
                <circle
                  key={a}
                  cx={50 + Math.cos(rad) * (55 + (i % 3) * 2)}
                  cy={50 + Math.sin(rad) * (55 + (i % 3) * 2)}
                  r={i % 4 === 0 ? 1.4 : 0.8}
                  fill="#dff4ff"
                />
              );
            })}
          </Glow>
          <g
            className="deco-anim deco-spin-slow"
            style={{ transformOrigin: "50px 50px", animationDuration: "12s" }}
          >
            {[0, 140, 250].map((a) => (
              <g key={a} transform={`rotate(${a} 50 50)`}>
                <path d="M50 -6 L30 -3 L50 -4 Z" fill="#bfe8ff" opacity={0.7} />
                <circle cx={51} cy={-5} r={2.4} fill="#ffffff" />
              </g>
            ))}
          </g>
        </>
      );
    case "sonneneruption":
      return (
        <>
          <defs>
            <linearGradient id={`${uid}s`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#fff3b0" />
              <stop offset="0.5" stopColor="#ffb300" />
              <stop offset="1" stopColor="#ff6d00" />
            </linearGradient>
          </defs>
          <Glow id={`${uid}g`} std={3.2}>
            <circle
              className="deco-anim deco-pulse"
              style={{ transformOrigin: "50px 50px" }}
              cx={50}
              cy={50}
              r={54}
              fill="none"
              stroke={`url(#${uid}s)`}
              strokeWidth={5}
            />
          </Glow>
          {around(10, 12).map((a, i) => (
            <path
              key={a}
              className="deco-anim deco-flicker"
              style={{ transformOrigin: "50px -2px", animationDelay: `${i * 0.15}s` }}
              d={flame(50, -2, 3, 7 + (i % 3) * 3, i % 2 ? 2 : -2)}
              fill="#ffb300"
              opacity={0.85}
              transform={`rotate(${a} 50 50)`}
            />
          ))}
        </>
      );
    case "sternbild": {
      const pts = [
        [4, 20],
        [18, 4],
        [40, -8],
        [62, -6],
        [86, 6],
        [104, 28],
        [110, 56],
        [100, 84],
        [80, 104],
        [52, 112],
        [24, 102],
        [2, 80],
        [-8, 50],
      ];
      return (
        <Glow id={`${uid}g`} std={1.5}>
          <polyline
            points={pts.map((p) => p.join(",")).join(" ") + ` ${pts[0]!.join(",")}`}
            fill="none"
            stroke="#b9a8ff"
            strokeWidth={0.8}
            opacity={0.6}
          />
          {pts.map(([x, y], i) => (
            <Star
              key={i}
              x={x!}
              y={y!}
              r={i % 3 === 0 ? 3.4 : 2.2}
              delay={i * 0.3}
              color="#e8e0ff"
            />
          ))}
        </Glow>
      );
    }
    case "nova":
      return (
        <>
          <defs>
            <radialGradient id={`${uid}n`} cx="0.5" cy="0.5" r="0.5">
              <stop offset="0.82" stopColor="#3d5cff" stopOpacity={0} />
              <stop offset="0.93" stopColor="#6f8bff" stopOpacity={0.55} />
              <stop offset="1" stopColor="#b3a4ff" stopOpacity={0.9} />
            </radialGradient>
          </defs>
          <Glow id={`${uid}g`} std={2.8}>
            <circle cx={50} cy={50} r={57} fill={`url(#${uid}n)`} />
            <circle
              className="deco-anim deco-pulse"
              style={{ transformOrigin: "50px 50px" }}
              cx={50}
              cy={50}
              r={56}
              fill="none"
              stroke="#8f7dff"
              strokeWidth={2}
            />
          </Glow>
          <g className="deco-anim deco-spin-slow" style={{ transformOrigin: "50px 50px" }}>
            {["M-4 40 C-10 20 6 0 24 -6", "M104 60 C110 80 94 100 76 106"].map((d) => (
              <path
                key={d}
                d={d}
                fill="none"
                stroke="#ff8ad8"
                strokeWidth={2}
                strokeLinecap="round"
                opacity={0.8}
              />
            ))}
          </g>
        </>
      );
    default:
      return null;
  }
}

/** Particles over the profile header. */
export function ProfileEffectLayer({
  effect,
  className,
}: {
  effect: ProfileEffect;
  className?: string;
}) {
  if (effect === "mondnacht") return <MoonNight className={className} />;
  if (effect === "polarlicht") return <AuroraSky className={className} />;
  if (effect === "sternwirbel" || effect === "planetenringe" || effect === "kosmossturm") {
    return <CosmosScene effect={effect} className={className} />;
  }
  const count = effect === "lichtfalter" ? 10 : 18;
  return (
    <div
      aria-hidden="true"
      className={cn("pointer-events-none absolute overflow-hidden", className)}
    >
      {Array.from({ length: count }, (_, i) => {
        const left = (i * 37 + 11) % 100;
        const delay = ((i * 7) % 12) * 0.6;
        const duration = 7 + ((i * 5) % 6);
        const size = 6 + ((i * 3) % 7);
        return (
          <span
            key={i}
            className={cn("fx-particle deco-anim absolute", `fx-${effect}`)}
            style={{
              left: `${left}%`,
              width: size,
              height: size,
              animationDelay: `${delay}s`,
              animationDuration: `${duration}s`,
            }}
          >
            {effect === "sterne" ? "✦" : effect === "herzen" ? "♥" : null}
            {effect === "lichtfalter" ? <MiniMoth /> : null}
          </span>
        );
      })}
    </div>
  );
}

function MiniMoth() {
  return (
    <svg viewBox="-12 -12 24 24" className="deco-anim fx-moth-flap h-full w-full overflow-visible">
      <path d="M0 0 C-7 -10 -14 -4 -9 2 C-12 6 -5 9 0 3 Z" fill="#ffffff" />
      <path d="M0 0 C7 -10 14 -4 9 2 C12 6 5 9 0 3 Z" fill="#e4dcff" />
    </svg>
  );
}

/** Full moon with a howling wolf on a rock, and twinkling stars. */
function MoonNight({ className }: { className?: string }) {
  const stars = [
    [8, 10, 3],
    [22, 26, 2],
    [36, 8, 2.5],
    [52, 20, 2],
    [64, 6, 3],
    [14, 42, 2],
    [46, 38, 1.8],
    [90, 44, 2.2],
  ];
  return (
    <div
      aria-hidden="true"
      className={cn("pointer-events-none absolute overflow-hidden", className)}
    >
      {stars.map(([x, y, r], i) => (
        <span
          key={i}
          className="deco-anim deco-twinkle absolute rounded-full bg-white"
          style={{
            left: `${x}%`,
            top: `${y}%`,
            width: r * 2,
            height: r * 2,
            boxShadow: "0 0 6px 1px #e6e0ff",
            animationDelay: `${i * 0.4}s`,
          }}
        />
      ))}
      <div className="fx-moon deco-anim absolute" />
      <svg
        viewBox="0 0 120 90"
        className="absolute right-[4%] top-[18%] w-[34%] max-w-44 drop-shadow-[0_0_10px_rgba(230,224,255,0.45)]"
      >
        <path
          d="M0 90 L0 74 C16 66 30 64 44 66 C60 58 78 60 96 70 L120 76 L120 90 Z"
          fill="#1a1630"
        />
        <path
          fill="#211c3a"
          d="M52 66 C50 56 52 48 58 42 C60 34 62 24 66 16 L68 6 L72 14 C74 12 77 12 80 14 L78 18 C82 22 80 28 76 30 C74 36 76 42 80 48 C84 52 86 58 84 66 Z M56 66 C54 70 50 72 46 70 C50 68 52 66 52 64 Z"
        />
        <path d="M66 16 L68 6 L70 12 Z" fill="#2b2548" />
      </svg>
    </div>
  );
}

/** Slowly waving aurora ribbons. */
function AuroraSky({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn("pointer-events-none absolute overflow-hidden", className)}
    >
      <div className="fx-aurora fx-aurora-a deco-anim absolute" />
      <div className="fx-aurora fx-aurora-b deco-anim absolute" />
      <div className="fx-aurora fx-aurora-c deco-anim absolute" />
    </div>
  );
}

/** Kosmos effects: turning starfield, ringed planet, drifting nebulae. */
function CosmosScene({
  effect,
  className,
}: {
  effect: "sternwirbel" | "planetenringe" | "kosmossturm";
  className?: string;
}) {
  return (
    <div
      aria-hidden="true"
      className={cn("pointer-events-none absolute overflow-hidden", className)}
    >
      {effect === "sternwirbel" ? (
        <>
          <div className="fx-galaxy-core deco-anim absolute" />
          <div className="fx-starfield deco-anim absolute" />
        </>
      ) : effect === "planetenringe" ? (
        <>
          <div className="fx-starfield absolute opacity-50" style={{ animation: "none" }} />
          <div className="fx-planet absolute" />
          <div className="fx-planet-ring absolute" />
          <div className="fx-moonlet deco-anim absolute" />
        </>
      ) : (
        <>
          <div className="fx-nebula fx-nebula-a deco-anim absolute" />
          <div className="fx-nebula fx-nebula-b deco-anim absolute" />
          <div className="fx-nebula fx-nebula-c deco-anim absolute" />
          <div className="fx-starfield deco-anim absolute" />
        </>
      )}
    </div>
  );
}
