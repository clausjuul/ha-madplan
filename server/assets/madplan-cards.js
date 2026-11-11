/*
 * Madplan dashboard cards for Home Assistant. Installed by the Madplan app to /local/madplan/madplan-cards.js.
 *
 *   type: custom:madplan-upcoming-card   # the coming days' dishes (from sensor.madplan_kommende)
 *   type: custom:madplan-app-card        # the Madplan web app embedded in the dashboard
 *
 * Plain JS without dependencies, so it is served as-is.
 */
const VERSION = "4";
const DEFAULT_ENTITY = "sensor.madplan_kommende";

/*
 * Visual editors built on Home Assistant's own <ha-form>, so they look and behave like the built-in cards.
 * Each schema field maps 1:1 to a config key; unchanged defaults are left out of the saved YAML.
 */
const ENTITY_SELECTOR = { entity: { domain: "sensor" } };
const UPCOMING_SCHEMA = [
  { name: "title", selector: { text: {} } },
  { name: "entity", selector: ENTITY_SELECTOR },
  { name: "days", selector: { number: { min: 1, max: 14, mode: "slider" } } },
  { name: "layout", selector: { select: { mode: "box", options: [{ value: "list", label: "Liste" }, { value: "tiles", label: "Billeder med tekst" }] } } },
  {
    type: "grid",
    name: "",
    schema: [
      { name: "columns", selector: { number: { min: 1, max: 4, mode: "box" } } },
      { name: "tile_height", selector: { number: { min: 60, max: 400, step: 10, mode: "box", unit_of_measurement: "px" } } },
      { name: "aspect_ratio", selector: { text: {} } },
      { name: "font_size", selector: { number: { min: 10, max: 40, mode: "box", unit_of_measurement: "px" } } },
    ],
  },
  {
    type: "grid",
    name: "",
    schema: [
      { name: "show_images", selector: { boolean: {} } },
      { name: "show_today", selector: { boolean: {} } },
      { name: "hide_empty", selector: { boolean: {} } },
      { name: "compact", selector: { boolean: {} } },
    ],
  },
];
const VIEW_OPTIONS = [
  { value: "uge", label: "Uge" },
  { value: "indkob", label: "Indkøb" },
  { value: "retter", label: "Retter" },
  { value: "planlaeg", label: "Planlæg" },
  { value: "indstillinger", label: "Indstillinger" },
];
const APP_SCHEMA = [
  { name: "view", selector: { select: { mode: "dropdown", options: VIEW_OPTIONS } } },
  { name: "height", selector: { text: {} } },
  { name: "entity", selector: ENTITY_SELECTOR },
];
const LABELS = {
  title: "Overskrift (tom skjuler den)",
  entity: "Entitet",
  days: "Antal dage",
  show_images: "Vis billeder",
  show_today: "Medtag i dag",
  hide_empty: "Skjul dage uden ret",
  compact: "Kompakt (liste)",
  layout: "Layout",
  columns: "Kolonner (billeder)",
  tile_height: "Billedhøjde",
  aspect_ratio: "Billedformat (f.eks. 16:9)",
  font_size: "Skriftstørrelse",
  view: "Visning",
  height: "Højde (f.eks. 640px eller auto)",
};
const HELPERS = {
  aspect_ratio: "Billeder med tekst: erstatter billedhøjden, når det er udfyldt",
  font_size: "Retternes navn; ugedagen bliver lidt mindre",
  entity: "Normalt sensor.madplan_kommende",
};

class MadplanEditor extends HTMLElement {
  constructor(schema, defaults) {
    super();
    this._schema = schema;
    this._defaults = defaults;
  }

  setConfig(config) {
    this._config = config;
    this.render();
  }

  set hass(hass) {
    this._hass = hass;
    if (this._form) this._form.hass = hass;
    else this.render();
  }

  render() {
    if (!this._config || !this._hass) return;
    if (!this._form) {
      this._form = document.createElement("ha-form");
      this._form.computeLabel = (field) => LABELS[field.name] ?? field.name;
      this._form.computeHelper = (field) => HELPERS[field.name];
      this._form.addEventListener("value-changed", (event) => this.changed(event.detail.value));
      this.appendChild(this._form);
    }
    this._form.hass = this._hass;
    this._form.schema = this._schema;
    this._form.data = { ...this._defaults, ...this._config };
  }

  changed(value) {
    const config = { type: this._config.type };
    for (const [key, val] of Object.entries(value)) {
      if (key === "type" || val === undefined) continue;
      // Values equal to the default are left out; an empty title stays (it hides the header).
      if (val === this._defaults[key]) continue;
      config[key] = val;
    }
    this._config = config;
    this.dispatchEvent(new CustomEvent("config-changed", { detail: { config }, bubbles: true, composed: true }));
  }
}

