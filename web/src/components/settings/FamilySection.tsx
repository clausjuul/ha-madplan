import { Plus, Trash2 } from "lucide-react";
import type { Profile } from "@madplan/domain";
import { ChipInput } from "@/components/ui/ChipInput";
import { CommitInput, SectionCard, Toggle } from "@/components/ui/Controls";

type Props = { profiles: Profile[]; onChange: (profiles: Profile[]) => void };

export function FamilySection({ profiles, onChange }: Props) {
  const update = (id: string, patch: Partial<Profile>): void =>
    onChange(profiles.map((profile) => (profile.id === id ? { ...profile, ...patch } : profile)));

  const add = (): void =>
    onChange([
      ...profiles,
      {
        id: `profile-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
        name: "Ny person",
        active: true,
        exclusions: [],
        preferences: [],
        dislikes: [],
        favoriteDishIds: [],
      },
    ]);

  return (
    <SectionCard
      title="Familien"
      description="Aktive personer styrer antal portioner og hvilke retter der foreslås. Udeladte personer tæller ikke med."
    >
      <ul className="m-0 grid list-none gap-3 p-0 lg:grid-cols-2">
        {profiles.map((profile) => (
          <li key={profile.id} className="flex flex-col gap-3 rounded-3xl bg-raised p-4">
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
          </li>
        ))}
      </ul>
      <button type="button" onClick={add} className="flex h-12 w-fit items-center gap-2 rounded-full border border-line px-5 text-[15px] font-semibold text-ink hover:bg-raised">
        <Plus size={18} aria-hidden="true" />
        Tilføj person
      </button>
    </SectionCard>
  );
}
