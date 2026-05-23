# Homebridge DIRIGERA

Homebridge platform plugin for IKEA DIRIGERA hubs.

[![Build](https://github.com/ZeliardM/homebridge-dirigera/actions/workflows/build.yml/badge.svg?branch=latest)](https://github.com/ZeliardM/homebridge-dirigera/actions/workflows/build.yml)

## Compatibility

- Package name: `homebridge-dirigera`
- Homebridge: `^1.6.0 || ^2.0.0`
- Node.js: `^22.12.0 || ^24.0.0`

## Custom UI

This plugin includes a Homebridge Config UI setup page that can:

- Pair a DIRIGERA hub and store the access token as a read-only config value.
- Read supported hub devices from DIRIGERA.
- Select the contact sensors, light bulbs, and outlets that should be exposed to Homebridge/HomeKit.
- Exclude devices that are already managed by other plugins.
- Expose selected lights or outlets as switches when DIRIGERA reports a third-party device in a less useful shape.
- Expose selected contact sensors as HomeKit doors, where the door position follows the sensor state and no separate contact sensor or battery service is exposed.

New devices discovered by the UI are excluded by default until selected.

## Device Support

The custom UI focuses on:

- `openCloseSensor` as HomeKit contact sensors or read-only HomeKit doors
- `light` as HomeKit light bulbs, including on/off, brightness, color temperature, HSV color, and adaptive lighting when the bulb supports brightness and color temperature
- `outlet` as HomeKit outlets

Reachability from DIRIGERA is reflected through HomeKit status characteristics. When a device is unreachable, characteristic reads and writes fail so HomeKit can show it as unresponsive instead of continuing to present stale state.

The runtime still includes the existing handlers for blinds, motion sensors, leak sensors, and environment sensors for manually maintained configurations.

## Example Config

```json
{
  "platform": "homebridge-dirigera.Dirigera",
  "name": "Dirigera",
  "hubs": [
    {
      "host": "192.168.1.10",
      "name": "Home",
      "token": "<read-only token from the custom UI>",
      "exposeConfiguredDevicesOnly": true,
      "devices": {
        "a-device-id": {
          "expose": true,
          "asDoor": true,
          "name": "Back Door",
          "type": "openCloseSensor",
          "roomName": "Mudroom"
        },
        "another-device-id": {
          "expose": false,
          "name": "Outlet Managed Elsewhere",
          "type": "outlet"
        }
      }
    }
  ]
}
```

If `exposeConfiguredDevicesOnly` is omitted or false, the plugin keeps the older behavior and exposes supported devices unless a device has `"expose": false`.
