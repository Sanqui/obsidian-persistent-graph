import {Plugin, TAbstractFile} from 'obsidian';
import { CustomLeaf } from './types';
import { DEFAULT_SETTINGS, PersistentGraphSettings, PersistentGraphSettingTab } from './settings';
import { GraphManager } from './GraphManager';
import {addGraphButtons, removeGraphButtons} from './ui';

export default class PersistentGraphPlugin extends Plugin {
	settings: PersistentGraphSettings;
	graphManager: GraphManager;

	onLayoutChange() {

		// Without this, opening obsidian with the plugin already enabled won't show the buttons
		const graphLeaves = this.app.workspace.getLeavesOfType('graph');
		graphLeaves.forEach(leaf => {
			addGraphButtons(leaf as CustomLeaf, this.graphManager, this);
		});

		const activeLeaf = this.graphManager.getActiveLeaf();
		if (!activeLeaf) return;

		if (activeLeaf.view.getViewType() != 'graph' || activeLeaf.view.renderer.autoRestored) {
			return;
		}

		activeLeaf.view.renderer.autoRestored = true;

		// avoid rerender
		const { options } = this.graphManager.getGraphData();
		let initOptions = {};
		if (options && options.hasOwnProperty('search')) {
			initOptions = options;
		}
		activeLeaf.view.dataEngine.setOptions({
			...initOptions,
			'collapse-filter': false,
		});

		// We can't restore node positions right away
		// because not all nodes have been created yet.
		// So we wait for the node count to stabilize
		// over 600s.
		setTimeout(() => this.graphManager.awaitRenderLoaded(activeLeaf), 600);
	}

	async onload() {
		await this.loadSettings();
		this.graphManager = new GraphManager(this);

		const graphLeaves = this.app.workspace.getLeavesOfType('graph');
		graphLeaves.forEach(leaf => {
			addGraphButtons(leaf as CustomLeaf, this.graphManager, this);
		});

		// Listener for file/folder renaming. This prevents node positions being lost when they (or their parent folder) are renamed.
		this.registerEvent(
			this.app.vault.on('rename', (file: TAbstractFile, oldPath: string) => {
				this.graphManager.handleRename(file, oldPath);
			})
		);

		if (this.settings.enableAutoSave) {
			this.graphManager.startAutoSave();
		}

		this.addCommand({
			id: 'save-node-positions',
			name: 'Save graph node positions',
			callback: async () => {
				this.graphManager.saveGraphData();
				await this.saveSettings();
			}
		});

		this.addCommand({
			id: 'restore-node-positions',
			name: 'Restore graph node positions',
			callback: () => {
				this.graphManager.restoreGraphData(this.graphManager.getGraphData());
			}
		});

		if (this.settings.enableGraphSimulationCommands) {
			this.addCommand({
				id: 'run-graph-simulation',
				name: 'Run graph simulation',
				callback: () => {
					this.graphManager.runGraphSimulation();
				}
			});

			this.addCommand({
				id: 'stop-graph-simulation',
				name: 'Stop graph simulation',
				callback: () => {
					this.graphManager.stopGraphSimulation();
				}
			});
		}

		this.addSettingTab(new PersistentGraphSettingTab(this.app, this));

		// active-leaf-change works for the most part, but doesn't fire
		// when going from 'No file is open', so we have to use layout-change
		this.registerEvent(
			this.app.workspace.on('layout-change', this.onLayoutChange.bind(this))
		);

		this.registerEvent(
			this.app.metadataCache.on('resolved', this.graphManager.freedWorkspacesData.bind(this.graphManager))
		);
	}

	onunload() {
		if (this.settings.enableAutoSave) {
			this.graphManager.stopAutoSave();
		}

		const graphLeaves = this.app.workspace.getLeavesOfType('graph');
		graphLeaves.forEach(leaf => {
			removeGraphButtons(leaf as CustomLeaf, this.graphManager, this);
		});
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<PersistentGraphSettings>);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
