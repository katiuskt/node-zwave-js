import { IDriver } from "../driver/IDriver";
import { ZWaveError, ZWaveErrorCodes } from "../error/ZWaveError";
import { GenericDeviceClasses } from "../node/DeviceClass";
import { NodeInformationFrame, parseNodeInformationFrame } from "../node/NodeInfo";
import { ccValue, CommandClass, commandClass, CommandClasses, expectedCCResponse, implementedVersion } from "./CommandClass";

export enum MultiChannelCommand {
	EndPointGet = 0x07,
	EndPointReport = 0x08,
	CapabilityGet = 0x09,
	CapabilityReport = 0x0A,
	EndPointFind = 0x0B,
	EndPointFindReport = 0x0C,
	CommandEncapsulation = 0x0D,
	// V4:
	// AggregatedMembersGet = 0x0E,
	// AggregatedMembersReport = 0x0F,
}

export interface EndpointCapability extends NodeInformationFrame {
	isDynamic: boolean;
}

@commandClass(CommandClasses["Multi Channel"])
@implementedVersion(3)
@expectedCCResponse(CommandClasses["Multi Channel"])
export class MultiChannelCC extends CommandClass {

	// tslint:disable:unified-signatures
	constructor(driver: IDriver, nodeId?: number);
	constructor(driver: IDriver, nodeId: number, ccCommand: MultiChannelCommand.EndPointGet);
	constructor(driver: IDriver, nodeId: number, ccCommand: MultiChannelCommand.CapabilityGet, endpoint: number);
	constructor(driver: IDriver, nodeId: number, ccCommand: MultiChannelCommand.EndPointFind, genericClass: GenericDeviceClasses, specificClass: number);

	constructor(
		driver: IDriver,
		public nodeId: number,
		public ccCommand?: MultiChannelCommand,
		...args: any[]
	) {
		super(driver, nodeId);

		if (ccCommand === MultiChannelCommand.CapabilityGet) {
			[this.endpoint] = args;
		} else if (ccCommand === MultiChannelCommand.EndPointFind) {
			[
				this.genericClass,
				this.specificClass,
			] = args;
		}
	}
	// tslint:enable:unified-signatures

	@ccValue() public isDynamicEndpointCount: boolean;
	@ccValue() public identicalCapabilities: boolean;
	@ccValue() public endpointCount: number;

	private _endpointCapabilities = new Map<number, EndpointCapability>();
	public get endpointCapabilities(): Map<number, EndpointCapability> {
		return this._endpointCapabilities;
	}

	public endpoint: number;
	public genericClass: GenericDeviceClasses;
	public specificClass: number;

	private _foundEndpoints: number[];
	public get foundEndpoints(): number[] {
		return this._foundEndpoints;
	}

	public serialize(): Buffer {
		switch (this.ccCommand) {
			case MultiChannelCommand.EndPointGet:
				this.payload = Buffer.from([this.ccCommand]);
				break;

			case MultiChannelCommand.CapabilityGet:
				this.payload = Buffer.from([
					this.ccCommand,
					this.endpoint & 0b01111111,
				]);
				break;

			case MultiChannelCommand.EndPointFind:
				this.payload = Buffer.from([
					this.ccCommand,
					this.genericClass,
					this.specificClass,
				]);
				break;

			// TODO: MultiChannelEncapsulation

			default:
				throw new ZWaveError(
					"Cannot serialize a MultiChannel CC with a command other than EndPointGet, CapabilityGet",
					ZWaveErrorCodes.CC_Invalid,
				);
		}

		return super.serialize();
	}

	public deserialize(data: Buffer): void {
		super.deserialize(data);

		this.ccCommand = this.payload[0];
		switch (this.ccCommand) {
			case MultiChannelCommand.EndPointReport:
				this.isDynamicEndpointCount = !!(this.payload[1] & 0b10000000);
				this.identicalCapabilities = !!(this.payload[1] & 0b01000000);
				this.endpointCount = this.payload[2] & 0b01111111;
				break;

			case MultiChannelCommand.CapabilityReport: {
				const endpointIndex = this.payload[1] & 0b01111111;
				const capability: EndpointCapability = {
					isDynamic: !!(this.payload[1] & 0b10000000),
					...parseNodeInformationFrame(this.payload.slice(2)),
				};
				this._endpointCapabilities.set(endpointIndex, capability);
				break;
			}

			case MultiChannelCommand.EndPointFindReport: {
				const numReports = this.payload[1];
				this.genericClass = this.payload[2];
				this.specificClass = this.payload[3];
				this._foundEndpoints = [...this.payload.slice(4, 4 + numReports)].map(e => e & 0b01111111);
				break;
			}

			// TODO: MultiChannelEncapsulation

			default:
				throw new ZWaveError(
					"Cannot deserialize a MultiChannel CC with a command other than EndPointReport, CapabilityReport, EndPointFindReport",
					ZWaveErrorCodes.CC_Invalid,
				);
		}
	}
}
