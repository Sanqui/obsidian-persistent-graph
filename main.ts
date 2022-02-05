import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, WorkspaceLeaf } from 'obsidian';

interface PersistentGraphSettings {
	nodePositions: [];
	automaticallyRestoreNodePositions: boolean;
}

const DEFAULT_SETTINGS: PersistentGraphSettings = {
	nodePositions: [],
	automaticallyRestoreNodePositions: false
}

export default class PersistentGraphPlugin extends Plugin {
	settings: PersistentGraphSettings;

	findGraphLeaf() {
		let activeLeaf = this.app.workspace.activeLeaf;
		if (activeLeaf.view.getViewType() === "graph") {
			return activeLeaf;
		}

		let graphLeaves = this.app.workspace.getLeavesOfType("graph");
		if (graphLeaves.length != 1) {
			if (graphLeaves.length < 1) {
				new Notice('No graph view open');
			} else {
				new Notice('More than one graph view open, please choose an active one');
			}
			return;
		}
		return graphLeaves[0];
	}

	saveNodePositions() {
		let graphLeaf = this.findGraphLeaf();
		if (!graphLeaf) return;
		return graphLeaf.view.renderer.nodes.map((node) => {
			return {
				id: node.id,
				x: node.x,
				y: node.y
			};
		});
	}

	restoreNodePositions(nodePositions, graphLeaf?: WorkspaceLeaf) {
		if (graphLeaf === undefined) {
			graphLeaf = this.findGraphLeaf();
		}
		if (!graphLeaf) return;
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
		setTimeout(() => {
			nodePositions.forEach((node) => {
				if (!graphLeaf) return;
				graphLeaf.view.renderer.worker.postMessage({
					forceNode: {
						id: node.id,
						x: null,
						y: null
					}
				});
			});
		}, 1000);
	}

	runGraphSimlation() {
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
		const activeLeaf = this.app.workspace.activeLeaf;

		if (activeLeaf.view.getViewType() != "graph" || activeLeaf.view.renderer.autoRestored) {
			return;
		}
			
		activeLeaf.view.renderer.autoRestored = true;

		// We can't restore node positions right away
		// because not all nodes have been created yet.
		// So we wait for the node count to stabilize
		// over 600s.

		setTimeout(() => {
			this.restoreOnceNodeCountStable(activeLeaf, 0, 0, 0);
		}, 1000);
	}

	restoreOnceNodeCountStable(leaf: WorkspaceLeaf, nodeCount: number, iterations: number, totalIterations: number) {
		//console.log('restoreOnceNodeCountStable, nodeCount: ' + nodeCount + ', iterations: ' + iterations);
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
					this.restoreNodePositions(this.settings.nodePositions, leaf);
					new Notice('Automatically restored node positions');
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
				this.settings.nodePositions = this.saveNodePositions();
				await this.saveSettings();
			}
		});
		
		this.addCommand({
			id: 'restore-node-positions',
			name: 'Restore graph node positions',
			callback: () => {
				this.restoreNodePositions(this.settings.nodePositions);
			}
		});
		
		this.addCommand({
			id: 'run-graph-simulation',
			name: 'Run graph simulation',
			callback: () => {
				this.runGraphSimlation();
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
		// when going from "No file is open", so we have to use layout-change
		this.registerEvent(
			this.app.workspace.on('layout-change', this.onLayoutChange.bind(this))
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
		const {containerEl} = this;

		containerEl.empty();

		containerEl.createEl('h2', {text: 'Settings for PersistentGraphPlugin'});

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
}