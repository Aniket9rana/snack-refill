import { cn } from "@/lib/utils";
import { initials } from "@/lib/format";
import type { OfficeId } from "@/domain";

const TONE: Record<OfficeId, string> = {
  OSL: "text-sky",
  BLR: "text-hot",
};

/** Machined initials tile. The ring colour tells you which office the person belongs to. */
export function Avatar({ name, office, size = 28, className }: { name: string; office: OfficeId; size?: number; className?: string }) {
  return (
    <span
      className={cn(
        "bevel-machined inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold tracking-tight",
        TONE[office],
        className,
      )}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}
