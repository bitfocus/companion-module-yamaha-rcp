import { combineRgb } from '@companion-module/base'
import type { CompanionPresetGroup, CompanionPresetSection, SomeButtonGraphicsElement } from '@companion-module/base'

import type { RcpCommand, YamahaInstance, YamahaInstanceTypes, YamahaPresetDefinition } from './types.js'

export function createPresets(instance: YamahaInstance): void {
	const meterCmds = globalThis.rcpCommands
		.filter((c: RcpCommand) => c.Action == 'mtrinfo')
		.sort((a: RcpCommand, b: RcpCommand) => (a.Index == b.Index ? 0 : a.Index > b.Index ? 1 : -1))
	instance.rcpPresets = {}
	const presetGroups: CompanionPresetGroup<YamahaInstanceTypes>[] = []
	const presetStructure: CompanionPresetSection<YamahaInstanceTypes>[] = [
		{
			id: 'level-meters',
			name: 'Level Meters',
			definitions: presetGroups,
		},
	]
	const meterPreset: YamahaPresetDefinition = {
		type: 'layered',
		name: '',
		elements: [],
		steps: [],
		feedbacks: [],
		localVariables: [],
	}

	for (const c of meterCmds) {
		const curPreset: YamahaPresetDefinition = structuredClone(meterPreset)
		const addrParts = c.Address.split('/')
		let cmdName = addrParts.length > 1 ? addrParts[2] : ''
		const pickoffIndex = c.Index < 2100 ? 1 : c.Y
		if (c.Pickoff) {
			cmdName = addrParts.length > 0 ? addrParts[addrParts.length - 1] : ''
		}
		if (cmdName) {
			const isIoInput = /^IO:.*\/Meter\/InCh(?:\/|$)/.test(c.Address)
			const isSelectableMono = isIoInput || cmdName == 'InCh' || cmdName == 'Mix' || cmdName == 'Mtrx'
			const isStereoPair = cmdName == 'StInCh' || cmdName == 'FxRtnCh'
			const isSelectableStereo = isStereoPair || (cmdName == 'St' && c.X > 2)
			const isStereo = cmdName == 'St' || isStereoPair
			const hasChannelName = !isIoInput && (isSelectableMono || isSelectableStereo || cmdName == 'St')
			const presetDisplayName =
				isIoInput || cmdName == 'InCh'
					? 'Input Channel'
					: cmdName == 'StInCh'
						? 'Stereo Input Channel'
						: cmdName == 'FxRtnCh'
							? 'FX Return'
							: cmdName == 'Mix'
								? 'Mix'
								: cmdName == 'Mtrx'
									? 'Matrix'
									: cmdName == 'St'
										? 'Stereo'
										: cmdName
			const valueFeedbackId = `${c.Address.replace(/:/g, '_')}_Value`
			const localValueName = 'meter_value_1'
			const localValueName2 = 'meter_value_2'
			const labelAddress = c.Address.replace(`/Meter/${cmdName}`, `/${cmdName}/Label/Name`)
			const labelFeedbackId = `${labelAddress.replace(/:/g, '_')}_Value`

			curPreset.name = `Meter - ${presetDisplayName}`
			curPreset.keywords = ['meter', 'level', cmdName]
			curPreset.elements.push({
				type: 'text',
				id: 'label',
				x: 0,
				y: 0,
				width: 72,
				height: 100,
				text: hasChannelName ? '$(local:Name)' : `${presetDisplayName}\\nMeter`,
				fontsize: hasChannelName ? 100 : 18,
				fontsizeAllowShrink: true,
				color: combineRgb(255, 255, 255),
				halign: 'center',
				valign: 'center',
			})

			const addLocalMeter = (variableName: string, x: number | string, y: number | string) => {
				curPreset.localVariables.push({
					variableType: 'feedback',
					variableName,
					feedbackId: valueFeedbackId,
					options: { X: typeof x == 'string' ? { isExpression: true, value: x } : x, Y: y },
				})
			}
			const addSimpleLocal = (variableName: string, startupValue: number, headline: string) => {
				curPreset.localVariables.push({ variableType: 'simple', variableName, startupValue, headline })
			}
			const addNameLocal = (x: string) => {
				curPreset.localVariables.push({
					variableType: 'feedback',
					variableName: 'Name',
					feedbackId: labelFeedbackId,
					options: { X: { isExpression: true, value: x } },
				})
			}
			const addGauge = (id: string, name: string, x: number, width: number, value: string, clip = false) => {
				const gauge: SomeButtonGraphicsElement = {
					type: 'gauge',
					name,
					id,
					opacity: 100,
					x,
					y: 10,
					width,
					height: 80,
					value: { isExpression: true, value },
					min: clip ? -1 : -60,
					max: clip ? 0 : 1,
					origin: clip ? -1 : -60,
					orientation: 'vertical',
					roundedEnds: false,
					fillEnabled: true,
					fillWidth: 100,
					multiColour: !clip,
					stops: clip
						? [{ value: 0, color: combineRgb(255, 0, 0), gradient: false }]
						: [
								{ value: -60, color: combineRgb(0, 255, 0), gradient: false },
								{ value: id == 'meter-2' ? -18 : -19, color: combineRgb(255, 165, 0), gradient: false },
								{ value: 0, color: combineRgb(255, 0, 0), gradient: false },
							],
					trackAmount: clip ? 0 : 35,
				}
				curPreset.elements.push(gauge)
			}

			if (isStereo) {
				const channel1 = isSelectableStereo ? '$(local:Channel) * 2 - 1' : 1
				const channel2 = isSelectableStereo ? '$(local:Channel) * 2' : 2
				if (isSelectableStereo) {
					addSimpleLocal('Channel', 1, `Choose the ${presetDisplayName.toLowerCase()} pair to show.`)
				}
				addLocalMeter(localValueName, channel1, pickoffIndex)
				addLocalMeter(localValueName2, channel2, pickoffIndex)
				if (hasChannelName) addNameLocal(isSelectableStereo ? '$(local:Channel) * 2 - 1' : '1')
				addGauge('meter-1', 'Level1', 80, 5, `$(local:${localValueName})`)
				addGauge('meter-2', 'Level2', 90, 5, `$(local:${localValueName2})`)
				addGauge('clip-1', 'Clip', 80, 5, `$(local:${localValueName})`, true)
			} else {
				const channel = isSelectableMono ? '$(local:Channel)' : 1
				if (isSelectableMono) {
					addSimpleLocal('Channel', 1, `Choose the ${presetDisplayName.toLowerCase()} to show.`)
					if (hasChannelName) addNameLocal('$(local:Channel)')
				}
				addLocalMeter(localValueName, channel, pickoffIndex)
				addGauge('meter-1', 'Level', 80, 10, `$(local:${localValueName})`)
				addGauge('clip-1', 'Clip', 80, 10, `$(local:${localValueName})`, true)
			}
			const presetId = `meter-${c.Address.replace(/[^a-zA-Z0-9_-]/g, '_')}-${pickoffIndex}`
			instance.rcpPresets[presetId] = curPreset

			const group: CompanionPresetGroup<YamahaInstanceTypes> = isSelectableMono
				? {
						id: `${presetId}-group`,
						type: 'template',
						name: curPreset.name,
						presetId,
						templateVariableName: 'Channel',
						templateValues: [{ name: `${presetDisplayName} 1`, value: 1 }],
					}
				: isSelectableStereo
					? {
							id: `${presetId}-group`,
							type: 'template',
							name: curPreset.name,
							presetId,
							templateVariableName: 'Channel',
							templateValues: Array.from({ length: Math.floor(c.X / 2) }, (_, index) => ({
								name: `${presetDisplayName} ${index * 2 + 1}/${index * 2 + 2}`,
								value: index + 1,
							})),
						}
					: {
							id: `${presetId}-group`,
							type: 'simple',
							name: curPreset.name,
							presets: [presetId],
						}
			presetGroups.push(group)
		}
	}

	instance.setPresetDefinitions(presetStructure, instance.rcpPresets)
}
