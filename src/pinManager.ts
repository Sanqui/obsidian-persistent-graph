import { CustomLeaf } from './types';
import PersistentGraphPlugin from './main';

export class PinManager {

	/// for O(1) lookups. Reminder to sync it.
	private _pinnedSet: Set<string>;

	constructor(private plugin: PersistentGraphPlugin) {
		if (!this.plugin.settings.pinnedNodes) {
			this.plugin.settings.pinnedNodes = [];
		}
		this._pinnedSet = new Set(this.plugin.settings.pinnedNodes)
	}

	isPinned(nodeId: string): boolean {
		return this._pinnedSet.has(nodeId);
	}

	async pinNode(nodeId: string, graphLeaf: CustomLeaf) {
		if (!this.plugin.settings.pinnedNodes) this.plugin.settings.pinnedNodes = [];

		if (!this.isPinned(nodeId)) {
			this.plugin.settings.pinnedNodes.push(nodeId);
			this._pinnedSet.add(nodeId);
			await this.plugin.saveSettings();
		}

		const node = graphLeaf.view.renderer.nodes.find((n: any) => n.id === nodeId);
		if (node) {
			graphLeaf.view.renderer.worker.postMessage({
				forceNode: { id: node.id, x: node.x, y: node.y }
			});
		}
	}

	async unpinNode(nodeId: string, graphLeaf: CustomLeaf) {
		if (!this.plugin.settings.pinnedNodes) return;

		if (this.isPinned(nodeId)) {
			this.plugin.settings.pinnedNodes = this.plugin.settings.pinnedNodes.filter(id => id !== nodeId);
			this._pinnedSet.delete(nodeId);
			await this.plugin.saveSettings();
		}

		graphLeaf.view.renderer.worker.postMessage({
			forceNode: { id: nodeId, x: null, y: null }
		});
	}

	// Dirty code that allows intercepting drag-and-release actions over a pinned node, preventing it from becoming unpinned.
	patchWorker(graphLeaf: CustomLeaf) {
		const worker = graphLeaf?.view?.renderer?.worker;
		if (!worker || (worker as any).__pinPatched) return;

		const originalPostMessage = worker.postMessage.bind(worker);

		worker.postMessage = (message: any) => {
			// Intercept release
			if (message?.forceNode?.x === null && message?.forceNode?.y === null) {
				if (this.isPinned(message.forceNode.id)) {
					// Re-pin it
					this.pinNode(message.forceNode.id, graphLeaf);
					return;
				}
			}
			originalPostMessage(message);
		};

		(worker as any).__pinPatched = true;
	}

	handleRename(newPath: string, oldPath: string): boolean {
		let changed = false;
		if (!this.plugin.settings.pinnedNodes) return false;

		this.plugin.settings.pinnedNodes = this.plugin.settings.pinnedNodes.map(pNode => {
			if (pNode === oldPath) {
				changed = true;
				return newPath;
			}
			if (pNode.startsWith(oldPath + '/')) {
				changed = true;
				return newPath + pNode.substring(oldPath.length);
			}
			return pNode;
		});

		if (changed) {
			this._pinnedSet = new Set(this.plugin.settings.pinnedNodes);
		}

		return changed;
	}
}
