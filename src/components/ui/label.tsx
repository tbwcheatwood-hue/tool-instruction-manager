import { cn } from "@/lib/utils";
import type { LabelHTMLAttributes } from "react";

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-400", className)} {...props} />;
}
