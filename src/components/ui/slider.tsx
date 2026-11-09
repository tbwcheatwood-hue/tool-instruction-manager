import { cn } from "@/lib/utils";

export function Slider({
  value,
  min,
  max,
  step,
  onValueChange,
  className,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  onValueChange: (value: number) => void;
  className?: string;
}) {
  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(event) => onValueChange(Number(event.target.value))}
      className={cn("tim-range w-full", className)}
    />
  );
}
