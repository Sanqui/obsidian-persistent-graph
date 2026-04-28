import {Notice, TAbstractFile} from 'obsidian';
import { CustomLeaf, Workspaces, GraphData } from './types';
import PersistentGraphPlugin from './main';

export class GraphManager {
	private autoSaveInterval: number | null = null;

	constructor(private plugin: PersistentGraphPlugin) {}

	private get app() {
		return this.plugin.app;
	}

	private get settings() {
		return this.plugin.settings;
	}

	/**
	 * Helper. Gets the most recently used leaf.
	 * @returns The active graph leaf, null otherwise.
	 */
	getActiveLeaf(): CustomLeaf | null {
		const leaf = this.app.workspace.getMostRecentLeaf();
		return leaf?.view.getViewType() === 'graph' ? leaf as CustomLeaf : null;
	}

	findGraphLeaf(): CustomLeaf | undefined {
		const activeLeaf = this.getActiveLeaf();
		if (activeLeaf) return activeLeaf;

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
		const workspaceName = this.getActiveWorkspaceName();
		if (workspaceName && this.settings.workspacesGraphData[workspaceName]) {
			return this.settings.workspacesGraphData[workspaceName];
		}
		return {
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

		if (this.settings.showSaveNotification) {
			new Notice('Graph data saved successfully!');
		}
	}

	restoreGraphData(saved: GraphData, graphLeaf?: CustomLeaf) {
		if (graphLeaf === undefined) {
			graphLeaf = this.findGraphLeaf();
		}
		if (!graphLeaf) return;

		// set nodes
		const { nodePositions } = saved;
		nodePositions.forEach((node) => {
			graphLeaf!.view.renderer.worker.postMessage({
				forceNode: node,
			});
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
				await this.plugin.saveSettings();
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
		this.plugin.saveSettings();
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

	startAutoSave() {
		// avoid overlapping
		this.stopAutoSave();

		this.autoSaveInterval = window.setInterval(async () => {
			this.saveGraphData();
			await this.plugin.saveSettings();
		}, (this.settings.autoSaveIntervalMinutes || 5) * 60000);
	}

	stopAutoSave() {
		if (this.autoSaveInterval !== null) {
			window.clearInterval(this.autoSaveInterval);
			this.autoSaveInterval = null;
		}
	}

	// O(n)
	// Updates ALL node ids when a folder/file is renamed, preventing their position from being lost.
	// This might be taxing for bigger graphs but it's the only solution I can think of.
	handleRename(file: TAbstractFile, oldPath: string) {
		let changed = false;

		// {
		//       "id": "Home/Books/Clean Code.md",
		//       "x": 399.21533203125,
		//       "y": 650.1447143554688
		//     },
		const updateNodeIds = (nodes: any[]) => {
			nodes.forEach(node => {
				if (node.id === oldPath) { // Exact match
					node.id = file.path;
					changed = true;
				}
				else if (node.id.startsWith(oldPath + '/')) { // Prefix
					node.id = file.path + node.id.substring(oldPath.length);
					changed = true;
				}
			});
		};

		// Update global
		if (this.settings.nodePositions) {
			updateNodeIds(this.settings.nodePositions);
		}

		// Update workspaces.
		if (this.settings.workspacesGraphData) {
			Object.values(this.settings.workspacesGraphData).forEach(data => {
				if (data.nodePositions) {
					updateNodeIds(data.nodePositions);
				}
			});
		}

		if (changed) {
			this.plugin.saveSettings();
		}
	}
}
