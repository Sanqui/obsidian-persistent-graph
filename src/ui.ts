import { setIcon } from 'obsidian';
import { CustomLeaf } from './types';
import { GraphManager } from './GraphManager';
import PersistentGraphPlugin from './main';

export function addGraphButtons(leaf: CustomLeaf, graphManager: GraphManager, plugin: PersistentGraphPlugin) {
	const container = leaf.view.containerEl;
	const viewActions = container.querySelector('.view-actions');
	if (!viewActions || viewActions.querySelector('.persistent-graph-save-btn')) return;

	const createBtn = (icon: string, label: string, onClick: () => void, className: string) => {
		const btn = document.createElement('div');
		btn.className = `clickable-icon view-action ${className}`;
		btn.setAttribute('aria-label', label);
		setIcon(btn, icon);
		btn.addEventListener('click', onClick);
		return btn;
	};

	const restoreBtn = createBtn('rotate-ccw', 'Restore graph positions', () =>
		graphManager.restoreGraphData(graphManager.getGraphData()), 'persistent-graph-restore-btn');
	const saveBtn = createBtn('save', 'Save graph positions', async () =>
		{ graphManager.saveGraphData(); await plugin.saveSettings(); }, 'persistent-graph-save-btn');

	viewActions.prepend(saveBtn, restoreBtn);
}
