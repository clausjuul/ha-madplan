/*
 * Madplan dashboard cards for Home Assistant. Installed by the Madplan app to /local/madplan/madplan-cards.js.
 *
 *   type: custom:madplan-upcoming-card   # the coming days' dishes (from sensor.madplan_kommende)
 *   type: custom:madplan-app-card        # the Madplan web app embedded in the dashboard
 *
 * Plain JS without dependencies, so it is served as-is.
 */
const VERSION = "1";
const DEFAULT_ENTITY = "sensor.madplan_kommende";

const esc = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);

const STYLE = `
  :host { display: block; }
  ha-card { overflow: hidden; height: 100%; }
  .header { padding: 16px 16px 4px; font-size: 1.2em; font-weight: 500; display: flex; align-items: center; gap: 8px; }
  .list { padding: 4px 8px 12px; display: flex; flex-direction: column; }
  .row { display: flex; align-items: center; gap: 12px; padding: 6px 8px; border-radius: 10px; }
  .row.today { background: rgba(var(--rgb-primary-color, 3, 169, 244), 0.1); }
  .thumb { width: 48px; height: 48px; flex: none; border-radius: 8px; object-fit: cover; background: var(--secondary-background-color); display: grid; place-items: center; color: var(--secondary-text-color); }
  .text { min-width: 0; flex: 1; }
  .day { font-size: 0.8em; color: var(--secondary-text-color); text-transform: capitalize; }
  .dish { font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .dish.none { font-weight: 400; color: var(--secondary-text-color); font-style: italic; }
  .meta { font-size: 0.8em; color: var(--secondary-text-color); white-space: nowrap; }
  .empty, .warning { padding: 16px; color: var(--secondary-text-color); }
  .compact .thumb { width: 32px; height: 32px; }
  .compact .row { padding: 3px 8px; }
`;

function dayLabel(day, index) {
  if (index === 0) return "I dag";
  if (index === 1) return "I morgen";
  const [, m, d] = day.date.split("-").map(Number);
  return `${day.weekday} ${d}/${m}`;
}

class MadplanUpcomingCard extends HTMLElement {
  setConfig(config) {
    this._config = { entity: DEFAULT_ENTITY, days: 7, show_images: true, show_today: true, hide_empty: false, compact: false, ...config };
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
    return 1 + Math.ceil((this._config?.days ?? 7) * 0.8);
  }

  getGridOptions() {
    return { columns: 6, min_columns: 3, rows: "auto" };
  }

  static getStubConfig() {
    return { entity: DEFAULT_ENTITY, days: 7 };
  }

  render() {
    const config = this._config;
    const state = this._hass?.states[config.entity];
    const title = config.title ?? "Madplan";
    const header = title ? `<div class="header"><ha-icon icon="mdi:silverware-fork-knife"></ha-icon>${esc(title)}</div>` : "";
    let body;
    if (!state) {
      body = `<div class="warning">Entiteten ${esc(config.entity)} findes ikke. Er Madplan-appen startet?</div>`;
    } else {
      let days = Array.isArray(state.attributes.days) ? state.attributes.days.map((day, index) => ({ day, index })) : [];
      if (!config.show_today) days = days.filter(({ index }) => index > 0);
      if (config.hide_empty) days = days.filter(({ day }) => day.dish);
      days = days.slice(0, Number(config.days) || 7);
      body = days.length
        ? `<div class="list${config.compact ? " compact" : ""}">${days.map(({ day, index }) => this.row(day, index)).join("")}</div>`
        : `<div class="empty">Ingen retter planlagt.</div>`;
    }
    this.shadowRoot.innerHTML = `<style>${STYLE}</style><ha-card>${header}${body}</ha-card>`;
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
    this._config = { entity: DEFAULT_ENTITY, view: "uge", height: "640px", ...config };
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
    return { view: "uge", height: "640px" };
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