const UPCOMING_DEFAULTS = { title: "Madplan", entity: DEFAULT_ENTITY, days: 7, show_images: true, show_today: true, hide_empty: false, compact: false, layout: "list", columns: 2, tile_height: 140 };
const APP_DEFAULTS = { entity: DEFAULT_ENTITY, view: "uge", height: "640px" };

class MadplanUpcomingCardEditor extends MadplanEditor {
  constructor() {
    super(UPCOMING_SCHEMA, UPCOMING_DEFAULTS);
  }
}

class MadplanAppCardEditor extends MadplanEditor {
  constructor() {
    super(APP_SCHEMA, APP_DEFAULTS);
  }
}

if (!customElements.get("madplan-upcoming-card-editor")) customElements.define("madplan-upcoming-card-editor", MadplanUpcomingCardEditor);
if (!customElements.get("madplan-app-card-editor")) customElements.define("madplan-app-card-editor", MadplanAppCardEditor);

const esc = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);

const STYLE = `
  :host { display: block; }
  ha-card { overflow: hidden; height: 100%; }
  .header { padding: 16px 16px 4px; font-size: 1.2em; font-weight: 500; display: flex; align-items: center; gap: 8px; }
  .list { padding: 4px 8px 12px; display: flex; flex-direction: column; }
  .row { display: flex; align-items: center; gap: 12px; padding: 6px 8px; border-radius: 10px; }
  .row.today { background: rgba(var(--rgb-primary-color, 3, 169, 244), 0.1); }
  .thumb { width: 48px; height: var(--madplan-thumb-height, 48px); aspect-ratio: var(--madplan-aspect, auto); flex: none; border-radius: 8px; object-fit: cover; background: var(--secondary-background-color); display: grid; place-items: center; color: var(--secondary-text-color); }
  .text { min-width: 0; flex: 1; }
  .day { font-size: 0.8em; color: var(--secondary-text-color); }
  .day::first-letter { text-transform: uppercase; }
  .dish { font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .dish.none { font-weight: 400; color: var(--secondary-text-color); font-style: italic; }
  .meta { font-size: 0.8em; color: var(--secondary-text-color); white-space: nowrap; }
  .empty, .warning { padding: 16px; color: var(--secondary-text-color); }
  .compact .thumb { width: 32px; height: var(--madplan-thumb-height, 32px); }
  .compact .row { padding: 3px 8px; }
  .tiles { padding: 8px 12px 12px; display: grid; gap: 8px; grid-template-columns: repeat(var(--madplan-columns, 2), minmax(0, 1fr)); }
  .tile { position: relative; height: var(--madplan-tile-height, 140px); aspect-ratio: var(--madplan-aspect, auto); border-radius: var(--ha-card-border-radius, 12px); overflow: hidden; background: var(--secondary-background-color); color: #fff; }
  .tile img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
  .tile .placeholder { position: absolute; inset: 0; display: grid; place-items: center; color: var(--secondary-text-color); --mdc-icon-size: 40px; opacity: 0.5; }
  .tile .overlay { position: absolute; inset: auto 0 0 0; padding: 24px 10px 8px; background: linear-gradient(to top, rgba(0,0,0,0.78), rgba(0,0,0,0.35) 65%, transparent); }
  .tile.noimg .overlay { background: none; color: var(--primary-text-color); }
  .tile .day { color: inherit; opacity: 0.85; }
  .tile .dish { color: inherit; white-space: normal; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; text-shadow: 0 1px 2px rgba(0,0,0,0.4); }
  .tile.noimg .dish { text-shadow: none; }
  .tile .dish.none { color: inherit; opacity: 0.8; }
  .tile .badge { position: absolute; top: 8px; right: 8px; padding: 2px 8px; border-radius: 999px; font-size: 0.75em; background: rgba(0,0,0,0.55); color: #fff; }
  .tile.today { outline: 3px solid var(--primary-color); outline-offset: -3px; }
`;

/** "16:9", "16/9", "1.5" or "1" -> a CSS aspect-ratio value; anything else -> "". */
function parseRatio(value) {
  const match = String(value ?? "").trim().match(/^(\d+(?:[.,]\d+)?)\s*(?:[:/x]\s*(\d+(?:[.,]\d+)?))?$/);
  if (!match) return "";
  const width = Number(match[1].replace(",", "."));
  const height = match[2] ? Number(match[2].replace(",", ".")) : 1;
  return width > 0 && height > 0 ? `${width} / ${height}` : "";
}

