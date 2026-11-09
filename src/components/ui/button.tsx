import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes } from "react";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 border text-xs tracking-[0.14em] uppercase transition focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-lavender disabled:pointer-events-none disabled:opacity-40",
  {
    variants: {
      variant: {
        default: "border-lavender bg-lavender text-black hover:bg-lavender-bright",
        outline: "border-lavender/30 bg-transparent text-lavender hover:border-lavender",
        ghost: "border-transparent text-zinc-400 hover:text-lavender",
        olive: "border-olive bg-olive text-black hover:bg-olive-bright",
      },
      size: {
        default: "h-8 px-3",
        sm: "h-7 px-2",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export function Button({
  className,
  variant,
  size,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
