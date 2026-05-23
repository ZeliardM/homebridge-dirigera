import {
    API,
    Characteristic,
    DynamicPlatformPlugin,
    Logger,
    PlatformAccessory,
    PlatformConfig,
    Service
} from 'homebridge';
import { PLATFORM_NAME, PLUGIN_NAME, PLUGIN_VERSION } from './settings';
import { DirigeraHub } from './DirigeraHub.js';
import { Devices } from './device/index.js';
import { asyncForEach, cleanArrayAsync, cleanMapAsync, isBoolean, isString, isUndefined, spliceFirstMatch } from './common.js';
import { DirigeraDevice } from './device/DirigeraDevice.js';
import { CommonDeviceAttributes } from 'dirigera/dist/src/types/device/Device.js';
import { Device } from 'dirigera';

/**
 * HomebridgePlatform
 * This class is the main constructor for your plugin, this is where you should
 * parse the user config and discover/register accessories with Homebridge.
 */
export class DirigeraPlatform implements DynamicPlatformPlugin {

    public readonly Service: typeof Service;
    public readonly Characteristic: typeof Characteristic;

    private readonly accessories: PlatformAccessory[] = [];
    private readonly log: Logger;
    private readonly config: PlatformConfig;
    public readonly api: API;

    private readonly hubs: { [id: string]: DirigeraHub } = {};

    private readonly devices: { [hubId: string]: DirigeraDevice<CommonDeviceAttributes>[] } = {};

    constructor(log: Logger, config: PlatformConfig, api: API) {
        this.log = log;
        this.config = config;
        this.api = api;

        this.Service = this.api.hap.Service;
        this.Characteristic = this.api.hap.Characteristic;

        this.log.debug('Finished initializing platform');

        // When this event is fired it means Homebridge has restored all cached accessories from disk.
        // Dynamic Platform plugins should only register new accessories after this event was fired,
        // in order to ensure they weren't added to homebridge already. This event can also be used
        // to start discovery of new accessories.
        this.api.on('didFinishLaunching', () => this.init());
        this.api.on('shutdown', async () => {
            await cleanMapAsync(this.hubs, async (id, hub) => {
                await hub?.close();
            });
            await cleanMapAsync(this.devices, async (hubId, devices) => {
                await cleanArrayAsync(devices, device => device.close());
            });
        });
    }

    /**
     * This function is invoked when homebridge restores cached accessories from disk at startup.
     * It should be used to set up event handlers for characteristics and update respective values.
     */
    configureAccessory(accessory: PlatformAccessory) {
        this.accessories.push(accessory);
    }