function dayLabel(day, index) {
  if (index === 0) return "I dag";
  if (index === 1) return "I morgen";
  const [, m, d] = day.date.split("-").map(Number);
  return `${day.weekday} ${d}/${m}`;
}

class MadplanUpcomingCard extends HTMLElement {
  setConfig(config) {
    this._config = { ...UPCOMING_DEFAULTS, ...config };
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
    this._last = undefined;
    if (this._hass) this.render();
  }

  set hass(hass) {
    this._hass = hass;
    const state = hass.states[this._config.entity];
    if (state === this._last) return;
    this._last = state;
    this.render();
  }

  getCardSize() {
    const config = this._config ?? UPCOMING_DEFAULTS;
    if (config.layout === "tiles") {
      const rows = Math.ceil((Number(config.days) || 7) / (Number(config.columns) || 2));
      return 1 + Math.ceil((rows * ((Number(config.tile_height) || 140) + 8)) / 50);
    }
    return 1 + Math.ceil((Number(config.days) || 7) * 0.8);
  }

  getGridOptions() {
    return { columns: 6, min_columns: 3, rows: "auto" };
  }

  static getStubConfig() {
    return { days: 7 };
  }

  static getConfigElement() {
    return document.createElement("madplan-upcoming-card-editor");
  }

  render() {
    const config = this._config;
    const state = this._hass?.states[config.entity];
    const title = config.title;
    const header = title ? `<div class="header"><ha-icon icon="mdi:silverware-fork-knife"></ha-icon>${esc(title)}</div>` : "";
    let body;
    if (!state) {
      body = `<div class="warning">Entiteten ${esc(config.entity)} findes ikke. Er Madplan-appen startet?</div>`;
    } else {
      let days = Array.isArray(state.attributes.days) ? state.attributes.days.map((day, index) => ({ day, index })) : [];
      if (!config.show_today) days = days.filter(({ index }) => index > 0);
      if (config.hide_empty) days = days.filter(({ day }) => day.dish);
      days = days.slice(0, Number(config.days) || 7);
      const columns = Math.min(4, Math.max(1, Number(config.columns) || 2));
      const height = Math.max(60, Number(config.tile_height) || 140);
      const ratio = parseRatio(config.aspect_ratio);
      const size = Number(config.font_size) > 0 ? `font-size:${Math.min(40, Math.max(10, Number(config.font_size)))}px;` : "";
      const tileStyle = ratio ? `--madplan-aspect:${ratio};--madplan-tile-height:auto` : `--madplan-tile-height:${height}px`;
      body = !days.length
        ? `<div class="empty">Ingen retter planlagt.</div>`
        : config.layout === "tiles"
          ? `<div class="tiles" style="${size}--madplan-columns:${columns};${tileStyle}">${days.map(({ day, index }) => this.tile(day, index)).join("")}</div>`
          : `<div class="list${config.compact ? " compact" : ""}" style="${size}${ratio ? `--madplan-aspect:${ratio};--madplan-thumb-height:auto` : ""}">${days.map(({ day, index }) => this.row(day, index)).join("")}</div>`;
    }
    this.shadowRoot.innerHTML = `<style>${STYLE}</style><ha-card>${header}${body}</ha-card>`;
  }

  tile(day, index) {
    const image = day.picture
      ? `<img src="${esc(day.picture)}" alt="" loading="lazy">`
      : `<div class="placeholder"><ha-icon icon="${day.skipped ? "mdi:close" : "mdi:silverware-variant"}"></ha-icon></div>`;
    const dish = day.dish
      ? `<div class="dish">${esc(day.dish)}</div>`
      : `<div class="dish none">${day.skipped ? "Ingen aftensmad" : "Ikke planlagt"}</div>`;
    const badge = day.prep_minutes ? `<div class="badge">${esc(day.prep_minutes)} min</div>` : "";
    const classes = `tile${index === 0 ? " today" : ""}${day.picture ? "" : " noimg"}`;
    return `<div class="${classes}">${image}${badge}<div class="overlay"><div class="day">${esc(dayLabel(day, index))}</div>${dish}</div></div>`;
  }

  row(day, index) {
    const config = this._config;
    const thumb = config.show_images
      ? day.picture
        ? `<img class="thumb" src="${esc(day.picture)}" alt="" loading="lazy">`
        : `<div class="thumb"><ha-icon icon="${day.skipped ? "mdi:close" : "mdi:silverware-variant"}"></ha-icon></div>`
      : "";
    const dish = day.dish
      ? `<div class="dish">${esc(day.dish)}</div>`
      : `<div class="dish none">${day.skipped ? "Ingen aftensmad" : "Ikke planlagt"}</div>`;
    const meta = day.prep_minutes ? `<div class="meta">${esc(day.prep_minutes)} min</div>` : "";
    return `<div class="row${index === 0 ? " today" : ""}">${thumb}<div class="text"><div class="day">${esc(dayLabel(day, index))}</div>${dish}</div>${meta}</div>`;
  }
}

