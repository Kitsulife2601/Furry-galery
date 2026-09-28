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
  const count = 18;
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
          </span>
        );
      })}
    </div>
  );
}
