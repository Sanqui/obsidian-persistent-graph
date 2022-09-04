import { App, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';
import { CustomLeaf, NodePosition, Workspaces, GraphData } from 'types';

interface PersistentGraphSettings {
	nodePositions: NodePosition[];
	globalOptions: any,
	workspacesGraphData: {
		[key: string]: GraphData;
	};
	automaticallyRestoreNodePositions: boolean;
	enableSaveOptions: boolean;
	enableWorkspaces: boolean;
	timesShowedRestoredNotification: number;
}

const DEFAULT_SETTINGS: PersistentGraphSettings = {
	nodePositions: [],
	globalOptions: {},
	workspacesGraphData: {},
	automaticallyRestoreNodePositions: false,
	enableSaveOptions: false,
	enableWorkspaces: false,
	timesShowedRestoredNotification: 0,
};

export default class PersistentGraphPlugin extends Plugin {
	settings: PersistentGraphSettings;

	findGraphLeaf(): CustomLeaf {
		let activeLeaf = this.app.workspace.activeLeaf;
		if (activeLeaf.view.getViewType() === 'graph') {
			return activeLeaf as CustomLeaf;
		}

		let graphLeaves = this.app.workspace.getLeavesOfType('graph');
		if (graphLeaves.length != 1) {
			if (graphLeaves.length < 1) {
				new Notice('No graph view open');
			} else {
				new Notice('More than one graph view open, please choose an active one');
			}
			return;
		}
		return graphLeaves[0] as CustomLeaf;
	}

	getActiveWorkspaceName() {
		if (!this.settings.enableWorkspaces) {
			return null;
		}
		const workspaces = (this.app as any).internalPlugins.getPluginById('workspaces') as Workspaces;

		return workspaces?.instance.activeWorkspace;
	}

	getGraphData(): GraphData {
		return this.settings.workspacesGraphData[this.getActiveWorkspaceName()] || {
			nodePositions: this.settings.nodePositions,
			options: {}
		};
	}

	saveGraphData() {
		let graphLeaf = this.findGraphLeaf();
		if (!graphLeaf) return;

		// disable workspaces wName = null
		const wName = this.getActiveWorkspaceName();
		const nodes = graphLeaf.view.renderer.nodes.map((node) => {
			return {
				id: node.id,
				x: node.x,
				y: node.y
			};
		});

		const options = !this.settings.enableSaveOptions ? {} : graphLeaf.view.dataEngine.getOptions();

		if (wName) {
			this.settings.workspacesGraphData[wName] = {
				options,
				nodePositions: nodes
			};
			return;
		}

		this.settings.nodePositions = nodes;
		this.settings.globalOptions = options;
	}

	restoreGraphData(saved: GraphData, graphLeaf?: CustomLeaf) {
		if (graphLeaf === undefined) {
			graphLeaf = this.findGraphLeaf();
		}
		if (!graphLeaf) return;

		const { nodePositions } = saved;
		nodePositions.forEach((node) => {
			graphLeaf.view.renderer.worker.postMessage({
				forceNode: node,
			});
		});

		// force a redraw
		graphLeaf.view.renderer.worker.postMessage({
			run: true,
			alpha: .1
		});

		// wait for a render, then unlock nodes
		setTimeout(async () => {
			for (let i = 0; i < nodePositions.length; i++) {
				const node = nodePositions[i];

				if (!graphLeaf) return;
				graphLeaf.view.renderer.worker.postMessage({
					forceNode: {
						id: node.id,
						x: null,
						y: null
					}
				});
			} // end for

			if (this.settings.timesShowedRestoredNotification < 5 ) {
				new Notice('Automatically restored node positions');
				this.settings.timesShowedRestoredNotification++;
				await this.saveSettings();
			}
		}, 600);
	}

	freedWorkspacesData() {
		if (!this.settings.enableWorkspaces) {
			return;
		}
		const workspaces = (this.app as any).internalPlugins.getPluginById('workspaces') as Workspaces;
		const workspacesNames = Object.keys(workspaces?.instance.workspaces || {});
		if (!workspacesNames) {
			return;
		}
		const saveNames = Object.keys(this.settings.workspacesGraphData);
		saveNames.forEach(name => {
			if (workspacesNames.includes(name)) {
				return;
			}

			delete this.settings.workspacesGraphData[name];
		});
		this.saveSettings();
	}

	runGraphSimulation() {
		let graphLeaf = this.findGraphLeaf();
		if (!graphLeaf) return;
		graphLeaf.view.renderer.worker.postMessage({
			run: true,
			alpha: 1,
			alphaTarget: 1
		});
	}

	stopGraphSimulation() {
		let graphLeaf = this.findGraphLeaf();
		if (!graphLeaf) return;
		graphLeaf.view.renderer.worker.postMessage({
			run: true,
			alpha: 0,
			alphaTarget: 0
		});
	}

	onLayoutChange() {
		const activeLeaf = this.app.workspace.activeLeaf as CustomLeaf;

		if (activeLeaf.view.getViewType() != 'graph' || activeLeaf.view.renderer.autoRestored) {
			return;
		}

		activeLeaf.view.renderer.autoRestored = true;


		// avoid rerender
		const { options } = this.getGraphData();
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
		setTimeout(() => this.awaitRenderLoaded(activeLeaf), 600);
	}

	awaitRenderLoaded(activeLeaf: CustomLeaf) {
		window.requestAnimationFrame(() => {
			// The graph adds className 'is-loading' to the element when rendering.
			if (activeLeaf.view.containerEl.querySelector('.mod-search-setting')?.classList?.contains('is-loading')) {
				this.awaitRenderLoaded(activeLeaf);
				return;
			}
			this.restoreOnceNodeCountStable(activeLeaf, 0, 0, 0);
		});
	}

	async restoreOnceNodeCountStable(leaf: CustomLeaf, nodeCount: number, iterations: number, totalIterations: number) {
		if (!leaf || !leaf.view || !leaf.view.renderer) {
			return;
		}
		// If we took too long, bail, we don't want to have this go forever
		if (totalIterations > 20) {
			return;
		}

		if (this.settings.automaticallyRestoreNodePositions) {
			const currentNodeCount = leaf.view.renderer.nodes.length;

			if (currentNodeCount === nodeCount) {
				if (iterations >= 3) {
					this.restoreGraphData(this.getGraphData(), leaf);
				} else {
					setTimeout(() => {
						this.restoreOnceNodeCountStable(leaf, currentNodeCount, iterations + 1, totalIterations + 1);
					}, 200);
				}
			} else {
				setTimeout(() => {
					this.restoreOnceNodeCountStable(leaf, currentNodeCount, 0, totalIterations + 1);
				}, 200);
			}
		}
	}

	async onload() {
		await this.loadSettings();

		this.addCommand({
			id: 'save-node-positions',
			name: 'Save graph node positions',
			callback: async () => {
				this.saveGraphData();
				await this.saveSettings();
			}
		});

		this.addCommand({
			id: 'restore-node-positions',
			name: 'Restore graph node positions',
			callback: () => {
				this.restoreGraphData(this.getGraphData());
			}
		});

		this.addCommand({
			id: 'run-graph-simulation',
			name: 'Run graph simulation',
			callback: () => {
				this.runGraphSimulation();
			}
		});

		this.addCommand({
			id: 'stop-graph-simulation',
			name: 'Stop graph simulation',
			callback: () => {
				this.stopGraphSimulation();
			}
		});

		this.addSettingTab(new PersistentGraphSettingTab(this.app, this));

		// active-leaf-change works for the most part, but doesn't fire
		// when going from 'No file is open', so we have to use layout-change
		this.registerEvent(
			this.app.workspace.on('layout-change', this.onLayoutChange.bind(this))
		);

		this.registerEvent(
			this.app.metadataCache.on('resolved', this.freedWorkspacesData.bind(this))
		);
	}

	onunload() {
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class PersistentGraphSettingTab extends PluginSettingTab {
	plugin: PersistentGraphPlugin;

	constructor(app: App, plugin: PersistentGraphPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		containerEl.createEl('h2', { text: 'Settings for PersistentGraphPlugin' });

		this.UIAutomaticallyRestoreNodePositions();
		this.UIEnableSaveOptions();
		this.UIEnableWorkspaces();
	}

	UIAutomaticallyRestoreNodePositions() {
		const { containerEl } = this;

		new Setting(containerEl)
			.setName('Automatically restore node positions')
			.setDesc('Restore node positions every time a graph view is opened')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.automaticallyRestoreNodePositions)
					.onChange((value) => {
						this.plugin.settings.automaticallyRestoreNodePositions = value;
						this.plugin.saveSettings();
					})
			);
	}

	UIEnableSaveOptions() {
		const { containerEl } = this;

		new Setting(containerEl)
			.setName('Save the filtered configuration')
			.setDesc('Filters, Groups, Display, Forces')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.enableSaveOptions)
					.onChange((value) => {
						this.plugin.settings.enableSaveOptions = value;
						this.plugin.saveSettings();
					})
			);
	}

	UIEnableWorkspaces() {
		const { containerEl } = this;
		// Save graph layout separately for each workspace
		new Setting(containerEl)
			.setName('Save graph layout separately for each workspace')
			.setDesc('Use workspace name as storage key')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.enableWorkspaces)
					.onChange((value) => {
						this.plugin.settings.enableWorkspaces = value;
						this.plugin.saveSettings();
					})
			);
	}


}
