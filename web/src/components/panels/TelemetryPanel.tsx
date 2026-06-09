import { useQuery } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { api } from "@/lib/api";
import { teamColorFallback } from "@/lib/teams";
import type { LiveDriver } from "@/lib/types";

interface Props {
  driver: LiveDriver | null;
  sessionKey: number | null;
}

interface Frame {
  date: string;
  speed?: number | null;
  throttle?: number | null;
  brake?: number | null;
  n_gear?: number | null;
  rpm?: number | null;
}

export function TelemetryPanel({ driver, sessionKey }: Props) {
  const enabled = !!(driver?.driver_number && sessionKey);
  const { data, isLoading } = useQuery({
    queryKey: ["telemetry", sessionKey, driver?.driver_number],
    queryFn: () => api.get<{ frames: Frame[] }>(
      `/api/live/telemetry?session_key=${sessionKey}&driver_number=${driver!.driver_number}&limit=800`,
    ),
    enabled,
    refetchInterval: enabled ? 8_000 : false,
  });

  const color = teamColorFallback(driver?.team_colour, driver?.team_name);

  const frames = (data?.frames ?? []).map((f, i) => ({ ...f, _i: i }));

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-2">
        <CardTitle>Telemetry</CardTitle>
        {driver ? (
          <div className="text-xs text-f1-muted mt-1">
            {driver.driver_code} · {driver.team_name}
          </div>
        ) : (
          <div className="text-xs text-f1-muted mt-1">Pick a driver to view telemetry</div>
        )}
      </CardHeader>
      <CardContent className="flex-1 space-y-3">
        {!enabled && (
          <div className="rounded-md border border-dashed border-f1-edge p-6 text-center text-xs text-f1-muted">
            Select a driver from the timing tower or track map to load their telemetry trace.
          </div>
        )}
        {enabled && isLoading && <Skeleton className="h-32 w-full" />}
        {enabled && !isLoading && frames.length === 0 && (
          <div className="rounded-md border border-dashed border-f1-edge p-6 text-center text-xs text-f1-muted">
            No telemetry frames available for this driver yet.
          </div>
        )}
        {frames.length > 0 && (
          <>
            <MiniChart label="Speed (km/h)" data={frames} dataKey="speed" color={color} />
            <MiniChart label="Throttle (%)" data={frames} dataKey="throttle" color="#27f4d2" yMax={100} />
            <MiniChart label="Brake (%)"    data={frames} dataKey="brake"    color="#e10600" yMax={100} />
            <MiniChart label="Gear"         data={frames} dataKey="n_gear"   color="#ffd200" yMax={8} />
          </>
        )}
      </CardContent>
    </Card>
  );
}

function MiniChart({
  label, data, dataKey, color, yMax,
}: {
  label: string;
  data: any[];
  dataKey: string;
  color: string;
  yMax?: number;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-f1-muted mb-0.5">{label}</div>
      <div className="h-20 rounded-md border border-f1-edge bg-f1-panel/40">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
            <defs>
              <linearGradient id={`g-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.6} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#232342" strokeDasharray="2 4" vertical={false} />
            <XAxis dataKey="_i" hide />
            <YAxis hide domain={[0, yMax ?? "auto"]} />
            <Tooltip
              contentStyle={{ background: "#16162a", border: "1px solid #232342", borderRadius: 6, fontSize: 11 }}
              labelStyle={{ color: "#8a8aa3" }}
              cursor={{ stroke: color, strokeOpacity: 0.4 }}
            />
            <Area
              type="monotone"
              dataKey={dataKey}
              stroke={color}
              strokeWidth={1.5}
              fill={`url(#g-${dataKey})`}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
