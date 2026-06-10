import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import type { RaceControlMessage } from "@/lib/types";

interface Props { messages: RaceControlMessage[] }

function flagTone(flag?: string | null) {
  const f = (flag || "").toLowerCase();
  if (f.includes("red")) return "#e10600";
  if (f.includes("yellow")) return "#ffd200";
  if (f.includes("green")) return "#43b02a";
  if (f.includes("blue")) return "#0080ff";
  if (f.includes("chequered")) return "#f5f5f7";
  return "#8a8aa3";
}

export function RaceControlFeed({ messages }: Props) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle>Race Control</CardTitle>
      </CardHeader>
      <CardContent className="max-h-64 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="text-xs text-f1-muted">No messages yet.</div>
        ) : (
          <ul className="space-y-2">
            {messages.map((m) => (
              <li
                key={`${m.date ?? "no-ts"}-${m.lap_number ?? ""}-${m.message ?? ""}`}
                className="rounded-md border border-f1-edge bg-f1-panel/40 px-3 py-2 text-xs"
              >
                <div className="flex items-center justify-between mb-1">
                  <Badge color={flagTone(m.flag)}>
                    {m.flag || m.category || "INFO"}
                  </Badge>
                  <div className="text-[10px] text-f1-muted">
                    {m.lap_number ? `Lap ${m.lap_number}` : ""}
                  </div>
                </div>
                <div className="text-f1-white leading-snug">{m.message}</div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
