import { XDevice } from '../dirigera.js';
import { DirigeraPlatform } from '../DirigeraPlatform.js';
import { DirigeraHub } from '../DirigeraHub.js';
import { PlatformAccessory, Service } from 'homebridge';
import { Device } from 'dirigera';
import { ILogger } from '../Logger.js';
import { CommonDeviceAttributes } from 'dirigera/dist/src/types/device/Device.js';

const COMMUNICATION_FAILURE = -70402;

export abstract class DirigeraDevice<Attrs extends CommonDeviceAttributes = CommonDeviceAttributes> {

    readonly platform: DirigeraPlatform;
    readonly hub: DirigeraHub;
    readonly accessory: PlatformAccessory;
    readonly device: XDevice;
    readonly service: Service;
    readonly logger: ILogger;

    private _available: boolean;

    protected constructor(platform: DirigeraPlatform, hub: DirigeraHub, accessory: PlatformAccessory, device: XDevice, service: Service) {
        this.platform = platform;
        this.hub = hub;
        this.accessory = accessory;
        this.device = device;
        this.logger = hub.logger.getLogger(this.type, this.name);
        this.service = service;
        this._available = device.isReachable !== false;
        this.service.setPrimaryService(true);
        this.service.setCharacteristic(platform.Characteristic.Name, accessory.displayName);
        this.service.addOptionalCharacteristic(platform.Characteristic.StatusActive);
        let status = this.service.getCharacteristic(platform.Characteristic.StatusActive);
        if (!status) {
            status = this.service.addCharacteristic(platform.Characteristic.StatusActive);
        }
        status.setValue(this.available).onGet(() => this.available);

        this.service.addOptionalCharacteristic(platform.Characteristic.StatusFault);
        let statusFault = this.service.getCharacteristic(platform.Characteristic.StatusFault);
        if (!statusFault) {
            statusFault = this.service.addCharacteristic(platform.Characteristic.StatusFault);
        }
        statusFault.setValue(this.statusFault).onGet(() => this.statusFault);
    }

    abstract update(attributes: Attrs);

    abstract close(): Promise<void>;

    get id() {
        return this.device.id;
    }

    get type() {
        return this.device.deviceType;
    }

    get name() {
        return this.device.attributes.customName;
    }

    get available() {
        return this._available;
    }

    set available(available: boolean) {
        if (this._available === available) {
            if (!available) {
                this.refreshAvailabilityCharacteristics(available);
            }
            return;
        }
        this._available = available;
        this.refreshAvailabilityCharacteristics(available);
    }

    private refreshAvailabilityCharacteristics(available: boolean) {
        this.service.getCharacteristic(this.platform.Characteristic.StatusActive).updateValue(available);
        this.service.getCharacteristic(this.platform.Characteristic.StatusFault).updateValue(this.statusFault);
        this.onAvailabilityChanged(available);
    }

    updateReachability(isReachable: boolean) {
        this.device.isReachable = isReachable;
        this.available = isReachable && this.hub.available;
    }

    protected assertAvailable() {
        if (!this.available) {
            throw this.unavailableError;
        }
    }

    protected onAvailabilityChanged(_available: boolean) {
    }

    protected get unavailableError() {
        const error = new Error(`${this.name || this.id} is unreachable`);
        (error as any).hapStatus = COMMUNICATION_FAILURE;
        return error;
    }

    private get statusFault() {
        return this.available ?
            this.platform.Characteristic.StatusFault.NO_FAULT :
            this.platform.Characteristic.StatusFault.GENERAL_FAULT;
    }

}

export namespace DirigeraDevice {

    export type Factory<T extends DirigeraDevice = DirigeraDevice> = {
        create: (platform: DirigeraPlatform, hub: DirigeraHub, accessory: PlatformAccessory, device: Device) => Promise<T>
    }
}
