import {Plugin, TAbstractFile} from 'obsidian';
import { CustomLeaf } from './types';
import { DEFAULT_SETTINGS, PersistentGraphSettings, PersistentGraphSettingTab } from './settings';
import { GraphManager } from './graphManager';
import {addGraphButtons, removeGraphButtons} from './ui';

export default class PersistentGraphPlugin extends Plugin {
	settings: PersistentGraphSettings;
	graphManager: GraphManager;

	onLayoutChange() {

		// Without this, opening obsidian with the plugin already enabled won't show the buttons
		const graphLeaves = this.app.workspace.getLeavesOfType('graph');
		graphLeaves.forEach(leaf => {
			addGraphButtons(leaf as CustomLeaf, this.graphManager, this);
			this.graphManager.pinManager.patchWorker(leaf as CustomLeaf);
		});

		// Restore every graph leaf, not just the one in the root split,
		// so that graphs docked in a sidebar are restored too
		graphLeaves.forEach(leaf => this.autoRestoreLeaf(leaf as CustomLeaf));
	}

	autoRestoreLeaf(leaf: CustomLeaf) {
		// Deferred (background) leaves have no renderer yet; they will be
		// picked up once they load and the layout changes again
		if (leaf.isDeferred || !leaf.view.renderer || leaf.view.renderer.autoRestored) {
			return;
		}

		leaf.view.renderer.autoRestored = true;

		// avoid rerender
		const { options } = this.graphManager.getGraphData();
		let initOptions = {};
		if (options && options.hasOwnProperty('search')) {
			initOptions = options;
		}
		leaf.view.dataEngine.setOptions({
			...initOptions,
			'collapse-filter': false,
		});

		// We can't restore node positions right away
		// because not all nodes have been created yet.
		// So we wait for the node count to stabilize
		// over 600s.
		setTimeout(() => this.graphManager.awaitRenderLoaded(leaf), 600);
	}

	async onload() {
		await this.loadSettings();
		this.graphManager = new GraphManager(this);

		// init
		const graphLeaves = this.app.workspace.getLeavesOfType('graph');
		graphLeaves.forEach(leaf => {
			addGraphButtons(leaf as CustomLeaf, this.graphManager, this);
			this.graphManager.pinManager.patchWorker(leaf as CustomLeaf);
		});


		//////////////////////////// Events

		// Node pinning
		this.registerEvent(
			this.app.workspace.on('file-menu', (menu, file) => {
				const leaf = this.graphManager.getActiveLeaf();
				if (!leaf) return;

				const nodeId = file.path;
				const isPinned = this.graphManager.pinManager.isPinned(nodeId);

				menu.addItem((item) => {
					item
						.setTitle(isPinned ? 'Unpin node' : 'Pin node')
						.setIcon(isPinned ? 'pin-off' : 'pin')
						.onClick(async () => {
							if (isPinned) {
								await this.graphManager.pinManager.unpinNode(nodeId, leaf);
							} else {
								await this.graphManager.pinManager.pinNode(nodeId, leaf);
							}
						});
				});
			})
		);

		// active-leaf-change works for the most part, but doesn't fire
		// when going from 'No file is open', so we have to use layout-change
		this.registerEvent(
			this.app.workspace.on('layout-change', this.onLayoutChange.bind(this))
		);

		// A deferred sidebar graph loads when its tab is first shown,
		// which makes it the active leaf
		this.registerEvent(
			this.app.workspace.on('active-leaf-change', (leaf) => {
				if (leaf?.view.getViewType() === 'graph') {
					this.autoRestoreLeaf(leaf as CustomLeaf);
				}
			})
		);

		this.registerEvent(
			this.app.metadataCache.on('resolved', this.graphManager.freedWorkspacesData.bind(this.graphManager))
		);

		// File/Folder renaming. This prevents node positions being lost when they (or their parent folder) are renamed.
		this.registerEvent(
			this.app.vault.on('rename', (file: TAbstractFile, oldPath: string) => {
				this.graphManager.handleRename(file, oldPath);
			})
		);

		if (this.settings.enableAutoSave) {
			this.graphManager.startAutoSave();
		}

		//////////////////////////// Commands

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
