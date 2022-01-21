import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';

// Remember to rename these classes and interfaces!

interface SaveRestoreGraphSettings {
	nodeCoordinates: [];
}

const DEFAULT_SETTINGS: SaveRestoreGraphSettings = {
	nodeCoordinates: []
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

	saveNodeCoordinates() {
		let graphLeaf = this.findGraphLeaf();
		return graphLeaf.view.renderer.nodes.map((node) => {
			return {
				id: node.id,
				x: node.x,
				y: node.y
			};
		});
	}

	restoreNodeCoordinates(nodeCoordinates) {
		let graphLeaf = this.findGraphLeaf();
		nodeCoordinates.forEach((node) => {
			graphLeaf.view.renderer.worker.postMessage({
				forceNode: node,
			});
		});
		
		// force a redraw
		graphLeaf.view.renderer.worker.postMessage({
			run: true,
			alpha: .3
		});
		
		// wait for a render, then unlock nodes
		setTimeout(() => {
			nodeCoordinates.forEach((node) => {
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

	async onload() {
		await this.loadSettings();

		this.addCommand({
			id: 'save-node-coordinates',
			name: 'Save graph node coordinates',
			callback: async () => {
				this.settings.nodeCoordinates = this.saveNodeCoordinates();
				await this.saveSettings();
			}
		});
		
		this.addCommand({
			id: 'restore-node-coordinates',
			name: 'Restore graph node coordinates',
			callback: () => {
				this.restoreNodeCoordinates(this.settings.nodeCoordinates);
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
