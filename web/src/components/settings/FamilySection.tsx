import { useState } from "react";
import { ChevronDown, Plus, Trash2 } from "lucide-react";
import type { Profile } from "@madplan/domain";
import { ChipInput } from "@/components/ui/ChipInput";
import { CommitInput, SectionCard, Toggle } from "@/components/ui/Controls";

type Props = { profiles: Profile[]; onChange: (profiles: Profile[]) => void };

/** "Spiser med · 2 portioner · Må ikke: peanuts" for a folded person card. */
export function profileSummary(profile: Profile): string {
  const parts = [profile.active ? "Spiser med" : "Spiser ikke med"];
  if (profile.portions && profile.portions !== 1) parts.push(`${String(profile.portions).replace(".", ",")} portioner`);
  if (profile.exclusions.length > 0) parts.push(`Må ikke: ${profile.exclusions.join(", ")}`);
  if (profile.dislikes.length > 0) parts.push(`Kan ikke lide: ${profile.dislikes.join(", ")}`);
  return parts.join(" · ");
}

export function FamilySection({ profiles, onChange }: Props) {
  // Everyone is folded; a person just added opens so the name can be typed.
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const toggle = (id: string): void =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const update = (id: string, patch: Partial<Profile>): void =>
    onChange(profiles.map((profile) => (profile.id === id ? { ...profile, ...patch } : profile)));

  const add = (): void => {
    const id = `profile-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    setExpanded((current) => new Set([...current, id]));
    onChange([
      ...profiles,
      {
        id,
        name: "Ny person",
        active: true,
        exclusions: [],
        preferences: [],
        dislikes: [],
        favoriteDishIds: [],
      },
    ]);
  };

  return (
    <SectionCard
      title="Familien"
      description="Aktive personer styrer antal portioner og hvilke retter der foreslås. Udeladte personer tæller ikke med."
    >
      <ul className="m-0 grid list-none items-start gap-3 p-0 lg:grid-cols-2">
        {profiles.map((profile) => {
          const open = expanded.has(profile.id);
          const panelId = `profile-panel-${profile.id}`;
          return (
            <li key={profile.id} className="flex flex-col rounded-3xl bg-raised">
              <button
                type="button"
                aria-expanded={open}
                aria-controls={panelId}
                onClick={() => toggle(profile.id)}
                className="flex min-h-[64px] w-full items-center gap-3 rounded-3xl bg-transparent px-4 py-3 text-left"
              >
                <span
                  aria-hidden="true"
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-display text-[17px] font-bold ${
                    profile.active ? "bg-accent-soft text-accent" : "bg-surface text-muted"
                  }`}
                >
                  {profile.name.trim().charAt(0).toLocaleUpperCase("da-DK") || "?"}
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className={`truncate text-[17px] font-semibold ${profile.active ? "text-ink" : "text-muted"}`}>{profile.name}</span>
                  <span className="truncate text-[13px] text-muted">{profileSummary(profile)}</span>
                </span>
                <ChevronDown size={20} aria-hidden="true" className={`shrink-0 text-ink-2 transition-transform ${open ? "rotate-180" : ""}`} />
              </button>
              {open ? (
                <div id={panelId} className="flex flex-col gap-3 px-4 pb-4">
                  <div className="flex items-end gap-3">
                    <div className="min-w-0 flex-1">
                      <CommitInput label="Navn" value={profile.name} onCommit={(name) => name && update(profile.id, { name })} />
                    </div>
                    <div className="w-24">
                      <CommitInput
                        label="Portioner"
                        inputMode="numeric"
                        value={profile.portions ? String(profile.portions) : ""}
                        placeholder="1"
                        onCommit={(text) => {
                          const portions = Number(text);
                          const { portions: _drop, ...rest } = profile;
                          onChange(
                            profiles.map((item) =>
                              item.id === profile.id
                                ? Number.isFinite(portions) && portions > 0
                                  ? { ...rest, portions: Math.min(10, portions) }
                                  : rest
                                : item,
                            ),
                          );
                        }}
                      />
                    </div>
                  </div>
                  <Toggle label="Spiser med" checked={profile.active} onChange={(active) => update(profile.id, { active })} />
                  <ChipInput
                    label={`Må ikke spise (${profile.name})`}
                    values={profile.exclusions}
                    onChange={(exclusions) => update(profile.id, { exclusions })}
                    placeholder="Fx peanuts"
                  />
                  <ChipInput
                    label={`Kan ikke lide (${profile.name})`}
                    values={profile.dislikes}
                    onChange={(dislikes) => update(profile.id, { dislikes })}
                    placeholder="Fx svampe"
                  />
                  <ChipInput
                    label={`Kan godt lide (${profile.name})`}
                    values={profile.preferences}
                    onChange={(preferences) => update(profile.id, { preferences })}
                    placeholder="Fx pasta"
                  />
                  <ChipInput
                    label={`Spiser altid (${profile.name})`}
                    values={profile.safeFoods ?? []}
                    onChange={(safeFoods) => update(profile.id, { safeFoods })}
                    placeholder="Fx nuggets, fiskefrikadeller"
                  />
                  <p className="m-0 -mt-1 text-[13px] leading-snug text-muted">
                    Planlæggeren må nogle gange bytte én del af retten ud med noget herfra, fx nuggets i stedet for bøf, så resten af retten er den samme.
                  </p>
                  <button
                    type="button"
                    onClick={() => onChange(profiles.filter((item) => item.id !== profile.id))}
                    className="flex h-11 w-fit items-center gap-2 self-end rounded-full px-4 text-sm font-semibold text-danger hover:bg-ground"
                  >
                    <Trash2 size={16} aria-hidden="true" />
                    Fjern {profile.name}
                  </button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      <button type="button" onClick={add} className="flex h-12 w-fit items-center gap-2 rounded-full border border-line px-5 text-[15px] font-semibold text-ink hover:bg-raised">
        <Plus size={18} aria-hidden="true" />
        Tilføj person
      </button>
    </SectionCard>
  );
}
