/** Loading placeholders that match the shapes of the real cards. */
export function WeekSkeleton({ wide }: { wide: boolean }) {
  if (!wide) {
    return (
      <div className="flex flex-col gap-2.5 px-4" aria-busy="true" aria-label="Henter ugen">
        <div className="skeleton h-[210px] rounded-3xl" />
        <div className="skeleton mt-2 h-5 w-32 rounded-full" />
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="skeleton h-[72px] rounded-[18px]" />
        ))}
      </div>
    );
  }
  return (
    <div
      className="flex flex-col gap-[26px] px-8 pb-7 pt-6"
      aria-busy="true"
      aria-label="Henter ugen"
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="skeleton h-[292px] rounded-[28px]" />
        <div className="hidden flex-col gap-4 lg:flex">
          <div className="skeleton flex-1 rounded-3xl" />
          <div className="skeleton h-[96px] rounded-3xl" />
        </div>
      </div>
      <div className="grid grid-cols-4 gap-3 lg:grid-cols-7">
        {Array.from({ length: 7 }, (_, index) => (
          <div key={index} className="skeleton h-[250px] rounded-[20px]" />
        ))}
      </div>
    </div>
  );
}

/** Generic placeholder while a lazily loaded route chunk arrives. */
export function RouteSkeleton() {
  return (
    <div className="flex flex-col gap-3 px-4 pt-6 sm:px-8" role="status" aria-busy="true" aria-label="Henter">
      <div className="skeleton h-8 w-48 rounded-full" />
      <div className="skeleton h-[72px] rounded-[18px]" />
      <div className="skeleton h-[72px] rounded-[18px]" />
      <div className="skeleton h-[72px] rounded-[18px]" />
    </div>
  );
}
