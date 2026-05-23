import { DirigeraHub } from '../DirigeraHub.js';
import { PlatformAccessory } from 'homebridge';
import { Device } from 'dirigera';
import { LightAttributes } from 'dirigera/dist/src/types/device/Light.js';
import { DirigeraPlatform } from '../DirigeraPlatform.js';
import { isBoolean, isNumber } from '../common.js';
import { DirigeraDevice } from './DirigeraDevice.js';
import { Switch } from './Switch.js';

export class Light extends DirigeraDevice<LightAttributes> {

    static readonly create = async (platform: DirigeraPlatform, hub: DirigeraHub, accessory: PlatformAccessory, device: Device): Promise<DirigeraDevice> => {
        const asSwitch = hub.config.devices?.[device.id]?.asSwitch ?? false;
        if (asSwitch) {
            return Switch.create(platform, hub, accessory, device);
        }
        return new Light(platform, hub, accessory, device);
    }

    private adaptiveLightingController?: { disableAdaptiveLighting: () => void };
    private pendingColor?: Pick<LightAttributes, 'colorHue' | 'colorSaturation'>;
    private pendingColorTimer?: ReturnType<typeof setTimeout>;
    private readonly colorTemperatureMin?: number;
    private readonly colorTemperatureMax?: number;

    private constructor(platform: DirigeraPlatform, hub: DirigeraHub, accessory: PlatformAccessory, device: Device) {
        super(platform, hub, accessory, device, accessory.getService(platform.Service.Lightbulb) ?? accessory.addService(platform.Service.Lightbulb));

        const initialLightLevel = device.attributes.lightLevel;
        const initialColorTemperature = device.attributes.colorTemperature;
        const supportsBrightness = isNumber(initialLightLevel);
        const supportsColorTemperature = isNumber(initialColorTemperature);

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
                    await hub.setDeviceAttributes(device.id, { isOn } as LightAttributes);
                }
            });

        if (supportsBrightness) {
            this.service.getCharacteristic(platform.Characteristic.Brightness)
                .setValue(this.homeKitBrightness)
                .onGet(() => {
                    this.assertAvailable();
                    return this.homeKitBrightness;
                })
                .onSet(async (value, context) => {
                    this.assertAvailable();
                    const lightLevel = clamp(value as number, 0, 100);
                    this.device.attributes.lightLevel = lightLevel;
                    if (!context?.fromDirigera) {
                        await hub.setDeviceAttributes(device.id, { lightLevel } as LightAttributes);
                    }
                });
        }

        if (isNumber(device.attributes.colorHue)) {
            this.service.getCharacteristic(platform.Characteristic.Hue)
                .setValue(clamp(device.attributes.colorHue, 0, 360))
                .onGet(() => {
                    this.assertAvailable();
                    return clamp(this.device.attributes.colorHue as number, 0, 360);
                })
                .onSet(async (value, context) => {
                    this.assertAvailable();
                    const colorHue = clamp(value as number, 0, 360);
                    this.device.attributes.colorHue = colorHue;
                    if (!context?.fromDirigera) {
                        this.disableAdaptiveLighting();
                        this.queueColorUpdate({ colorHue });
                    }
                });
        }

        if (isNumber(device.attributes.colorSaturation)) {
            this.service.getCharacteristic(platform.Characteristic.Saturation)
                .setValue(saturationToHomeKit(device.attributes.colorSaturation))
                .onGet(() => {
                    this.assertAvailable();
                    return saturationToHomeKit(this.device.attributes.colorSaturation as number);
                })
                .onSet(async (value, context) => {
                    this.assertAvailable();
                    const colorSaturation = saturationFromHomeKit(value as number);
                    this.device.attributes.colorSaturation = colorSaturation;
                    if (!context?.fromDirigera) {
                        this.disableAdaptiveLighting();
                        this.queueColorUpdate({ colorSaturation });
                    }
                });
        }

        if (supportsColorTemperature) {

            const colorTemperatureMin = isNumber(device.attributes.colorTemperatureMin) ? device.attributes.colorTemperatureMin : undefined;
            const colorTemperatureMax = isNumber(device.attributes.colorTemperatureMax) ? device.attributes.colorTemperatureMax : undefined;
            this.colorTemperatureMin = isNumber(colorTemperatureMin) && isNumber(colorTemperatureMax) ?
                Math.min(colorTemperatureMin, colorTemperatureMax) :
                colorTemperatureMin;
            this.colorTemperatureMax = isNumber(colorTemperatureMin) && isNumber(colorTemperatureMax) ?
                Math.max(colorTemperatureMin, colorTemperatureMax) :
                colorTemperatureMax;

            const colorTemperature = this.clampColorTemperature(initialColorTemperature);
            const minMired = isNumber(this.colorTemperatureMax) ? kelvinToMired(this.colorTemperatureMax) : undefined;
            const maxMired = isNumber(this.colorTemperatureMin) ? kelvinToMired(this.colorTemperatureMin) : undefined;

            const colorTemperatureCharacteristic = this.service.getCharacteristic(platform.Characteristic.ColorTemperature)
                .setValue(kelvinToMired(colorTemperature))
                .setProps({
                    minValue: minMired,
                    maxValue: maxMired
                })
                .onGet(() => {
                    this.assertAvailable();
                    return kelvinToMired(this.clampColorTemperature(this.device.attributes.colorTemperature as number));
                })
                .onSet(async (value, context) => {
                    this.assertAvailable();
                    const colorTemperature = this.clampColorTemperature(miredToKelvin(value as number));
                    device.attributes.colorTemperature = colorTemperature;
                    this.updateHueSaturationFromColorTemperature(value as number);
                    if (!context?.fromDirigera) {
                        await hub.setDeviceAttributes(device.id, { colorTemperature } as LightAttributes);
                    }
                });

            this.updateHueSaturationFromColorTemperature(colorTemperatureCharacteristic.value as number);
        }

        if (supportsBrightness && supportsColorTemperature) {
            const AdaptiveLightingController = (platform.api.hap as any).AdaptiveLightingController;
            if (AdaptiveLightingController) {
                this.adaptiveLightingController = new AdaptiveLightingController(this.service);
                accessory.configureController(this.adaptiveLightingController as any);
            }
        }

        if (!this.available) {
            this.onAvailabilityChanged(false);
        }

    }

    update(attributes: LightAttributes) {
        this.device.attributes = {
            ...this.device.attributes,
            ...attributes
        };
        if (!this.available) {
            this.onAvailabilityChanged(false);
            return;
        }
        if (isBoolean(attributes.isOn)) {
            this.accessory.getService(this.platform.Service.Lightbulb)!
                .getCharacteristic(this.platform.Characteristic.On)
                .updateValue(attributes.isOn, { fromDirigera: true });
        }
        if (isNumber(attributes.lightLevel)) {
            this.service.getCharacteristic(this.platform.Characteristic.Brightness)
                .updateValue(clamp(attributes.lightLevel, 0, 100), { fromDirigera: true });
        }
        if (isNumber(attributes.colorHue)) {
            this.service.getCharacteristic(this.platform.Characteristic.Hue)
                .updateValue(clamp(attributes.colorHue, 0, 360), { fromDirigera: true });
        }
        if (isNumber(attributes.colorSaturation)) {
            this.service.getCharacteristic(this.platform.Characteristic.Saturation)
                .updateValue(saturationToHomeKit(attributes.colorSaturation), { fromDirigera: true });
        }
        if (isNumber(attributes.colorTemperature)) {
            const mired = kelvinToMired(this.clampColorTemperature(attributes.colorTemperature));
            this.service.getCharacteristic(this.platform.Characteristic.ColorTemperature)
                .updateValue(mired, { fromDirigera: true });
            this.updateHueSaturationFromColorTemperature(mired);
        }
    }

    async close(){
        if (this.pendingColorTimer) {
            clearTimeout(this.pendingColorTimer);
        }
    }

    protected onAvailabilityChanged(available: boolean) {
        const C = this.platform.Characteristic;
        const error = this.unavailableError;

        this.service.getCharacteristic(C.On)
            .updateValue(available ? this.homeKitOn : false);
        if (!available) {
            this.service.getCharacteristic(C.On).updateValue(error);
        }

        if (this.service.testCharacteristic(C.Brightness) && isNumber(this.device.attributes.lightLevel)) {
            this.service.getCharacteristic(C.Brightness)
                .updateValue(available ? this.homeKitBrightness : 0);
            if (!available) {
                this.service.getCharacteristic(C.Brightness).updateValue(error);
            }
        }
        if (this.service.testCharacteristic(C.Hue) && isNumber(this.device.attributes.colorHue)) {
            this.service.getCharacteristic(C.Hue)
                .updateValue(clamp(this.device.attributes.colorHue, 0, 360));
        }
        if (this.service.testCharacteristic(C.Saturation) && isNumber(this.device.attributes.colorSaturation)) {
            this.service.getCharacteristic(C.Saturation)
                .updateValue(saturationToHomeKit(this.device.attributes.colorSaturation));
        }
        if (this.service.testCharacteristic(C.ColorTemperature) && isNumber(this.device.attributes.colorTemperature)) {
            this.service.getCharacteristic(C.ColorTemperature)
                .updateValue(kelvinToMired(this.clampColorTemperature(this.device.attributes.colorTemperature)));
        }
    }

    private queueColorUpdate(attributes: Pick<LightAttributes, 'colorHue'> | Pick<LightAttributes, 'colorSaturation'>) {
        this.pendingColor = {
            colorHue: isNumber(this.device.attributes.colorHue) ? this.device.attributes.colorHue : 0,
            colorSaturation: isNumber(this.device.attributes.colorSaturation) ? this.device.attributes.colorSaturation : 0,
            ...this.pendingColor,
            ...attributes
        };

        if (this.pendingColorTimer) {
            clearTimeout(this.pendingColorTimer);
        }

        this.pendingColorTimer = setTimeout(() => {
            const pendingColor = this.pendingColor;
            this.pendingColor = undefined;
            this.pendingColorTimer = undefined;
            if (pendingColor) {
                this.hub.setDeviceAttributes(this.id, pendingColor as LightAttributes)
                    .catch(error => this.logger.error(`Failed to update color. ${error}`));
            }
        }, 200);
    }

    private clampColorTemperature(colorTemperature: number) {
        let result = colorTemperature;
        if (isNumber(this.colorTemperatureMin)) {
            result = Math.max(this.colorTemperatureMin, result);
        }
        if (isNumber(this.colorTemperatureMax)) {
            result = Math.min(this.colorTemperatureMax, result);
        }
        return result;
    }

    private updateHueSaturationFromColorTemperature(mired: number) {
        const colorUtils = (this.platform.api.hap as any).ColorUtils;
        const converter = colorUtils?.colorTemperatureToHueAndSaturation;
        if (!converter) {
            return;
        }

        const color = converter(mired);
        const hue = color.h ?? color.hue;
        const saturation = color.s ?? color.saturation;
        if (isNumber(hue)) {
            this.service.getCharacteristic(this.platform.Characteristic.Hue)
                .updateValue(hue, { fromDirigera: true });
        }
        if (isNumber(saturation)) {
            this.service.getCharacteristic(this.platform.Characteristic.Saturation)
                .updateValue(saturation, { fromDirigera: true });
        }
    }

    private disableAdaptiveLighting() {
        this.adaptiveLightingController?.disableAdaptiveLighting();
    }

    private get homeKitOn() {
        return this.available && isBoolean(this.device.attributes.isOn) ? this.device.attributes.isOn : false;
    }

    private get homeKitBrightness() {
        return this.available && isNumber(this.device.attributes.lightLevel) ?
            clamp(this.device.attributes.lightLevel, 0, 100) :
            0;
    }

}

function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
}

function kelvinToMired(kelvin: number) {
    return Math.round(1_000_000 / kelvin);
}

function miredToKelvin(mired: number) {
    return Math.round(1_000_000 / mired);
}

function saturationToHomeKit(saturation: number) {
    return clamp(saturation * 100, 0, 100);
}

function saturationFromHomeKit(saturation: number) {
    return clamp(saturation, 0, 100) / 100;
}
