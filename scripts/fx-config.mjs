/** Type-specific Visual FX editor for CTN TileConfig. No form fields rendered until enabled. */
import { MODULE_ID } from "./constants.mjs";
import {
  FX_LIFETIMES, editFXOnCanvas, fxCenter, fxConfig, fxEventsFor,
  isSequencerAvailable, jb2aPaths, playTileFX, stopTileFX
} from "./seqfx.mjs";
import { resolveTile } from "./route-service.mjs";
import { JB2A_FACETS, indexJB2APaths, facetValues, filterJB2AIndex } from "./jb2a-browser-filters.mjs";

const escape = (value) => foundry.utils.escapeHTML(String(value ?? ""));
const label = (key) => game.i18n.localize(`CTN.FX.${key}`);
const field = (key) => `flags.${MODULE_ID}.visualFX.${key}`;
const opt = (value, title, selected) => `<option value="${escape(value)}"${value === selected ? " selected" : ""}>${escape(title)}</option>`;
const input = (name, value, type = "number", attrs = "") =>
  `<input type="${type}" data-ctn-fx-value="${escape(name)}" name="${field(name)}" value="${escape(value)}" ${attrs}>`;

export function fxConfigHTML(tile) {
  const cfg = fxConfig(tile);
  const active = isSequencerAvailable();
  const fxEvents = fxEventsFor(tile);
  const options = [
    ["activation", "OnActivation"], ["pass", "OnPASS"], ["fail", "OnFAIL"],
    ["hazard", "OnHazard"], ["before", "BeforeTransition"], ["after", "AfterArrival"],
    ["arrival", "OnArrival"]
  ];
  const eventOptions = options.filter(([id]) => fxEvents.includes(id))
    .map(([id, key]) => opt(id, label(key), cfg.event)).join("");
  const positionOpts = [["tile", "CenterTile"], ["custom", "CustomScene"], ["other", "OtherTile"]]
    .map(([id, key]) => opt(id, label(key), cfg.position)).join("");
  const lifetimes = [[FX_LIFETIMES.NATURAL,"Natural"],[FX_LIFETIMES.SECONDS,"FixedSeconds"],
    [FX_LIFETIMES.TOKEN,"WhileToken"],[FX_LIFETIMES.AREA,"WhileArea"],
    [FX_LIFETIMES.PERSISTENT,"Persistent"]]
    .map(([id, key]) => opt(id, label(key), cfg.lifetime)).join("");
  const otherTiles = [...(tile.parent?.tiles ?? [])]
    .filter((other) => other.id !== tile.id)
    .sort((a,b) => String(a.name ?? a.id).localeCompare(String(b.name ?? b.id)))
    .map((other) => opt(other.uuid, other.name ?? other.id, cfg.otherTileUuid)).join("");
  return `<fieldset class="ctn-config ctn-fx-config" data-ctn-fx-config>
    <legend><i class="fa-solid fa-wand-magic-sparkles"></i> ${escape(label("VisualEffects"))}</legend>
    <div class="form-group"><label>${escape(label("Enable"))}</label>
      <div class="form-fields"><input type="hidden" data-ctn-fx-enabled-value name="${field("enabled")}" value="${cfg.enabled ? "true" : "false"}">
        <input type="checkbox" data-ctn-fx-enabled ${cfg.enabled ? "checked" : ""}></div></div>
    <div data-ctn-fx-body ${cfg.enabled ? "" : "hidden"}>
      <p class="hint">${escape(active ? label("DependencyReady") : label("MissingSequencer"))}</p>
      <div class="form-group"><label>${escape(label("Effect"))}</label><div class="form-fields ctn-fx-file">
        ${input("effect", cfg.effect, "text", 'data-ctn-fx-effect placeholder="jb2a..."')}
        <button type="button" data-ctn-fx-browse title="${escape(label("Browse"))}"><i class="fa-solid fa-magnifying-glass"></i></button>
        <button type="button" data-ctn-fx-preview title="${escape(label("Preview"))}"><i class="fa-solid fa-play"></i></button>
      </div></div>
      <div class="form-group"><label>${escape(label("Event"))}</label><div class="form-fields">
        <select name="${field("event")}">${eventOptions}</select></div></div>
      <hr class="ctn-fx-separator">
      <div class="form-group"><label>${escape(label("Position"))}</label><div class="form-fields">
        <select data-ctn-fx-position name="${field("position")}">${positionOpts}</select></div></div>
      <div class="form-group" data-ctn-fx-other-row><label>${escape(label("OtherTile"))}</label><div class="form-fields">
        <select name="${field("otherTileUuid")}">${opt("", label("SelectTile"), cfg.otherTileUuid)}${otherTiles}</select></div></div>
      <div class="form-group" data-ctn-fx-custom-row><label>${escape(label("Coordinates"))}</label>
        <div class="form-fields">${input("point.x",cfg.point.x)} ${input("point.y",cfg.point.y)}</div></div>
      <div class="form-group"><label>${escape(label("WidthHeight"))}</label>
        <div class="form-fields">${input("width",cfg.width,"number", 'min="0.1" max="100" step="0.1"')} × ${input("height",cfg.height,"number", 'min="0.1" max="100" step="0.1"')}
        <span class="ctn-fx-units">${escape(label("GridUnits"))}</span></div></div>
      <div class="form-group"><label>${escape(label("CanvasEditor"))}</label><div class="form-fields">
        <button type="button" data-ctn-fx-canvas><i class="fa-solid fa-up-down-left-right"></i> ${escape(label("EditCanvas"))}</button></div></div>
      <p class="hint">${escape(label("CanvasHint"))}</p>
      <hr class="ctn-fx-separator">
      <div class="form-group"><label>${escape(label("Lifetime"))}</label><div class="form-fields">
        <select data-ctn-fx-lifetime name="${field("lifetime")}">${lifetimes}</select></div></div>
      <div class="form-group" data-ctn-fx-seconds-row><label>${escape(label("Seconds"))}</label>
        <div class="form-fields">${input("seconds",cfg.seconds,"number", 'min="0.1" max="3600" step="0.1"')}</div></div>
      <div class="form-group"><label>${escape(label("EndBehavior"))}</label><div class="form-fields">
        <select data-ctn-fx-end-mode name="${field("endMode")}">
          ${opt("instant",label("Instant"),cfg.endMode)}${opt("fade",label("Fade"),cfg.endMode)}</select></div></div>
      <div class="form-group"><label>${escape(label("FadeIn"))}</label><div class="form-fields">
        ${input("fadeIn",cfg.fadeIn,"number", 'min="0" max="60" step="0.1"')} ${escape(label("SecondsUnit"))}</div></div>
      <div class="form-group" data-ctn-fx-fadeout-row><label>${escape(label("FadeOut"))}</label><div class="form-fields">
        ${input("fadeOut",cfg.fadeOut,"number", 'min="0" max="60" step="0.1"')} ${escape(label("SecondsUnit"))}</div></div>
      <div class="form-group"><label>${escape(label("Repeat"))}</label><div class="form-fields">
        <select name="${field("repeat")}">${opt("one",label("OnePerTile"),cfg.repeat)}${opt("per",label("PerActivation"),cfg.repeat)}</select></div></div>
      <p class="hint">${escape(label("MechanicsSeparate"))}</p>
      <div class="form-group"><div class="form-fields"><button type="button" data-ctn-fx-stop>
        <i class="fa-solid fa-stop"></i> ${escape(label("StopFX"))}</button></div></div>
    </div>
  </fieldset>`;
}

