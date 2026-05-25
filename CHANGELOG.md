# Changelog

All notable changes to this project will be documented in this file. See [commit-and-tag-version](https://github.com/absolute-version/commit-and-tag-version) for commit guidelines.

## [1.0.0](https://github.com/ZeliardM/homebridge-dirigera/compare/v0.3.0...v1.0.0) (2026-05-23)

### Features

* renamed the package to `homebridge-dirigera` and declared Homebridge 2.0 / Node 22-24 compatibility
* added a custom Homebridge Config UI for pairing DIRIGERA hubs, storing read-only tokens, discovering devices, and selecting exposed contact sensors, bulbs, and outlets
* added per-device exposure filtering so excluded DIRIGERA devices are not registered with Homebridge
* added door exposure mode for DIRIGERA contact sensors without publishing a separate contact sensor service
* added battery service support for DIRIGERA contact sensors exposed as HomeKit doors
* added adaptive lighting registration for bulbs that support brightness and color temperature
* added DIRIGERA reachability tracking so offline devices report HomeKit communication failures instead of stale state

### Bug Fixes

* fixed DIRIGERA light color temperature clamping and HomeKit mired conversion
* fixed contact sensor state mapping to use explicit HomeKit contact states
* fixed outlet and switch state updates to preserve existing cached attributes
* fixed unavailable lights preserving or re-applying stale on/brightness values after DIRIGERA reports them offline
* fixed unavailable contact sensors and door-mode sensors accepting stale state updates while unreachable
* fixed noisy Homebridge read-handler warnings when HomeKit polls unreachable devices

## [0.3.0](https://github.com/uboness/homebridge-dirigera/compare/v0.2.6...v0.3.0) (2025-08-12)


### Features

* moved to pnpm ([85fb912](https://github.com/uboness/homebridge-dirigera/commit/85fb9121c06af372550e46e39ef7030d08d8a637))

## [0.2.6](https://github.com/uboness/homebridge-dirigera/compare/v0.2.5...v0.2.6) (2025-04-01)

## [0.2.5](https://github.com/uboness/homebridge-dirigera/compare/v0.2.4...v0.2.5) (2025-04-01)

## [0.2.4](https://github.com/uboness/homebridge-dirigera/compare/v0.2.3...v0.2.4) (2024-12-27)

## [0.2.3](https://github.com/uboness/homebridge-dirigera/compare/v0.2.2...v0.2.3) (2024-12-22)


### Bug Fixes

* use of inner HB api (in logger) ([a476381](https://github.com/uboness/homebridge-dirigera/commit/a476381730a49d718fb30a9884404a198d5501d2))

## [0.2.2](https://github.com/uboness/homebridge-dirigera/compare/v0.2.1...v0.2.2) (2024-08-23)


### Bug Fixes

* unregister accessories with the now deprecated UUID which is based on the device type and serial number. ([9ded118](https://github.com/uboness/homebridge-dirigera/commit/9ded11869935e5665366415e814f2e5ec5f94643))

## [0.2.1](https://github.com/uboness/homebridge-dirigera/compare/v0.2.0...v0.2.1) (2024-08-23)


### Bug Fixes

* fixed the plugin name to include the plugin package scope (avoids having homebridge to auto-fix this mismatch) ([b378b53](https://github.com/uboness/homebridge-dirigera/commit/b378b53b84ea99e63d51e1b1e441c0bb23913e6a))
* unregister accessories with the now deprecated UUID which is based on the device type and serial number. ([5c2836e](https://github.com/uboness/homebridge-dirigera/commit/5c2836e75aefb3a57e2019f75d6d37c489d4c66e))

## [0.2.0](https://github.com/uboness/homebridge-dirigera/compare/v0.1.20...v0.2.0) (2024-08-23)


### ⚠ BREAKING CHANGES

* Before it was generated based on a tuple { hubId, deviceType, serialNumber} which worked fine for all IKEA devices which (today) are single devices. But when connecting 3rd party devices it can fail - for example, when you have a in-wall dual relay, each relay is considered a separate dirigera device which sharing a single physical device (hence also the same serial number). In such scenario, the only thing that differentiates these two devices is their associated dirigera id. This change will cause the existing registered accessories to deregister and register again under the new UUID (which will effectively cause the devices to be removed and re-added to homekit under the default room).

### Bug Fixes

* now UUID based on the dirigera `device.id`. ([881b738](https://github.com/uboness/homebridge-dirigera/commit/881b738a8f40ff1d68bb0dc65599b773867d6b3b))

## [0.1.20](https://github.com/uboness/homebridge-dirigera/compare/v0.1.19...v0.1.20) (2024-08-14)


### Bug Fixes

* cleaned up all the sensors ([7ee6098](https://github.com/uboness/homebridge-dirigera/commit/7ee6098740825193e53cff145b831002010623e2))

## [0.1.19](https://github.com/uboness/homebridge-dirigera/compare/v0.1.18...v0.1.19) (2024-04-04)


### Bug Fixes

* Outlet now works again ([af0e08b](https://github.com/uboness/homebridge-dirigera/commit/af0e08b29d30df15571e112496c987a3f9ee8e27))

## [0.1.18](https://github.com/uboness/homebridge-dirigera/compare/v0.1.17...v0.1.18) (2024-04-04)


### Features

* introduced `asSwitch` configuration ([94543f4](https://github.com/uboness/homebridge-dirigera/commit/94543f4b266162bd057a49cff003049b540caefa))

## [0.1.17](https://github.com/uboness/homebridge-dirigera/compare/v0.1.16...v0.1.17) (2024-03-30)


### Bug Fixes

* removed `console.log` and replaced it with `log.debug` ([3b3021f](https://github.com/uboness/homebridge-dirigera/commit/3b3021f57612bcb815b8a5042f1456228c373baf))

## [0.1.16](https://github.com/uboness/homebridge-dirigera/compare/v0.1.15...v0.1.16) (2024-03-08)


### Features

* Added support for `LeakSensor` (BADRING) ([adb0a8e](https://github.com/uboness/homebridge-dirigera/commit/adb0a8e8e733277221b61b8e8a648ecc41d8cdee))

## [0.1.15](https://github.com/uboness/homebridge-dirigera/compare/v0.1.14...v0.1.15) (2024-01-24)

## [0.1.14](https://github.com/uboness/homebridge-dirigera/compare/v0.1.13...v0.1.14) (2024-01-24)


### Features

* Added support for `ContactSensor`, `MotionSensor`, and `Outlet` ([dca60f5](https://github.com/uboness/homebridge-dirigera/commit/dca60f56d8260840d9fa6b6f33446bb05999d893))

## [0.1.13](https://github.com/uboness/homebridge-dirigera/compare/v0.1.12...v0.1.13) (2024-01-08)


### Bug Fixes

* **cleanup:** removed package-lock.json in favour of pnpm-lock.yaml ([ae0722a](https://github.com/uboness/homebridge-dirigera/commit/ae0722a95de5d0e6ee8e069d5779dc0415a0597b))

## [0.1.12](https://github.com/uboness/homebridge-dirigera/compare/v0.1.11...v0.1.12) (2024-01-08)


### Bug Fixes

* **auth:** instead of prompting the user to press "Enter" (LOL), the authentication process is now attempted 12 times (5 seconds between each attempt), giving the user 1 min to press the action button on the hub. After 1 min the authentication fails and the hub will be skipped ([d51c5f0](https://github.com/uboness/homebridge-dirigera/commit/d51c5f001672135f705a8865190097449e4f2939))

## [0.1.11](https://github.com/uboness/homebridge-dirigera/compare/v0.1.10...v0.1.11) (2023-12-12)


### Bug Fixes

* **schema:** added missing config schema file ([25a1100](https://github.com/uboness/homebridge-dirigera/commit/25a1100eae5b9a42ae35ecea0c709f5b7dcde879))

## [0.1.10](https://github.com/uboness/homebridge-dirigera/compare/v0.1.9...v0.1.10) (2023-12-12)

## [0.1.9](https://github.com/uboness/homebridge-dirigera/compare/v0.1.8...v0.1.9) (2023-12-12)

## [0.1.8](https://github.com/uboness/homebridge-dirigera/compare/v0.1.7...v0.1.8) (2023-12-12)

## [0.1.7](https://github.com/uboness/homebridge-dirigera/compare/v0.1.6...v0.1.7) (2023-12-12)

## [0.1.6](https://github.com/uboness/homebridge-dirigera/compare/v0.1.5...v0.1.6) (2023-12-12)

## [0.1.5](https://github.com/uboness/homebridge-dirigera/compare/v0.1.4...v0.1.5) (2023-12-12)

## [0.1.4](https://github.com/uboness/homebridge-dirigera/compare/v0.1.3...v0.1.4) (2023-12-12)

## [0.1.3](https://github.com/uboness/homebridge-dirigera/compare/v0.1.2...v0.1.3) (2023-12-12)

## [0.1.2](https://github.com/uboness/homebridge-dirigera/compare/v0.1.1...v0.1.2) (2023-12-12)


### Bug Fixes

* **dist:** Fixed `package.json` and removed unused files ([4f9bd31](https://github.com/uboness/homebridge-dirigera/commit/4f9bd31811d5cdf1e8a89e9ecdcefb41db1207e9))
* **git:** cleaned up git templates ([b5be71e](https://github.com/uboness/homebridge-dirigera/commit/b5be71e7e3ba1a78511a00ca7b6ef7a0cee83ab1))

## 0.1.1 (2023-12-12)
