import { App, PluginSettingTab, Setting } from 'obsidian';
import {GraphData, NodePosition} from "./types";
import PersistentGraphPlugin from "./main";

export interface PersistentGraphSettings {
	nodePositions: NodePosition[];
	globalOptions: any,
	workspacesGraphData: {
		[key: string]: GraphData;
	};
	automaticallyRestoreNodePositions: boolean;
	enableSaveOptions: boolean;
	enableWorkspaces: boolean;
	timesShowedRestoredNotification: number;
	showSaveNotification: boolean;
	enableGraphSimulationCommands: boolean;
}

export const DEFAULT_SETTINGS: PersistentGraphSettings = {
	nodePositions: [],
	globalOptions: {},
	workspacesGraphData: {},
	automaticallyRestoreNodePositions: false,
	enableSaveOptions: false,
	enableWorkspaces: false,
	timesShowedRestoredNotification: 0,
	showSaveNotification: false,
	enableGraphSimulationCommands: false,
};

export class PersistentGraphSettingTab extends PluginSettingTab {
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
		this.UIShowSaveNotification();
		this.UIEnableGraphSimulationCommands();
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

	UIShowSaveNotification() {
		const { containerEl } = this;

		new Setting(containerEl)
			.setName('Show notification on save')
			.setDesc('Display a notice when saving the graph')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showSaveNotification)
					.onChange((value) => {
						this.plugin.settings.showSaveNotification = value;
						this.plugin.saveSettings();
					})
			);
	}

	UIEnableGraphSimulationCommands() {
		const { containerEl } = this;

		new Setting(containerEl)
			.setName('Enable graph simulation commands')
			.setDesc('Controls whether "Run graph simulation" and "Stop graph simulation" commands are available.\n ' +
				     'Requires restart.')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.enableGraphSimulationCommands)
					.onChange((value) => {
						this.plugin.settings.enableGraphSimulationCommands = value;
						this.plugin.saveSettings();
					})
			);
	}

}