    /**
     * Initializes the platform. All devices are fetched form the DIRIGERA hub and are registered
     * as accessories in Homebridge. The Accessories are registered once, previously created accessories
     * not registered again to prevent "duplicate UUID" errors. Also, any known accessories which represent
     * devices that no longer exist on the DIRIGERA hub, will be removed.
     *
     * Since this is a dynamic platform, `deviceAdded` and `deviceRemoved` events will be listened to on
     * the hub and the relevant accessories will dynamically be created/registered or removed/unregistered
     * accordingly.
     */
    private async init() {

        const hubConfigs = this.config.hubs as DirigeraHub.Config[] || [];
        for (const hubConfig of hubConfigs) {
            try {
                const hub = await DirigeraHub.create(hubConfig, this.log);
                this.log.info(`hub [${hubConfig.host}][${hub.name}] connected`);
                this.hubs[hub.id] = hub;
                this.devices[hub.id] = [];
            } catch (error) {
                this.log.error(`Failed to connect to Dirigera Hub [${hubConfig.host}]. ${error}`);
            }
        }

        // first, let's clean up the cached accessories that are no long available
        const removeAccessories: Array<{ accessory: PlatformAccessory, reason: string }> = [];
        for (let i = 0; i < this.accessories.length; i++) {
            const accessory = this.accessories[i];
            const hub = this.hubs[accessory.context.hubId];
            if (!hub) {
                this.accessories.splice(i--, 1);
                removeAccessories.push({ accessory, reason: 'Dirigera hub no longer available' });
            } else {
                const device = hub && await hub.getDevice(accessory.context.deviceId);
                if (!device) {
                    this.accessories.splice(i--, 1);
                    removeAccessories.push({ accessory, reason: 'Device no longer available' });
                } else if (!this.shouldExposeDevice(hub, device)) {
                    this.accessories.splice(i--, 1);
                    removeAccessories.push({ accessory, reason: 'Device excluded by configuration' });
                } else if (!accessory.context.pluginVersion) {
                    // from 0.2.0 the accessory UUID has changed to be based on the device id.
                    // from 0.2.2 the plugin version is stored in the accessory context.
                    //
                    // the UUID of the accessory is deprecated as it's now based on the device id instead of the type & serial number
                    // we'll need to unregister the accessory such that it'll then be added again under the correct UUID.
                    this.accessories.splice(i--, 1);
                    removeAccessories.push({ accessory, reason: 'Deprecated accessory UUID' });
                } else {
                    //
                    // Here we have a chance to check the plugin version associated with the accessory and compare it with
                    // and compare it to the current version of the plugin, and based on that decide whether we need to
                    // unregister the accessory (so it'll be re-registered again)
                    //
                }
            }
        }

        for (const { accessory, reason } of removeAccessories) {
            this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME,[ accessory ]);
            this.log.info(`Unregistering cached accessory [${accessory.displayName}] from hub [${accessory.context.hubName}] - ${reason}`);
        }

        for (const hubId in this.hubs) {
            const hub = this.hubs[hubId];

            const devices = await hub.listDevices();
            // console.log(`devices [${JSON.stringify(devices)}]`);
            for (const device of devices) {
                await this.registerDevice(hub, device);
            }

            hub.on('availability', async availability => {
                if (!availability.available) {
                    this.devices[hubId].forEach(device => device.available = false);
                    return;
                }
                return this.refreshDevices(hub);
            });

            hub.on('deviceStateChanged', change => {
                const device = this.devices[hubId].find(device => device.id === change.id);
                if (device) {
                    this.log.debug(`hub [${hub.name}] device [${device.device.attributes.customName}] state changed [${JSON.stringify(change)}]`);
                    if (isBoolean(change.isReachable)) {
                        device.updateReachability(change.isReachable);
                    }
                    if (change.attributes) {
                        device.update(change.attributes);
                    }
                }
            });

            hub.on('deviceAdded', device => {
                this.registerDevice(hub, device);
            });

            hub.on('deviceRemoved', event => {
                this.unregisterDevice(hub, event.deviceId);
            });
        }

