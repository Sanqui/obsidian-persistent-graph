import { App, PluginSettingTab, requireApiVersion, Setting } from 'obsidian';
import type { SettingDefinitionItem } from 'obsidian';
import {GraphData, NodePosition} from "./types";
import PersistentGraphPlugin from "./main";

export interface PersistentGraphSettings {
	nodePositions: NodePosition[];
	pinnedNodes: string[];
	globalOptions: any;
	workspacesGraphData: {
		[key: string]: GraphData;
	};
	automaticallyRestoreNodePositions: boolean;
	enableSaveOptions: boolean;
	enableWorkspaces: boolean;
	timesShowedRestoredNotification: number;
	showSaveNotification: boolean;
	enableGraphSimulationCommands: boolean;
	enableAutoSave: boolean;
	autoSaveIntervalMinutes: number;
}

export const DEFAULT_SETTINGS: PersistentGraphSettings = {
	nodePositions: [],
	pinnedNodes: [],
	globalOptions: {},
	workspacesGraphData: {},
	automaticallyRestoreNodePositions: true,
	enableSaveOptions: false,
	enableWorkspaces: false,
	timesShowedRestoredNotification: 0,
	showSaveNotification: false,
	enableGraphSimulationCommands: false,
	enableAutoSave: false,
	autoSaveIntervalMinutes: 5,
};

export class PersistentGraphSettingTab extends PluginSettingTab {
	plugin: PersistentGraphPlugin;

	constructor(app: App, plugin: PersistentGraphPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	getSettingDefinitions(): SettingDefinitionItem<keyof PersistentGraphSettings>[] {
		if (!requireApiVersion('1.13.0')) {
			return [];
		}

		return [
			{
				name: 'Automatically restore node positions',
				desc: 'Restore node positions every time a graph view is opened',
				control: { type: 'toggle', key: 'automaticallyRestoreNodePositions' },
			},
			{
				name: 'Save the filtered configuration',
				desc: 'Filters, Groups, Display, Forces',
				control: { type: 'toggle', key: 'enableSaveOptions' },
			},
			{
				name: 'Save graph layout separately for each workspace',
				desc: 'Use workspace name as storage key',
				control: { type: 'toggle', key: 'enableWorkspaces' },
			},
			{
				name: 'Show notification on save',
				desc: 'Display a notice when saving the graph',
				control: { type: 'toggle', key: 'showSaveNotification' },
			},
			{
				name: 'Enable Auto Save',
				desc: 'Automatically save graph changes',
				render: (setting) => {
					setting.addToggle((toggle) =>
						toggle
							.setValue(this.plugin.settings.enableAutoSave)
							.onChange(async (value) => {
								this.plugin.settings.enableAutoSave = value;
								await this.plugin.saveSettings();
								if (value) {
									this.plugin.graphManager.startAutoSave();
								} else {
									this.plugin.graphManager.stopAutoSave();
								}
								this.update();
							})
					);
				},
			},
			{
				name: 'Auto Save Interval',
				desc: 'Interval in minutes to auto save the graph',
				visible: () => this.plugin.settings.enableAutoSave,
				render: (setting) => {
					setting.addSlider((slider) =>
						slider
							.setLimits(1, 60, 1)
							.setValue(this.plugin.settings.autoSaveIntervalMinutes)
							.setDynamicTooltip()
							.onChange(async (value) => {
								this.plugin.settings.autoSaveIntervalMinutes = value;
								await this.plugin.saveSettings();
								if (this.plugin.settings.enableAutoSave) {
									this.plugin.graphManager.startAutoSave();
								}
							})
					);
				},
			},
			{
				name: 'Enable graph simulation commands',
				desc: 'Controls whether "Run graph simulation" and "Stop graph simulation" commands are available.\n Requires restart.',
				control: { type: 'toggle', key: 'enableGraphSimulationCommands' },
			},
		];
	}

	async setControlValue(key: string, value: unknown): Promise<void> {
		if (!(key in this.plugin.settings)) {
			return;
		}

		Reflect.set(this.plugin.settings, key, value);
		await this.plugin.saveSettings();

		if (key === 'enableAutoSave') {
			if (value) {
				this.plugin.graphManager.startAutoSave();
			} else {
				this.plugin.graphManager.stopAutoSave();
			}
			this.update();
		} else if (key === 'autoSaveIntervalMinutes' && this.plugin.settings.enableAutoSave) {
			this.plugin.graphManager.startAutoSave();
		}
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		containerEl.createEl('h2', { text: 'Settings for PersistentGraphPlugin' });

		this.UIAutomaticallyRestoreNodePositions();
		this.UIEnableSaveOptions();
		this.UIEnableWorkspaces();
		this.UIShowSaveNotification();
		this.UIEnableAutoSave();
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

	UIEnableAutoSave() {
		const { containerEl } = this;

		new Setting(containerEl)
			.setName('Enable Auto Save')
			.setDesc('Automatically save graph changes')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.enableAutoSave)
					.onChange((value) => {
						this.plugin.settings.enableAutoSave = value;
						this.plugin.saveSettings();
						if (value) {
							this.plugin.graphManager.startAutoSave();
						} else {
							this.plugin.graphManager.stopAutoSave();
						}
						this.display();
					})
			);

		if (this.plugin.settings.enableAutoSave) {
			new Setting(containerEl)
				.setName('Auto Save Interval')
				.setDesc('Interval in minutes to auto save the graph')
				.addSlider((slider) =>
					slider
						.setLimits(1, 60, 1)
						.setValue(this.plugin.settings.autoSaveIntervalMinutes)
						.setDynamicTooltip()
						.onChange((value) => {
							this.plugin.settings.autoSaveIntervalMinutes = value;
							this.plugin.saveSettings();
							if (this.plugin.settings.enableAutoSave) {
								this.plugin.graphManager.startAutoSave();
							}
						})
				);
		}
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
