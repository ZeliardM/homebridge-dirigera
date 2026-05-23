import { Device } from 'dirigera';
import { PlatformAccessory } from 'homebridge';
import { isBoolean } from '../common.js';
import { SwitchAttributes } from '../dirigera.js';
import { DirigeraHub } from '../DirigeraHub.js';
import { DirigeraPlatform } from '../DirigeraPlatform.js';
import { DirigeraDevice } from './DirigeraDevice.js';

export class Switch extends DirigeraDevice<SwitchAttributes> {

    static readonly create = async (platform: DirigeraPlatform, hub: DirigeraHub, accessory: PlatformAccessory, device: Device): Promise<Switch> => {
        return new Switch(platform, hub, accessory, device);
    }

    private constructor(platform: DirigeraPlatform, hub: DirigeraHub, accessory: PlatformAccessory, device: Device) {
        super(platform, hub, accessory, device, accessory.getService(platform.Service.Switch) ?? accessory.addService(platform.Service.Switch));

        this.service.getCharacteristic(platform.Characteristic.On)
            .setValue(this.homeKitOn)
            .onGet(() => {
                this.assertAvailable();
                return this.homeKitOn;
            })
            .onSet(async (value, context) => {
                this.assertAvailable();
                const isOn = !!value;
                this.device.attributes.isOn = isOn;
                if (!context?.fromDirigera) {
                    await hub.setDeviceAttributes(device.id, { isOn } as SwitchAttributes);
                }
            });

        if (!this.available) {
            this.onAvailabilityChanged(false);
        }

    }

    update(attributes: SwitchAttributes) {
        this.device.attributes = {
            ...this.device.attributes,
            ...attributes
        };
        if (!this.available) {
            this.onAvailabilityChanged(false);
            return;
        }
        if (isBoolean(attributes.isOn)) {
            this.accessory.getService(this.platform.Service.Switch)!
                .getCharacteristic(this.platform.Characteristic.On)
                .updateValue(attributes.isOn, { fromDirigera: true });
        }
    }

    async close(){
    }

    protected onAvailabilityChanged(available: boolean) {
        this.service.getCharacteristic(this.platform.Characteristic.On)
            .updateValue(available ? this.homeKitOn : false);
        if (!available) {
            this.service.getCharacteristic(this.platform.Characteristic.On)
                .updateValue(this.unavailableError);
        }
    }

    private get homeKitOn() {
        return this.available && isBoolean(this.device.attributes.isOn) ? this.device.attributes.isOn : false;
    }

}