        this.log.info(`initialized`);
    }

    /**
     * this will be called whenever the hub becomes available again (after it was unavailable)
     * This will fetch all the devices from the DIRIGERA hub and update the appropriate HB devices.
     * Takes care of:
     *   - if some devices were removed from DIREGERA, they should then be unregistered with HB
     *   - if some devices were introduced in DIREGERA, they should then be registered with HB
     *   - for all the already existing devices, their attributes should be updated.
     */
    private async refreshDevices(hub: DirigeraHub) {
        const freshDevices = await hub.listDevices();
        const knownDevices = this.devices[hub.id];
        await asyncForEach(knownDevices, async knownDevice => {
            const freshDevice = freshDevices.find(freshDevice => freshDevice.id === knownDevice.id);
            if (freshDevice && this.shouldExposeDevice(hub, freshDevice)) {
                // the known device still exists in the hub... we'll just update its attributes
                knownDevice.updateReachability(freshDevice.isReachable !== false);
                await knownDevice.update(freshDevice.attributes);
            } else {
                // the known device no longer exists in the hub or was excluded, we'll need to remove/unregister it
                await this.unregisterDevice(hub, knownDevice);
            }
        });
        await asyncForEach(freshDevices, async device => {
            if (this.shouldExposeDevice(hub, device) && !knownDevices.find(knownDevice => knownDevice.id === device.id)) {
                await this.registerDevice(hub, device);
            }
        });
    }

    private async registerDevice(hub: DirigeraHub, device: Device) {
        if (isUndefined(Devices[device.deviceType])) {
            return;
        }

        if (!this.shouldExposeDevice(hub, device)) {
            this.log.debug(`[${hub.name}] skipping [${device.deviceType}][${device.id}] device [${device.attributes.customName || device.id}] - excluded by configuration`);
            return;
        }

        // generate a unique id for the accessory this should be generated from
        // something globally unique, but constant, for example, the device serial
        // number or MAC address
        const uuid = this.api.hap.uuid.generate(`${hub.id}:${device.id}`);

        // see if an accessory with the same uuid has already been registered and restored from
        // the cached devices we stored in the `configureAccessory` method above
        let accessory = this.accessories.find(accessory => accessory.UUID === uuid);

        if (!accessory) {
            const deviceName = device.attributes.customName || device.deviceType;
            const displayName = device.room?.name ? `${device.room?.name} ${deviceName}` : deviceName;
            accessory = new this.api.platformAccessory(displayName, uuid);
            accessory.context.hubId = hub.id;
            accessory.context.hubName = hub.name;
            accessory.context.deviceId = device.id;
            accessory.context.deviceName = deviceName;
            accessory.context.pluginVersion = PLUGIN_VERSION;
            this.log.info(`[${hub.name}] registering [${device.deviceType}][${device.id}] device [${accessory.displayName}]`);
            this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [ accessory ]);
            this.accessories.push(accessory);
        } else {
            this.log.info(`[${hub.name}] found [${device.deviceType}] device [${accessory.displayName}]`);
        }

        accessory.on('identify', async () => {
            this.log.debug(`Identifying [${hub.name}][${device.id}]`);
            await hub.identifyDevice(device.id);
        });

        accessory.getService(this.Service.AccessoryInformation)!
            .setCharacteristic(this.Characteristic.Name, accessory.displayName)
            .setCharacteristic(this.Characteristic.Manufacturer, device.attributes.manufacturer)
            .setCharacteristic(this.Characteristic.Model, device.attributes.model)
            .setCharacteristic(this.Characteristic.FirmwareRevision, device.attributes.firmwareVersion)
            .setCharacteristic(this.Characteristic.SerialNumber, device.attributes.serialNumber)
            .setCharacteristic(this.Characteristic.AppMatchingIdentifier, device.id);


        this.devices[hub.id].push(await Devices[device.deviceType]!.create(this, hub, accessory, device));
    }

    private async unregisterDevice(hub: DirigeraHub, deviceOrId: string | DirigeraDevice) {
        const deviceId = isString(deviceOrId)? deviceOrId : deviceOrId.id;
        const deviceIndex = this.devices[hub.id].findIndex(device => device.id === deviceId);
        if (deviceIndex < 0) {
            this.log.debug(`device [${deviceOrId}] was removed from DIRIGERA but was not registered with Homebridge`);
            return;
        }
        const [ registeredDevice ] = this.devices[hub.id].splice(deviceIndex, 1);
        this.log.info(`[${hub.name}] unregistering accessory [${registeredDevice.accessory.displayName}] (no longer available)`);
        this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [ registeredDevice.accessory ]);
        spliceFirstMatch(this.accessories, accessory => accessory.UUID === registeredDevice.accessory.UUID);
        await registeredDevice.close()
    }

    private shouldExposeDevice(hub: DirigeraHub, device: Device) {
        const deviceConfig = hub.config.devices?.[device.id];
        if (deviceConfig?.expose === false) {
            return false;
        }
        if (hub.config.exposeConfiguredDevicesOnly) {
            return deviceConfig?.expose === true;
        }
        return true;
    }


}
