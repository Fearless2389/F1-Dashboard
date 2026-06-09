import { useQuery } from "@tanstack/react-query";

import { Skeleton } from "@/components/ui/Skeleton";
import { ApexHeader } from "@/components/panels/ApexHeader";
import { TopPredictionCard } from "@/components/panels/TopPredictionCard";
import { PredictedPodiumCard } from "@/components/panels/PredictedPodiumCard";
import { ModelReasoning } from "@/components/panels/ModelReasoning";
import { PredictedFinishTable } from "@/components/panels/PredictedFinishTable";
import { api } from "@/lib/api";
import type { ApexResponse } from "@/lib/types";

export default function ApexRoute() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["apex", "next"],
    queryFn: () => api.get<ApexResponse>("/api/apex/next"),
    refetchInterval: 5 * 60_000,   // refresh every 5 min while open
    staleTime: 60_000,
  });

  return (
    <div className="space-y-4">
      <ApexHeader
        modelVersion={data?.reliability.model_version ?? "v1.0"}
        nextEvent={data?.race_meta.race_name?.toUpperCase() ?? "—"}
        trainDate={data?.reliability.train_date}
      />

      {isLoading && (
        <div className="grid gap-4 grid-cols-1 lg:grid-cols-[3fr_2fr]">
          <Skeleton className="h-72 w-full" />
          <Skeleton className="h-72 w-full" />
        </div>
      )}

      {!isLoading && error && (
        <div className="rounded-md border border-dashed border-f1-edge p-6 text-center text-sm text-f1-muted">
          Apex prediction unavailable. Train the models and refresh the upcoming-race schedule.
        </div>
      )}

      {data && (
        <>
          {/* Hero row: top prediction + podium */}
          <div className="grid gap-4 grid-cols-1 lg:grid-cols-[3fr_2fr]">
            <TopPredictionCard
              top={data.top_prediction}
              stochasticMean={data.top_prediction.stochastic_mean}
              qualiSource={data.quali_source}
            />
            <PredictedPodiumCard
              podium={data.podium}
              reliability={data.reliability}
            />
          </div>

          {/* Reasoning + Finish table */}
          <div className="grid gap-4 grid-cols-1 lg:grid-cols-[2fr_3fr]">
            <ModelReasoning blocks={data.reasoning} />
            <PredictedFinishTable rows={data.finish_p4_p10} />
          </div>
        </>
      )}
    </div>
  );
}
