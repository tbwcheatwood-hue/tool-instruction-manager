import { cn } from "@/lib/utils";
import type { InputHTMLAttributes } from "react";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-8 w-full border border-lavender/30 bg-black px-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-lavender focus:ring-1 focus:ring-lavender disabled:cursor-not-allowed disabled:opacity-40",
        className,
      )}
      {...props}
    />
  );
}
