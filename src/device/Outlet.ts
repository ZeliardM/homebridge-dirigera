import { Device } from 'dirigera';
import { Outlet as _Outlet, OutletAttributes } from 'dirigera/dist/src/types/device/Outlet.js';
import { PlatformAccessory } from 'homebridge';
import { isBoolean } from '../common.js';
import { DirigeraHub } from '../DirigeraHub.js';
import { DirigeraPlatform } from '../DirigeraPlatform.js';
import { DirigeraDevice } from './DirigeraDevice.js';
import { Switch } from './Switch.js';

export class Outlet extends DirigeraDevice<OutletAttributes> {

    static readonly create = async (platform: DirigeraPlatform, hub: DirigeraHub, accessory: PlatformAccessory, device: Device): Promise<DirigeraDevice> => {
        const asSwitch = hub.config.devices?.[device.id]?.asSwitch ?? false;
        if (asSwitch) {
            return Switch.create(platform, hub, accessory, device);
        }
        return new Outlet(platform, hub, accessory, <_Outlet>device);
    };

    private constructor(platform: DirigeraPlatform, hub: DirigeraHub, accessory: PlatformAccessory, device: _Outlet) {
        super(platform, hub, accessory, device, accessory.getService(platform.Service.Outlet) ?? accessory.addService(platform.Service.Outlet));

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
                    await hub.setDeviceAttributes(device.id, { isOn } as OutletAttributes);
                }
            });

        if (!this.available) {
            this.onAvailabilityChanged(false);
        }

    }

    update(attributes: OutletAttributes) {
        this.device.attributes = {
            ...this.device.attributes,
            ...attributes
        };
        if (!this.available) {
            this.onAvailabilityChanged(false);
            return;
        }
        if (isBoolean(attributes.isOn)) {
            this.accessory.getService(this.platform.Service.Outlet)!
                .getCharacteristic(this.platform.Characteristic.On)
                .updateValue(attributes.isOn, { fromDirigera: true });
        }
    }

    async close() {
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