function liveConfig(tile, root) {
  const cfg = fxConfig(tile);
  const get = (name) => root.querySelector(`[data-ctn-fx-value="${name}"]`)?.value;
  const select = (name) => root.querySelector(`[name="${field(name)}"]`)?.value;
  const num = (name, fallback) => Number(get(name)) || fallback;
  return {
    ...cfg,
    enabled: root.querySelector("[data-ctn-fx-enabled]")?.checked ?? cfg.enabled,
    effect: get("effect") ?? cfg.effect,
    event: select("event") ?? cfg.event,
    position: select("position") ?? cfg.position,
    otherTileUuid: select("otherTileUuid") ?? cfg.otherTileUuid,
    point: { x: Number(get("point.x")) || 0, y: Number(get("point.y")) || 0 },
    width: num("width",cfg.width), height: num("height",cfg.height),
    lifetime: select("lifetime") ?? cfg.lifetime, seconds: num("seconds",cfg.seconds),
    fadeIn: Number(get("fadeIn")) || 0, fadeOut: Number(get("fadeOut")) || 0,
    endMode: select("endMode") ?? cfg.endMode, repeat: select("repeat") ?? cfg.repeat
  };
}
function updateInput(root, name, value) {
  const el = root.querySelector(`[data-ctn-fx-value="${name}"]`);
  if (el) { el.value = String(value); el.dispatchEvent(new Event("change", { bubbles: true })); }
}

