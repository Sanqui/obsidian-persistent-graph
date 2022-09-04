import { WorkspaceLeaf } from "obsidian";

export interface NodePosition {
	id: string;
	x: number,
	y: number;
}

export interface GraphData {
	options: any;
	nodePositions: NodePosition[];
}


export interface GraphLeaf {
	view: {
		renderer: {
			idleFrames: number;
			/** Graph View requestAnimationFrame timer */
			renderTimer: number;
			nodes: NodePosition[],
			worker: Worker,
			autoRestored: boolean;
		};
		dataEngine: {
			controlsEl: HTMLDivElement,
			getOptions(): any,
			setOptions(options: any): void
		}
	};
}

export type CustomLeaf = WorkspaceLeaf & GraphLeaf;

export interface WorkspacesInstance {
	activeWorkspace: string;
	workspaces: {
		[activeWorkspace: string]: any;
	};
}

export interface Workspaces {
	instance: WorkspacesInstance;
}
