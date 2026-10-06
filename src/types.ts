import type {
	CompanionActionDefinition,
	CompanionActionDefinitionCallbackWithoutResult,
	CompanionActionDefinitionSubscribeHooks,
	CompanionActionSchemaWithoutResult,
	CompanionFeedbackDefinition,
	CompanionFeedbackSchema,
	CompanionLayeredButtonPresetDefinition,
	CompanionOptionValues,
	CompanionPresetDefinitions,
	CompanionVariableValues,
	InstanceBase,
	InstanceTypes,
	JsonObject,
} from '@companion-module/base'

import type { CompanionRecordedAction } from '@companion-module/base'

export type ConsoleModel = 'CL/QL' | 'PM' | 'TF' | 'DM3' | 'DM7' | 'RIO' | 'TIO' | 'RSIO'

export type YamahaConfig = JsonObject & {
	model?: ConsoleModel
	bonjour_host?: string
	host?: string
	metering?: boolean
	meterSpeed?: number
	keepAlive?: boolean
}

export type YamahaVariableValues = CompanionVariableValues
export type YamahaActionOptions = CompanionOptionValues & {
	X?: string | number
	Y?: string | number
	Val?: string | number
	Rel?: boolean
	createVariable?: boolean
	position?: string
	padding?: number
	meterVal1?: string
	meterVal2?: string
}

export type YamahaInstanceTypes = Omit<InstanceTypes, 'config' | 'actions' | 'feedbacks' | 'variables'> & {
	config: YamahaConfig
	actions: Record<string, CompanionActionSchemaWithoutResult<YamahaActionOptions>>
	feedbacks: Record<string, CompanionFeedbackSchema<YamahaActionOptions>>
	variables: YamahaVariableValues
}

export type YamahaActionDefinition = CompanionActionDefinition<CompanionActionSchemaWithoutResult<YamahaActionOptions>>
export type YamahaInputField = {
	type: string
	id: string
	label: string
	default?: string | number | boolean
	choices?: Array<{ id: string | number; label: string }>
	useVariables?: boolean | { local: boolean }
	[key: string]: unknown
}
export type YamahaActionDefinitionDraft = {
	name: string
	options: YamahaInputField[]
	callback?: CompanionActionDefinitionCallbackWithoutResult<YamahaActionOptions>['callback']
	optionsToMonitorForSubscribe?: string[]
	subscribe?: CompanionActionDefinitionSubscribeHooks<YamahaActionOptions>['subscribe']
}
export type YamahaActionDefinitions = Record<string, YamahaActionDefinition>
export type YamahaFeedbackDefinition = CompanionFeedbackDefinition<CompanionFeedbackSchema<YamahaActionOptions>>
export type YamahaFeedbackDefinitions = Record<string, YamahaFeedbackDefinition>
export type YamahaPresetDefinition = CompanionLayeredButtonPresetDefinition<YamahaInstanceTypes>
export type YamahaPresetDefinitions = CompanionPresetDefinitions<YamahaInstanceTypes>
export type YamahaRecordedAction = CompanionRecordedAction

export interface RcpCommand {
	Ok?: string
	Action: string
	Index: number
	Address: string
	X: number
	Y: number
	Min: number
	Max: number
	Default: string | number
	Unit: string
	Type: string
	UI: string
	RW: string
	Scale: number
	Pickoff?: string
	[key: string]: string | number | undefined
}

export interface RcpMessage {
	Status?: string
	Action: string
	Address: string
	X?: number | string
	Y?: number | string
	Val?: number | string
	TxtVal?: string
	ScnStatus?: string
	ScnName?: string
	ScnComment?: string
	ScnType?: string
	[payload: string]: string | number | undefined
}

export interface RcpOptions {
	Address: string
	X: number | string
	Y: number | string
	Val: number | string
	prefix?: 'get' | 'set'
	Rel?: boolean
	createVariable?: boolean
}

export interface YamahaInstance extends InstanceBase<YamahaInstanceTypes> {
	colorCommands: string[]
	rcpPresets: YamahaPresetDefinitions
	dataStore: Record<string, Record<string, Record<string, number | string>>>
	cmdQueue: RcpOptions[]
	meterTimer: ReturnType<typeof setInterval> | undefined
	kaTimer: ReturnType<typeof setInterval> | undefined
	queueTimer: ReturnType<typeof setTimeout> | undefined
	variables: YamahaVariableValues
	socket?: import('@companion-module/base').TCPHelper
	newConsole(): void
	initTCP(): void
	addToCmdQueue(cmd: RcpOptions): void
	processCmdQueue(cmd?: RcpMessage): void
	sendCmd(command?: string): boolean
	addToDataStore(cmd: RcpMessage | RcpOptions): void
	getFromDataStore(cmd?: RcpMessage | RcpOptions): number | string | undefined
}

declare global {
	var config: YamahaConfig
	var rcpCommands: RcpCommand[]
}