/** Resolve an installed JB2A database entry for a GM-only HTML video preview.
 * Sequencer returns a SequencerFile or an array thereof, not always a path.
 * Using the media element avoids any Scene FX, persistent flags, or sockets.
 */
async function previewMediaPath(path) {
  const entry = globalThis.Sequencer?.Database?.getEntry?.(path, { softFail: true });
  if (!entry) return null;
  const fileEntry = Array.isArray(entry) ? entry[0] : entry;
  let file = typeof fileEntry?.getFile === "function" ? await fileEntry.getFile() : fileEntry;
  if (file && typeof file === "object" && !Array.isArray(file)) file = file.file ?? file.path ?? file.src ?? file;
  if (Array.isArray(file)) file = file[0];
  if (typeof file !== "string" || !/\.(?:webm|mp4|png|jpe?g|webp)(?:[?#].*)?$/i.test(file)) return null;
  return file;
}

function openEffectBrowser(onChoose, current = "") {
  const paths = jb2aPaths();
  if (!paths.length) { ui.notifications.warn(label("NoEffects")); return; }
  const PAGE_SIZE = 100;
  const index = indexJB2APaths(paths);
  const filterFields = JB2A_FACETS.map((facet) => {
    const title = label(`Filter${facet[0].toUpperCase()}${facet.slice(1)}`);
    const choices = facetValues(index, facet)
      .map((value) => opt(value, value, "")).join("");
    return `<label class="ctn-fx-browser__filter"><span>${escape(title)}</span>
      <select data-fx-filter="${facet}" aria-label="${escape(title)}">${opt("", label("All"), "")}${choices}</select></label>`;
  }).join("");
  const dlg = document.createElement("dialog");
  dlg.className = "ctn-fx-browser";
  dlg.innerHTML = `<section class="ctn-fx-browser__layout">
    <div class="ctn-fx-browser__list">
      <header><strong>${escape(label("Browse"))}</strong>
        <button type="button" data-fx-close aria-label="Close">×</button></header>
      <div class="ctn-fx-browser__filters">${filterFields}</div>
      <input type="search" data-fx-query placeholder="${escape(label("Search"))}" autocomplete="off">
      <p class="hint" data-fx-count></p>
      <div data-fx-results class="ctn-fx-results" role="listbox"></div>
      <nav class="ctn-fx-browser__pages" aria-label="${escape(label("PageNavigation"))}">
        <button type="button" data-fx-first title="${escape(label("FirstPage"))}" aria-label="${escape(label("FirstPage"))}">«</button>
        <button type="button" data-fx-previous title="${escape(label("PreviousPage"))}" aria-label="${escape(label("PreviousPage"))}">‹</button>
        <input data-fx-page type="number" min="1" step="1" value="1" aria-label="${escape(label("PageNumber"))}">
        <button type="button" data-fx-go title="${escape(label("GoPage"))}">${escape(label("GoPage"))}</button>
        <span data-fx-pages-count></span>
        <button type="button" data-fx-next title="${escape(label("NextPage"))}" aria-label="${escape(label("NextPage"))}">›</button>
        <button type="button" data-fx-last title="${escape(label("LastPage"))}" aria-label="${escape(label("LastPage"))}">»</button>
      </nav>
    </div>
    <div class="ctn-fx-browser__preview">
      <strong>${escape(label("Preview"))}</strong>
      <div class="ctn-fx-browser__media">
        <video data-fx-video muted loop playsinline autoplay controls hidden></video>
        <img data-fx-image alt="" hidden>
        <p data-fx-status>${escape(label("ChoosePreview"))}</p>
      </div>
      <p data-fx-path class="ctn-fx-browser__path"></p>
      <footer>
        <button type="button" data-fx-cancel>${escape(label("CancelEditor"))}</button>
        <button type="button" data-fx-confirm disabled>${escape(label("ConfirmEffect"))}</button>
      </footer>
    </div>
  </section>`;
  document.body.append(dlg);
  const search = dlg.querySelector("[data-fx-query]");
  const results = dlg.querySelector("[data-fx-results]");
  const count = dlg.querySelector("[data-fx-count]");
  const video = dlg.querySelector("[data-fx-video]");
  const image = dlg.querySelector("[data-fx-image]");
  const status = dlg.querySelector("[data-fx-status]");
  const pathLabel = dlg.querySelector("[data-fx-path]");
  const confirm = dlg.querySelector("[data-fx-confirm]");
  const pageInput = dlg.querySelector("[data-fx-page]");
  const pageCount = dlg.querySelector("[data-fx-pages-count]");
  const filters = Object.fromEntries(JB2A_FACETS.map((facet) => [facet, dlg.querySelector(`[data-fx-filter="${facet}"]`)]));
  let selected = paths.includes(current) ? current : "";
  let previewedPath = "";
  let previewRequest = 0;
  let filtered = index;
  let page = selected ? Math.floor(paths.indexOf(selected) / PAGE_SIZE) + 1 : 1;
  const stopMedia = () => {
    video.pause(); video.removeAttribute("src"); video.load();
    video.hidden = true; image.removeAttribute("src"); image.hidden = true;
  };
  const preview = async (path) => {
    const request = ++previewRequest;
    stopMedia();
    pathLabel.textContent = path;
    status.textContent = label("LoadingPreview");
    status.hidden = false;
    try {
      const file = await previewMediaPath(path);
      if (request !== previewRequest || !dlg.isConnected) return;
      if (!file) { status.textContent = label("PreviewUnavailable"); return; }
      if (/\.(png|jpe?g|webp)(?:[?#].*)?$/i.test(file)) {
        image.src = file; image.hidden = false;
      } else {
        video.src = file; video.hidden = false;
        void video.play().catch(() => {});
      }
      status.hidden = true;
    } catch (error) {
      if (request !== previewRequest) return;
      console.warn(`${MODULE_ID} | JB2A preview unavailable`, error);
      status.textContent = label("PreviewUnavailable");
    }
  };
  const choose = (path) => {
    selected = path;
    if (previewedPath !== path) {
      previewedPath = path;
      void preview(path);
    }
    confirm.disabled = !selected;
    results.querySelectorAll("button[data-fx-path]").forEach((btn) => {
      const chosen = btn.dataset.fxPath === path;
      btn.classList.toggle("selected", chosen);
      btn.setAttribute("aria-selected", String(chosen));
    });
  };
  const render = () => {
    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    page = Math.min(Math.max(page, 1), totalPages);
    const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
    const frag = document.createDocumentFragment();
    for (const item of visible) {
      const button = document.createElement("button");
      button.type = "button";
      button.setAttribute("role", "option");
      button.dataset.fxPath = item.path;
      button.textContent = item.path;
      button.title = item.path;
      button.addEventListener("click", () => choose(item.path));
      frag.append(button);
    }
    results.replaceChildren(frag);
    results.scrollTop = 0;
    count.textContent = `${filtered.length} ${label("Results")}`;
    pageInput.value = String(page);
    pageInput.max = String(totalPages);
    pageCount.textContent = `/ ${totalPages}`;
    dlg.querySelector("[data-fx-first]").disabled = page <= 1;
    dlg.querySelector("[data-fx-previous]").disabled = page <= 1;
    dlg.querySelector("[data-fx-next]").disabled = page >= totalPages;
    dlg.querySelector("[data-fx-last]").disabled = page >= totalPages;
    if (visible.length) choose(visible.some((item) => item.path === selected) ? selected : visible[0].path);
    else {
      selected = "";
      previewedPath = "";
      confirm.disabled = true;
      ++previewRequest;
      stopMedia(); status.hidden = false; status.textContent = label("NoMatches"); pathLabel.textContent = "";
    }
  };
  const applyFilters = () => {
    page = 1;
    const facets = Object.fromEntries(JB2A_FACETS.map((facet) => [facet, filters[facet].value]));
    filtered = filterJB2AIndex(index, search.value, facets);
    render();
  };
  const goPage = (target) => {
    const candidate = Number(target);
    if (!Number.isInteger(candidate)) { pageInput.value = String(page); return; }
    page = Math.max(1, Math.min(Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)), candidate));
    render();
  };
  dlg.querySelector("[data-fx-first]").addEventListener("click", () => goPage(1));
  dlg.querySelector("[data-fx-previous]").addEventListener("click", () => goPage(page - 1));
  dlg.querySelector("[data-fx-next]").addEventListener("click", () => goPage(page + 1));
  dlg.querySelector("[data-fx-last]").addEventListener("click", () => goPage(Math.ceil(filtered.length / PAGE_SIZE)));
  dlg.querySelector("[data-fx-go]").addEventListener("click", () => goPage(pageInput.value));
  pageInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") { event.preventDefault(); goPage(pageInput.value); }
  });
  dlg.querySelector("[data-fx-close]").addEventListener("click", () => dlg.close());
  dlg.querySelector("[data-fx-cancel]").addEventListener("click", () => dlg.close());
  confirm.addEventListener("click", () => { if (selected) { onChoose(selected); dlg.close(); } });
  dlg.addEventListener("close", () => { ++previewRequest; stopMedia(); dlg.remove(); }, { once: true });
  search.addEventListener("input", applyFilters);
  JB2A_FACETS.forEach((facet) => filters[facet].addEventListener("change", applyFilters));
  search.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    if (!filtered.length) return;
    event.preventDefault();
    const position = Math.max(0, filtered.findIndex((item) => item.path === selected));
    const next = Math.max(0, Math.min(filtered.length - 1, position + (event.key === "ArrowDown" ? 1 : -1)));
    const nextPage = Math.floor(next / PAGE_SIZE) + 1;
    if (page !== nextPage) { page = nextPage; render(); }
    choose(filtered[next].path);
    results.querySelectorAll("button[data-fx-path]").forEach((btn) => {
      if (btn.dataset.fxPath === selected) btn.scrollIntoView({ block: "nearest" });
    });
  });
  video.addEventListener("error", () => { video.hidden = true; status.hidden = false; status.textContent = label("PreviewUnavailable"); });
  image.addEventListener("error", () => { image.hidden = true; status.hidden = false; status.textContent = label("PreviewUnavailable"); });
  render(); dlg.showModal(); search.focus();
}

