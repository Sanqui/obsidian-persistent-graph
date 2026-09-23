import {Notice, TAbstractFile} from 'obsidian';
import { CustomLeaf, Workspaces, GraphData } from './types';
import PersistentGraphPlugin from './main';
import {PinManager} from "./pinManager";

export class GraphManager {
	private autoSaveInterval: number | null = null;
	public pinManager: PinManager;

	constructor(private plugin: PersistentGraphPlugin) {
		this.pinManager = new PinManager(plugin);
	}

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

		const { nodePositions } = saved;

		if (!this.settings.enableRestoreAnimation || this.settings.restoreAnimationDuration <= 0) {
			// set nodes immediately
			nodePositions.forEach((node) => {
				graphLeaf!.view.renderer.worker.postMessage({
					forceNode: node,
				});
			});

			// wait for a render, then unlock nodes
			setTimeout(() => {
				this.finishRestoringGraphData(nodePositions, graphLeaf);
			}, 600);
		} else {
			const baseDuration = this.settings.restoreAnimationDuration;
			const startTime = Date.now();
			const globalDelay = 100;

			const currentNodes = graphLeaf.view.renderer.nodes;
			const currentPositions = new Map();
			currentNodes.forEach((node: any) => {
				currentPositions.set(node.id, { x: node.x, y: node.y });
			});

			const animations = nodePositions.map(targetNode => {
				const start = currentPositions.get(targetNode.id);
				const parts = targetNode.id.split('/');
				
				let folder = 'root';
				if (parts.length > 1) {
					folder = parts.slice(0, -1).join('/');
				}

				const startX = start && typeof start.x === 'number' ? start.x : targetNode.x;
				const startY = start && typeof start.y === 'number' ? start.y : targetNode.y;
				const targetX = targetNode.x;
				const targetY = targetNode.y;
				
				// 計算該節點需要移動的直線距離
				const distance = Math.sqrt(Math.pow(targetX - startX, 2) + Math.pow(targetY - startY, 2));

				return {
					id: targetNode.id,
					startX,
					startY,
					targetX,
					targetY,
					distance,
					folder,
					delay: 0,
					duration: baseDuration,
					initialSent: false
				};
			});

			// 找出整張圖表移動最遠的距離，用來換算流暢移動的基準
			const maxDistance = Math.max(...animations.map(a => a.distance), 1); 
			
			animations.forEach(anim => {
				const distanceRatio = anim.distance / maxDistance;
				// [滑順改善] 提高最低門檻至 350ms，且混合距離權重 (0.35 + 0.65 * ratio)
				// 避免近距離節點在 150ms 內暴衝抽搐，給予充裕時間進行優雅的漸進滑行
				anim.duration = Math.max(350, baseDuration * (0.35 + 0.65 * distanceRatio));
			});

			// 將資料夾按字母排序，讓動畫有規律的波浪感
			const uniqueFolders = Array.from(new Set(animations.map(a => a.folder))).sort();
			const folderDelays = new Map<string, number>();
			uniqueFolders.forEach((folder, index) => {
				folderDelays.set(folder, index * 70); 
			});

			animations.forEach(anim => {
				// [滑順改善] 移除隨機抖動，回歸純淨整齊的波浪節奏，避免鄰近節點視覺雜亂
				anim.delay = folderDelays.get(anim.folder)!;
			});

			// 柔和磁吸回彈係數：c1 = 0.6 產生約 1.5% 的微幅越界，如同高級氣壓懸吊般自然沉降
			const c1 = 0.6;
			const c3 = c1 + 1;

			const animate = () => {
				const now = Date.now();
				let allDone = true;

				animations.forEach(anim => {
					const elapsed = now - (startTime + globalDelay + anim.delay);
					if (elapsed < 0) {
						// 等待中的節點只在第一次發送初始定位
						if (!anim.initialSent) {
							graphLeaf!.view.renderer.worker.postMessage({
								forceNode: { id: anim.id, x: anim.startX, y: anim.startY }
							});
							anim.initialSent = true;
						}
						allDone = false;
						return;
					}
					
					// 使用該節點的專屬動畫時長
					const progress = Math.min(elapsed / anim.duration, 1);
					
					// [滑順改善] 單一平滑減速曲線 (Soft back.out 0.6)
					// 完全去除 elastic.out 多重高頻振盪造成的抽動與粗暴感
					const easeProgress = progress === 1 ? 1 :
						1 + c3 * Math.pow(progress - 1, 3) + c1 * Math.pow(progress - 1, 2);
					
					const currentX = anim.startX + (anim.targetX - anim.startX) * easeProgress;
					const currentY = anim.startY + (anim.targetY - anim.startY) * easeProgress;
					
					graphLeaf!.view.renderer.worker.postMessage({
						forceNode: {
							id: anim.id,
							x: currentX,
							y: currentY
						}
					});
					
					if (progress < 1) {
						allDone = false;
					}
				});

				if (!allDone) {
					window.requestAnimationFrame(animate);
				} else {
					// wait a bit for render, then unlock nodes
					setTimeout(() => {
						this.finishRestoringGraphData(nodePositions, graphLeaf);
					}, 16);
				}
			};

			window.requestAnimationFrame(animate);
		}
	}

	private async finishRestoringGraphData(nodePositions: any[], graphLeaf?: CustomLeaf) {
		for (let i = 0; i < nodePositions.length; i++) {
			const node = nodePositions[i];

			if (!graphLeaf) return;

			if (!this.pinManager.isPinned(node.id)) {
				graphLeaf.view.renderer.worker.postMessage({
					forceNode: {
						id: node.id,
						x: null,
						y: null
					}
				});
			}
		} // end for

		if (this.settings.timesShowedRestoredNotification < 5 ) {
			new Notice('Automatically restored node positions');
			this.settings.timesShowedRestoredNotification++;
			await this.plugin.saveSettings();
		}
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

		//"pinnedNodes": [
		//     "Home/Languages/Languages.md",
		//     "create a link.md",
		//     "Home/Languages/Chinese/HSK1/Presenting myself.md",
		//     "Home/Languages/Chinese/HSK1/HSK1.md",
		//     "Home/Languages/Chinese/Chinese.md"
		//   ],
		if (this.pinManager.handleRename(file.path, oldPath)) changed = true;

		if (changed) {
			this.plugin.saveSettings();
		}
	}
}
