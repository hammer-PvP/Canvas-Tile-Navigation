import { MODULE_ID } from "./constants.mjs";

const SOURCE_SETTING = "defaultAssetSource";
const FOLDER_SETTING = "defaultAssetFolder";

const escapeHTML = (value) => foundry.utils.escapeHTML(String(value ?? ""));

function PickerClass() {
  const Base = foundry?.applications?.apps?.FilePicker;
  return Base?.implementation ?? Base;
}

export function getDefaultAssetLocation() {
  return {
    source: String(game.settings.get(MODULE_ID, SOURCE_SETTING) || "data"),
    path: String(game.settings.get(MODULE_ID, FOLDER_SETTING) || "")
  };
}

async function usableDefaultAssetLocation() {
  const location = getDefaultAssetLocation();
  if (!location.path) return null;
  const Picker = PickerClass();
  try {
    await Picker?.browse?.(location.source, location.path);
    return location;
  } catch (_error) {
    return null;
  }
}

export async function openDefaultAssetImagePicker({ current = "", callback, field = null } = {}) {
  const Picker = PickerClass();
  if (!Picker) return null;
  const location = await usableDefaultAssetLocation();
  const options = {
    type: "image",
    callback,
    field
  };
  if (location) {
    options.activeSource = location.source;
    options.current = location.path;
  } else if (current) {
    options.current = current;
  }
  const picker = new Picker(options);
  void picker.render({ force: true });
  return picker;
}

export class AssetFolderSettingsApplication extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: "ctn-asset-folder-settings",
    classes: ["ctn-asset-folder-settings"],
    position: { width: 560 },
    window: {
      title: "CTN.AssetFolder.Title",
      icon: "fa-solid fa-folder-open",
      resizable: false
    }
  };

  async _renderHTML() {
    const { source, path } = getDefaultAssetLocation();
    const root = document.createElement("div");
    root.className = "ctn-asset-folder-settings__body";
    root.innerHTML = `
      <p class="hint">${escapeHTML(game.i18n.localize("CTN.AssetFolder.Hint"))}</p>
      <div class="form-group">
        <label>${escapeHTML(game.i18n.localize("CTN.AssetFolder.Source"))}</label>
        <div class="form-fields"><input type="text" value="${escapeHTML(source)}" readonly></div>
      </div>
      <div class="form-group">
        <label>${escapeHTML(game.i18n.localize("CTN.AssetFolder.Folder"))}</label>
        <div class="form-fields"><input type="text" value="${escapeHTML(path)}" readonly></div>
      </div>
      <div class="ctn-asset-folder-settings__actions">
        <button type="button" data-action="browse"><i class="fa-solid fa-folder-open"></i> ${escapeHTML(game.i18n.localize("CTN.AssetFolder.Browse"))}</button>
        <button type="button" data-action="clear"><i class="fa-solid fa-rotate-left"></i> ${escapeHTML(game.i18n.localize("CTN.AssetFolder.Clear"))}</button>
      </div>
    `;
    return root;
  }

  _replaceHTML(result, content) {
    content.replaceChildren(result);
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    this.element.querySelector('[data-action="browse"]')?.addEventListener("click", async () => {
      const Picker = PickerClass();
      if (!Picker) return;
      const current = getDefaultAssetLocation();
      let picker;
      picker = new Picker({
        type: "folder",
        current: current.path,
        activeSource: current.source,
        callback: async (path) => {
          await game.settings.set(MODULE_ID, SOURCE_SETTING, String(picker?.activeSource || current.source || "data"));
          await game.settings.set(MODULE_ID, FOLDER_SETTING, String(path || ""));
          await this.render({ force: true });
        }
      });
      void picker.render({ force: true });
    });

    this.element.querySelector('[data-action="clear"]')?.addEventListener("click", async () => {
      await game.settings.set(MODULE_ID, SOURCE_SETTING, "data");
      await game.settings.set(MODULE_ID, FOLDER_SETTING, "");
      await this.render({ force: true });
    });
  }
}
