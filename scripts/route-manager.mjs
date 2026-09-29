import {
  MODULE_ID,
  ROUTE_STATUS
} from "./constants.mjs";
import {
  clearRouteResolution,
  getRouteManagerRows,
  locateTile,
  openTileConfig,
  pairLinks,
  resolveTile,
  setOneWay
} from "./route-service.mjs";

const escapeHTML = (value) => foundry.utils.escapeHTML(String(value ?? ""));

function optionHTML(item) {
  return `<option value="${escapeHTML(item.uuid)}"${item.selected ? " selected" : ""}>${escapeHTML(item.label)}</option>`;
}

function rowHTML(row) {
  const statusClass = row.status === ROUTE_STATUS.BROKEN
    ? "broken"
    : [ROUTE_STATUS.UNLINKED, ROUTE_STATUS.AMBIGUOUS].includes(row.status)
      ? "warning"
      : "ok";

  const pairOptions = [
    `<option value="">${escapeHTML(game.i18n.localize("CTN.RouteManager.SelectReturn"))}</option>`,
    ...row.reverseCandidates.map(optionHTML)
  ].join("");

  const arrivalOptions = [
    `<option value="">${escapeHTML(game.i18n.localize("CTN.RouteManager.SelectArrival"))}</option>`,
    ...row.arrivals.map(optionHTML)
  ].join("");

  return `
    <article class="ctn-route-row" data-tile-uuid="${escapeHTML(row.uuid)}">
      <div class="ctn-route-row__main">
        <div class="ctn-route-row__title">${escapeHTML(row.label)}</div>
        <div class="ctn-route-row__path">${escapeHTML(row.source)} → ${escapeHTML(row.target)}</div>
        <div class="ctn-route-row__status ${statusClass}">${escapeHTML(row.statusLabel)} · ${escapeHTML(row.resolution)}</div>
      </div>

      <div class="ctn-route-row__actions">
        <button type="button" data-action="locate"><i class="fa-solid fa-crosshairs"></i> ${escapeHTML(game.i18n.localize("CTN.RouteManager.Locate"))}</button>
        <button type="button" data-action="configure"><i class="fa-solid fa-gear"></i> ${escapeHTML(game.i18n.localize("CTN.RouteManager.Configure"))}</button>
      </div>

      <div class="ctn-route-row__resolve">
        <select data-role="pair-select">${pairOptions}</select>
        <button type="button" data-action="pair">${escapeHTML(game.i18n.localize("CTN.RouteManager.LinkReturn"))}</button>
        <select data-role="arrival-select">${arrivalOptions}</select>
        <button type="button" data-action="one-way">${escapeHTML(game.i18n.localize("CTN.RouteManager.MarkOneWay"))}</button>
        <button type="button" data-action="clear">${escapeHTML(game.i18n.localize("CTN.RouteManager.Clear"))}</button>
      </div>
    </article>
  `;
}

export class RouteManagerApplication extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: "ctn-route-manager",
    classes: ["ctn-route-manager-app"],
    position: { width: 900, height: 680 },
    window: {
      title: "CTN.RouteManager.Title",
      icon: "fa-solid fa-route",
      resizable: true
    }
  };

  async _renderHTML() {
    const rows = getRouteManagerRows();
    const root = document.createElement("div");
    root.className = "ctn-route-manager";
    root.innerHTML = rows.length
      ? rows.map(rowHTML).join("")
      : `<p class="hint">${escapeHTML(game.i18n.localize("CTN.RouteManager.Empty"))}</p>`;
    return root;
  }

  _replaceHTML(result, content) {
    content.replaceChildren(result);
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    const element = this.element;

    element.querySelectorAll("[data-action]").forEach((button) => {
      button.addEventListener("click", async (event) => {
        const action = event.currentTarget.dataset.action;
        const row = event.currentTarget.closest(".ctn-route-row");
        const link = resolveTile(row?.dataset.tileUuid);
        if (!link) return;

        if (action === "locate") {
          await locateTile(link);
          return;
        }

        if (action === "configure") {
          await openTileConfig(link);
          return;
        }

        if (action === "pair") {
          const pair = resolveTile(row.querySelector('[data-role="pair-select"]')?.value);
          if (!pair) return;
          await pairLinks(link, pair);
          await this.render();
          return;
        }

        if (action === "one-way") {
          const arrival = resolveTile(row.querySelector('[data-role="arrival-select"]')?.value);
          if (!arrival) {
            ui.notifications.warn(game.i18n.localize("CTN.Notifications.SelectArrival"));
            return;
          }
          await setOneWay(link, arrival);
          await this.render();
          return;
        }

        if (action === "clear") {
          await clearRouteResolution(link);
          await this.render();
        }
      });
    });
  }
}
