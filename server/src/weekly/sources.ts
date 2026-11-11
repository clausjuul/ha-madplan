/** Danish sites that publish a weekly dinner plan. See docs/weekly-sources.md for how each was checked. */
export type WeeklySource =
  | { kind: "valdemarsro"; name: string; url: string }
  | {
      kind: "wordpress";
      name: string;
      /** Site origin, e.g. "https://madensverden.dk". */
      origin: string;
      /** Titles to leave out (e.g. lunch-and-dinner plans for one). */
      skipTitle?: RegExp;
    };

export const WEEKLY_SOURCES: readonly WeeklySource[] = [
  { kind: "valdemarsro", name: "Valdemarsro", url: "https://www.valdemarsro.dk/madplan/" },
  { kind: "wordpress", name: "Sund på budget", origin: "https://sundpaabudget.dk", skipTitle: /single/iu },
  { kind: "wordpress", name: "Madens Verden", origin: "https://madensverden.dk" },
  { kind: "wordpress", name: "Hurtigmums", origin: "https://www.hurtigmums.dk" },
  { kind: "wordpress", name: "One Kitchen", origin: "https://onekitchenblog.com" },
  { kind: "wordpress", name: "Noget i ovnen", origin: "https://nogetiovnen.dk" },
];