export function wireFXConfig(container, tile, application) {
  const root = container.querySelector("[data-ctn-fx-config]");
  if (!root) return;
  const enabled = root.querySelector("[data-ctn-fx-enabled]");
  const enabledField = root.querySelector("[data-ctn-fx-enabled-value]");
  const body = root.querySelector("[data-ctn-fx-body]");
  const position = root.querySelector("[data-ctn-fx-position]");
  const lifetime = root.querySelector("[data-ctn-fx-lifetime]");
  const ending = root.querySelector("[data-ctn-fx-end-mode]");
  const refresh = () => {
    enabledField.value = enabled.checked ? "true" : "false";
    body.hidden = !enabled.checked;
    root.querySelector("[data-ctn-fx-other-row]").hidden = position.value !== "other";
    root.querySelector("[data-ctn-fx-custom-row]").hidden = position.value !== "custom";
    root.querySelector("[data-ctn-fx-seconds-row]").hidden = lifetime.value !== "seconds";
    root.querySelector("[data-ctn-fx-fadeout-row]").hidden = ending.value !== "fade";
  };
  enabled.addEventListener("change", () => {
    refresh(); enabledField.dispatchEvent(new Event("change", { bubbles: true }));
  });
  position.addEventListener("change", refresh);
  lifetime.addEventListener("change", refresh);
  ending.addEventListener("change", refresh);
  root.querySelector("[data-ctn-fx-browse]")?.addEventListener("click", () =>
    openEffectBrowser((value) => updateInput(root, "effect", value), liveConfig(tile, root).effect));
  root.querySelector("[data-ctn-fx-preview]")?.addEventListener("click", () => {
    const cfg = liveConfig(tile, root);
    if (!isSequencerAvailable()) { ui.notifications.warn(label("MissingSequencer")); return; }
    void playTileFX(tile, { event: cfg.event, preview: true, override: cfg });
  });
  root.querySelector("[data-ctn-fx-stop]")?.addEventListener("click", () => void stopTileFX(tile));
  root.querySelector("[data-ctn-fx-canvas]")?.addEventListener("click", async () => {
    const cfg = liveConfig(tile, root);
    if (canvas?.scene?.id !== tile.parent?.id) {
      ui.notifications.warn(label("OpenSceneFirst")); return;
    }
    await application.minimize?.();
    const started = editFXOnCanvas(tile, cfg, ({ x, y, width, height }) => {
      updateInput(root, "point.x", Math.round(x));
      updateInput(root, "point.y", Math.round(y));
      updateInput(root, "width", Math.round(width * 10) / 10);
      updateInput(root, "height", Math.round(height * 10) / 10);
      position.value = "custom";
      position.dispatchEvent(new Event("change", { bubbles: true }));
      void application.maximize?.();
    }, () => void application.maximize?.());
    if (!started) {
      void application.maximize?.();
      ui.notifications.warn(label("OpenSceneFirst"));
    } else ui.notifications.info(label("CanvasHint"));
  });
  refresh();
}
