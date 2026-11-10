import { useState } from "react";
import { Sheet } from "@/components/ui/Sheet";
import type { DayModel } from "@/lib/week-model";

type Props = { day: DayModel | null; onSave: (note: string) => void; onClose: () => void };

function NoteForm({ day, onSave }: { day: DayModel; onSave: (note: string) => void }) {
  const [note, setNote] = useState(day.meal?.note ?? "");
  return (
    <form
      className="flex flex-col gap-3 px-3"
      onSubmit={(event) => {
        event.preventDefault();
        onSave(note.trim());
      }}
    >
      <label className="flex flex-col gap-2 text-sm text-muted">
        Note til dagen
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={4}
          maxLength={280}
          autoFocus
          className="w-full resize-none rounded-2xl bg-raised p-4 text-base text-ink"
        />
      </label>
      <button
        type="submit"
        className="h-12 rounded-full bg-accent text-[15px] font-semibold text-on-accent"
      >
        Gem note
      </button>
    </form>
  );
}

export function NoteSheet({ day, onSave, onClose }: Props) {
  return (
    <Sheet open={day !== null} onClose={onClose} title="Note" subtitle={day?.dish?.name}>
      {day ? <NoteForm day={day} onSave={onSave} /> : null}
    </Sheet>
  );
}
