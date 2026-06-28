import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Camera } from "lucide-react";

export interface SuggestedAction {
  action: string;
  reason: string;
}

/**
 * Surfaces concrete, physical next-steps the grader inferred from the
 * seller's clarifying answers (e.g. "use your loupe to macro the hallmark").
 * These complement the textual improvement_guidance with do-this-now nudges.
 */
export function SuggestedActionsCard({ actions }: { actions: SuggestedAction[] }) {
  if (!actions || actions.length === 0) return null;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Camera className="h-4 w-4 text-primary" />
          Suggested next actions
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        <p className="text-xs text-muted-foreground">
          Based on what you already told us, here's what would lift this listing the most.
        </p>
        <ul className="space-y-2">
          {actions.map((a, i) => (
            <li key={i} className="rounded-md border bg-muted/30 p-2.5">
              <p className="text-sm font-medium leading-snug">{a.action}</p>
              {a.reason && (
                <p className="mt-1 text-xs text-muted-foreground leading-snug">{a.reason}</p>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
