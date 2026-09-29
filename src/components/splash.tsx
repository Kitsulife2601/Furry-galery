import { LogoEmblem } from "@/components/logo";

export function Splash() {
  return (
    <div className="grid min-h-dvh place-items-center bg-bg text-fg">
      <LogoEmblem className="size-40 animate-pulse" />
    </div>
  );
}
