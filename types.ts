import { WorkspaceLeaf } from "obsidian";

export interface LeafNode {
	id: string
	x: number,
	y: number
}

export interface GraphLeaf {
	view: {
		renderer: {
			nodes: LeafNode[],
			worker: Worker,
			autoRestored: boolean
		};
	}
}

export type CustomLeaf = WorkspaceLeaf  & GraphLeaf

export interface WorkspacesInstance {
	activeWorkspace: string;
	workspaces: {
		[activeWorkspace: string]: any
	}
}

export interface Workspaces {
	instance: WorkspacesInstance
}
