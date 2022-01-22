import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';

interface SaveRestoreGraphSettings {
	nodePositions: [];
}

const DEFAULT_SETTINGS: SaveRestoreGraphSettings = {
	nodePositions: []
}

export default class MyPlugin extends Plugin {
	settings: SaveRestoreGraphSettings;

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

	restoreNodePositions(nodePositions) {
		let graphLeaf = this.findGraphLeaf();
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
			id: 'start-jiggling-graph',
			name: 'Run graph simulation',
			callback: () => {
				this.runGraphSimlation();
			}
		});
		
		this.addCommand({
			id: 'stop-jiggling-graph',
			name: 'Stop graph simulation',
			callback: () => {
				this.stopGraphSimulation();
			}
		});
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
