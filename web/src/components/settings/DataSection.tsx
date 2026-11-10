import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { useApi } from "@/api/provider";
import { errorMessage } from "@/api/library-mutations";
import { SectionCard } from "@/components/ui/Controls";
import { notify } from "@/lib/notify";
import { ImportV1Panel } from "./ImportV1Panel";

export function DataSection({ isEmpty }: { isEmpty: boolean }) {
  const api = useApi();
  const [busy, setBusy] = useState(false);

  const download = async (): Promise<void> => {
    setBusy(true);
    try {
      const file = await api.exportData();
      const url = URL.createObjectURL(new Blob([JSON.stringify(file, null, 2)], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `madplan-eksport-${file.exportedAt.slice(0, 10)}.json`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      notify(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SectionCard title="Data" description="Tag en kopi af alt i appen, eller flyt data over fra den gamle Meal Planner.">
      <button type="button" disabled={busy} onClick={() => void download()} className="flex h-12 w-fit items-center gap-2 rounded-full border border-line px-5 text-[15px] font-semibold text-ink hover:bg-raised disabled:opacity-60">
        <Download size={18} aria-hidden="true" />
        {busy ? "Forbereder…" : "Eksportér alt"}
      </button>
      <ImportV1Panel canImport={isEmpty} />
    </SectionCard>
  );
}

export function AppInfoSection() {
  const api = useApi();
  const health = useQuery({ queryKey: ["health"], queryFn: () => api.health(), staleTime: 300_000 });
  return (
    <SectionCard title="Om appen">
      <p className="m-0 text-[15px] text-ink-2">
        Madplan · version {health.data ? health.data.version : health.isError ? "ukendt" : "…"}
      </p>
    </SectionCard>
  );
}
