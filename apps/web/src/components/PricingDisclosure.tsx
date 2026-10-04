import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui";
import { cn } from "@/lib/utils";

export interface PricingDisclosureProps {
  className?: string;
}

/**
 * Required affordance anywhere a per-MTok *rate* is shown (CLAUDE.md:
 * never present invented/volatile numbers as authoritative -
 * `packages/shared`'s `MODEL_CATALOG` prices are explicitly illustrative
 * placeholders). A run's own *computed* cost (tokens x rate) is fine to show
 * plainly - only the underlying rate card needs this disclosure.
 */
export function PricingDisclosure({ className }: PricingDisclosureProps): JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            "inline-flex cursor-help items-center gap-1 text-xs text-muted-foreground underline decoration-dotted underline-offset-2",
            className,
          )}
        >
          <Info className="h-3 w-3" aria-hidden="true" />
          illustrative rates
        </span>
      </TooltipTrigger>
      <TooltipContent>
        Per-MTok prices shown here are illustrative placeholders, not live provider pricing -
        check each provider&apos;s official pricing page before using these for real budgeting.
        Computed costs below are calculated from these same placeholder rates, so treat them as
        directional, not exact.
      </TooltipContent>
    </Tooltip>
  );
}
