import { cn } from "@/lib/utils";

export function ChipGroup({
  options,
  value,
  onChange,
  multi = false,
}: {
  options: readonly string[];
  value: string[] | string | null;
  onChange: (next: string[] | string) => void;
  multi?: boolean;
}) {
  const selected = Array.isArray(value) ? value : value ? [value] : [];

  function toggle(option: string) {
    if (!multi) {
      onChange(selected[0] === option ? "" : option);
      return;
    }
    onChange(
      selected.includes(option) ? selected.filter((v) => v !== option) : [...selected, option],
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => {
        const active = selected.includes(option);
        return (
          <button
            key={option}
            type="button"
            onClick={() => toggle(option)}
            aria-pressed={active}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-sm backdrop-blur-md transition-[background-color,border-color,color,box-shadow,transform] duration-200 ease-out active:scale-[0.97] motion-reduce:transform-none motion-reduce:transition-none",
              active
                ? "border-primary/70 bg-primary/90 text-primary-foreground shadow-sm ring-1 ring-inset ring-primary-foreground/15"
                : "border-border/70 bg-card/65 text-muted-foreground shadow-sm hover:-translate-y-0.5 hover:border-primary/35 hover:bg-background/80 hover:text-foreground hover:shadow-ridge",
            )}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}
