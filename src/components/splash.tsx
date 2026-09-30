import { LogoEmblem } from "@/components/logo";

export function Splash() {
  return (
    <div className="splash-stage text-fg">
      <div className="splash-glow" aria-hidden="true" />
      <LogoEmblem className="splash-emblem size-40" />
    </div>
  );
}
