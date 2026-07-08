'use strict';

// JARVIS Sync — Obsidian community plugin (Fase B).
// Syncs the vault's markdown to JARVIS Cloud: sends a hash manifest, then pushes
// only new/changed files; the server deletes what's no longer present.
// Plain CommonJS (no build step) — desktop only (uses Node's crypto).

const { Plugin, PluginSettingTab, Setting, Notice } = require('obsidian');
const { createHash } = require('crypto');

const DEFAULT_SETTINGS = {
  apiUrl: 'https://jarvis-api-9u1u.onrender.com',
  token: '',
  excludeFolders: '.obsidian, attachments, private, secrets',
  syncOnSave: false,
};

const PUSH_BATCH = 15;

module.exports = class JarvisSyncPlugin extends Plugin {
  async onload() {
    await this.loadSettings();
    this.addSettingTab(new JarvisSettingTab(this.app, this));

    this.addRibbonIcon('sync', 'Sincronizar con JARVIS', () => this.sync());
    this.addCommand({
      id: 'jarvis-sync-vault',
      name: 'Sincronizar vault con JARVIS',
      callback: () => this.sync(),
    });

    this._timer = null;
    if (this.settings.syncOnSave) {
      this.registerEvent(this.app.vault.on('modify', () => this.debouncedSync()));
    }
  }

  onunload() {
    if (this._timer) clearTimeout(this._timer);
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }

  debouncedSync() {
    if (this._timer) clearTimeout(this._timer);
    this._timer = setTimeout(() => this.sync(), 4000);
  }

  excluded(path) {
    const folders = (this.settings.excludeFolders || '')
      .split(',')
      .map((s) => s.trim().replace(/\/?$/, '/').toLowerCase())
      .filter(Boolean);
    const p = path.toLowerCase();
    return folders.some((f) => p.startsWith(f) || p.includes('/' + f));
  }

  async request(path, body) {
    const res = await fetch(`${this.settings.apiUrl.replace(/\/$/, '')}/api${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.settings.token}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw new Error(`${res.status} ${t}`);
    }
    return res.json();
  }

  async sync() {
    if (!this.settings.token) {
      new Notice('JARVIS: falta el token. Configuralo en Ajustes → JARVIS Sync.');
      return;
    }
    try {
      new Notice('JARVIS: sincronizando…');
      const files = this.app.vault
        .getMarkdownFiles()
        .filter((f) => !this.excluded(f.path));

      // Build manifest (path + sha256 of content).
      const contentByPath = {};
      const manifest = [];
      for (const f of files) {
        const content = await this.app.vault.read(f);
        contentByPath[f.path] = content;
        manifest.push({ path: f.path, hash: createHash('sha256').update(content).digest('hex') });
      }

      const { push, deleted } = await this.request('/knowledge/sync/manifest', {
        files: manifest,
        fullSync: true,
      });

      // Push new/changed files in batches.
      let pushed = 0;
      for (let i = 0; i < push.length; i += PUSH_BATCH) {
        const batch = push.slice(i, i + PUSH_BATCH).map((p) => ({ path: p, content: contentByPath[p] }));
        await this.request('/knowledge/sync/push', { files: batch });
        pushed += batch.length;
        new Notice(`JARVIS: ${pushed}/${push.length} archivos…`);
      }

      new Notice(`JARVIS ✓ ${pushed} actualizados, ${deleted.length} borrados, ${files.length} en total.`);
    } catch (err) {
      console.error('JARVIS sync', err);
      new Notice(`JARVIS: error al sincronizar — ${err.message || err}`);
    }
  }
};

class JarvisSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl('h2', { text: 'JARVIS Sync' });

    new Setting(containerEl)
      .setName('API URL')
      .setDesc('URL del backend de JARVIS.')
      .addText((t) =>
        t
          .setPlaceholder('https://jarvis-api-9u1u.onrender.com')
          .setValue(this.plugin.settings.apiUrl)
          .onChange(async (v) => {
            this.plugin.settings.apiUrl = v.trim();
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName('Token de API')
      .setDesc('Generá uno en JARVIS → Ajustes → Tokens (empieza con jrv_).')
      .addText((t) => {
        t.inputEl.type = 'password';
        t.setPlaceholder('jrv_…')
          .setValue(this.plugin.settings.token)
          .onChange(async (v) => {
            this.plugin.settings.token = v.trim();
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName('Carpetas excluidas')
      .setDesc('Separadas por coma. No se sincronizan.')
      .addText((t) =>
        t
          .setValue(this.plugin.settings.excludeFolders)
          .onChange(async (v) => {
            this.plugin.settings.excludeFolders = v;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName('Sincronizar al guardar')
      .setDesc('Sincroniza automáticamente unos segundos después de editar (recargá el plugin al cambiar esto).')
      .addToggle((t) =>
        t.setValue(this.plugin.settings.syncOnSave).onChange(async (v) => {
          this.plugin.settings.syncOnSave = v;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl).addButton((b) =>
      b.setButtonText('Sincronizar ahora').setCta().onClick(() => this.plugin.sync()),
    );
  }
}
