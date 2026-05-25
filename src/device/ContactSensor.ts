import { Device } from 'dirigera';
import { OpenCloseSensor, OpenCloseSensorAttributes } from 'dirigera/dist/src/types/device/OpenCloseSensor.js';
import { PlatformAccessory, Service } from 'homebridge';
import { isBoolean, isNumber } from '../common.js';
import { DirigeraHub } from '../DirigeraHub.js';
import { DirigeraPlatform } from '../DirigeraPlatform.js';
import { DirigeraDevice } from './DirigeraDevice.js';

const CONTACT_DETECTED = 0;
const CONTACT_NOT_DETECTED = 1;
const CLOSED_POSITION = 0;
const OPEN_POSITION = 100;

export class ContactSensor extends DirigeraDevice<OpenCloseSensorAttributes> {

    static readonly create = async (platform: DirigeraPlatform, hub: DirigeraHub, accessory: PlatformAccessory, device: Device): Promise<ContactSensor> => {
        return new ContactSensor(platform, hub, accessory, <OpenCloseSensor>device);
    }

    private battery?: Service;
    private readonly asDoor: boolean;

    private constructor(platform: DirigeraPlatform, hub: DirigeraHub, accessory: PlatformAccessory, device: OpenCloseSensor) {
        const asDoor = hub.config.devices?.[device.id]?.asDoor ?? false;

        if (asDoor) {
            removeService(accessory, accessory.getService(platform.Service.ContactSensor));
        } else {
            removeService(accessory, accessory.getService(platform.Service.Door));
        }

        super(platform, hub, accessory, device, asDoor ?
            accessory.getService(platform.Service.Door) ?? accessory.addService(platform.Service.Door) :
            accessory.getService(platform.Service.ContactSensor) ?? accessory.addService(platform.Service.ContactSensor));

        this.asDoor = asDoor;

        if (asDoor) {
            this.service.getCharacteristic(platform.Characteristic.CurrentPosition)
                .setProps({ minValue: CLOSED_POSITION, maxValue: OPEN_POSITION, minStep: OPEN_POSITION })
                .setValue(this.doorPosition)
                .onGet(() => this.getDoorPosition());

            this.service.getCharacteristic(platform.Characteristic.TargetPosition)
                .setProps({ minValue: CLOSED_POSITION, maxValue: OPEN_POSITION, minStep: OPEN_POSITION })
                .setValue(this.doorPosition)
                .onGet(() => this.getDoorPosition())
                .onSet(() => {
                    this.assertAvailable();
                    this.syncDoorCharacteristics();
                });

            this.service.getCharacteristic(platform.Characteristic.PositionState)
                .setValue(platform.Characteristic.PositionState.STOPPED)
                .onGet(() => platform.Characteristic.PositionState.STOPPED);

            this.syncDoorCharacteristics();
        } else {
            this.service.getCharacteristic(platform.Characteristic.ContactSensorState)
                .setValue(this.contactSensorState)
                .onGet(() => {
                    this.assertAvailable();
                    return this.contactSensorState;
                });
        }

        this.syncBatteryLevel(device.attributes.batteryPercentage);

        if (!this.available) {
            this.onAvailabilityChanged(false);
        }
    }

    update(attributes: OpenCloseSensorAttributes) {
        this.device.attributes = {
            ...this.device.attributes,
            ...attributes
        };
        this.syncBatteryLevel(attributes.batteryPercentage);
        if (!this.available) {
            this.onAvailabilityChanged(false);
            return;
        }
        if (isBoolean(attributes.isOpen)) {
            if (this.asDoor) {
                this.syncDoorCharacteristics();
            } else {
                this.accessory.getService(this.platform.Service.ContactSensor)!
                    .getCharacteristic(this.platform.Characteristic.ContactSensorState)
                    .updateValue(this.contactSensorState);
            }
        }
    }

    async close(){
    }

    protected onAvailabilityChanged(_available: boolean) {
        if (this.asDoor) {
            this.syncDoorCharacteristics();
            return;
        }

        if (!this.available) {
            this.service.getCharacteristic(this.platform.Characteristic.ContactSensorState)
                .updateValue(this.unavailableError as any);
        } else {
            this.service.getCharacteristic(this.platform.Characteristic.ContactSensorState)
                .updateValue(this.contactSensorState);
        }
    }

    private get contactSensorState() {
        return this.device.attributes.isOpen ? CONTACT_NOT_DETECTED : CONTACT_DETECTED;
    }

    private get doorPosition() {
        return this.device.attributes.isOpen ? OPEN_POSITION : CLOSED_POSITION;
    }

    private getDoorPosition() {
        this.assertAvailable();
        return this.doorPosition;
    }

    private syncBatteryLevel(batteryPercentage: unknown) {
        if (!isNumber(batteryPercentage)) {
            return;
        }

        this.device.attributes.batteryPercentage = batteryPercentage;
        const existingBattery = this.battery;
        this.battery = this.accessory.getService(this.platform.Service.Battery) ?? this.accessory.addService(this.platform.Service.Battery);
        const batteryLevel = this.battery.getCharacteristic(this.platform.Characteristic.BatteryLevel);
        batteryLevel.updateValue(batteryPercentage);
        if (!existingBattery) {
            batteryLevel.onGet(() => this.device.attributes.batteryPercentage as number);
        }
    }

    private syncDoorCharacteristics() {
        if (!this.available) {
            const error = this.unavailableError;
            this.service.getCharacteristic(this.platform.Characteristic.CurrentPosition)
                .updateValue(error as any);
            this.service.getCharacteristic(this.platform.Characteristic.TargetPosition)
                .updateValue(error as any);
        } else {
            this.service.getCharacteristic(this.platform.Characteristic.CurrentPosition)
                .updateValue(this.doorPosition);
            this.service.getCharacteristic(this.platform.Characteristic.TargetPosition)
                .updateValue(this.doorPosition);
        }

        this.service.getCharacteristic(this.platform.Characteristic.PositionState)
            .updateValue(this.platform.Characteristic.PositionState.STOPPED);
    }

}

function removeService(accessory: PlatformAccessory, service: Service | undefined) {
    if (service) {
        accessory.removeService(service);
    }
}