/*
 * Embeds the app through Home Assistant ingress. Like the HA frontend's own app panels, it opens an
 * ingress session (admin users only), stores it in the ingress_session cookie and keeps it alive.
 */
const VIEWS = { uge: "", indkob: "#/indkob", retter: "#/retter", planlaeg: "#/planlaeg", indstillinger: "#/indstillinger" };
let sharedSession;
let keepAlive;

async function ensureSession(hass) {
  if (sharedSession) return sharedSession;
  sharedSession = (async () => {
    const result = await hass.callWS({ type: "supervisor/api", endpoint: "/ingress/session", method: "post" });
    const session = result?.session ?? result?.data?.session;
    if (!session) throw new Error("Ingen ingress-session");
    const secure = location.protocol === "https:" ? ";Secure" : "";
    document.cookie = `ingress_session=${session};path=/api/hassio_ingress/;SameSite=Strict${secure}`;
    clearInterval(keepAlive);
    keepAlive = setInterval(async () => {
      try {
        await hass.callWS({ type: "supervisor/api", endpoint: "/ingress/validate_session", method: "post", data: { session } });
      } catch {
        sharedSession = undefined;
        clearInterval(keepAlive);
      }
    }, 60_000);
    return session;
  })();
  sharedSession.catch(() => (sharedSession = undefined));
  return sharedSession;
}

class MadplanAppCard extends HTMLElement {
  setConfig(config) {
    if (config.view && !(config.view in VIEWS)) throw new Error(`Ukendt view: ${config.view} (brug ${Object.keys(VIEWS).join(", ")})`);
    this._config = { ...APP_DEFAULTS, ...config };
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
    this._src = undefined;
    if (this._hass) this.update();
  }

  set hass(hass) {
    this._hass = hass;
    this.update();
  }

  getCardSize() {
    return 12;
  }

  getGridOptions() {
    return { columns: "full", rows: 10, min_rows: 4 };
  }

  static getStubConfig() {
    return { view: "uge" };
  }

  static getConfigElement() {
    return document.createElement("madplan-app-card-editor");
  }

  message(text) {
    this.shadowRoot.innerHTML = `<style>${STYLE}</style><ha-card><div class="warning">${esc(text)}</div></ha-card>`;
    this._src = undefined;
  }

  async update() {
    const hass = this._hass;
    const config = this._config;
    const base = config.ingress_url ?? hass.states[config.entity]?.attributes.ingress_url;
    if (!base) return this.message("Kender ikke Madplans adresse endnu. Er Madplan-appen startet (version med dashboard-kort)?");
    if (!hass.user?.is_admin) return this.message("Madplan kan kun vises indlejret for administratorer (Home Assistant-begrænsning for apps).");
    const src = `${base.replace(/\/?$/, "/")}${VIEWS[config.view] ?? ""}`;
    if (src === this._src || this._loading) return;
    this._loading = true;
    try {
      await ensureSession(hass);
      const height = config.height === "auto" ? "100%" : esc(config.height);
      this.shadowRoot.innerHTML = `<style>${STYLE} iframe { border: 0; width: 100%; height: ${height}; display: block; }</style>
        <ha-card><iframe src="${esc(src)}" title="Madplan" allow="clipboard-write; wake-lock; fullscreen"></iframe></ha-card>`;
      this._src = src;
    } catch (error) {
      this.message(`Kunne ikke åbne Madplan: ${error?.message ?? error}`);
    } finally {
      this._loading = false;
    }
  }
}

if (!customElements.get("madplan-upcoming-card")) customElements.define("madplan-upcoming-card", MadplanUpcomingCard);
if (!customElements.get("madplan-app-card")) customElements.define("madplan-app-card", MadplanAppCard);

window.customCards = window.customCards || [];
for (const card of [
  { type: "madplan-upcoming-card", name: "Madplan: kommende dage", description: "Aftensmaden de næste dage fra Madplan." },
  { type: "madplan-app-card", name: "Madplan: app", description: "Madplan-appen vist direkte i dashboardet." },
]) {
  if (!window.customCards.some((existing) => existing.type === card.type)) window.customCards.push({ ...card, preview: card.type === "madplan-upcoming-card" });
}
console.info(`%c MADPLAN-CARDS %c v${VERSION} `, "background:#2e7d32;color:#fff", "");
