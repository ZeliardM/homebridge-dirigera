let RequestErrorClass

const SUPPORTED_DEVICE_TYPES = new Set(['light', 'outlet', 'openCloseSensor'])

function requestError(message, status = 400) {
  if (RequestErrorClass) return new RequestErrorClass(message, { status })

  const err = new Error(message)
  err.requestError = { status }
  return err
}

function getRequiredString(payload, field, label) {
  const value = String(payload?.[field] || '').trim()
  if (!value) throw requestError(`${label} is required.`)
  return value
}

function deviceName(device) {
  return device?.attributes?.customName || device?.attributes?.model || device?.id || 'Unnamed Device'
}

function deviceSummary(device) {
  const attributes = device?.attributes || {}

  return {
    id: device.id,
    name: deviceName(device),
    type: device.deviceType || device.type || '',
    roomName: device.room?.name || '',
    model: attributes.model || '',
    manufacturer: attributes.manufacturer || '',
    serialNumber: attributes.serialNumber || '',
    firmwareVersion: attributes.firmwareVersion || '',
    isReachable: Boolean(device.isReachable),
    capabilities: {
      power: typeof attributes.isOn === 'boolean',
      brightness: typeof attributes.lightLevel === 'number',
      colorTemperature: typeof attributes.colorTemperature === 'number',
      color: typeof attributes.colorHue === 'number' || typeof attributes.colorSaturation === 'number',
      battery: typeof attributes.batteryPercentage === 'number',
      contact: typeof attributes.isOpen === 'boolean',
    },
  }
}

async function createClient(payload, options = {}) {
  const host = getRequiredString(payload, 'host', 'DIRIGERA host')
  const { createDirigeraClient } = await import('dirigera')

  return createDirigeraClient({
    gatewayIP: host,
    accessToken: options.requireToken ? getRequiredString(payload, 'token', 'DIRIGERA access token') : payload?.token,
    rejectUnauthorized: false,
  })
}

;(async () => {
  const { HomebridgePluginUiServer, RequestError } = await import('@homebridge/plugin-ui-utils')
  RequestErrorClass = RequestError

  class DirigeraUiServer extends HomebridgePluginUiServer {
    constructor() {
      super()

      this.onRequest('/dirigera-authenticate', this.authenticate.bind(this))
      this.onRequest('/dirigera-status', this.status.bind(this))
      this.onRequest('/dirigera-devices', this.listDevices.bind(this))

      this.ready()
    }

    async authenticate(payload) {
      const client = await createClient(payload)
      if (typeof client.authenticate !== 'function') {
        throw requestError('The installed dirigera library does not expose UI pairing support.', 500)
      }

      const accessToken = await client.authenticate({ verbose: false })
      let info
      try {
        const authenticatedClient = await createClient({ ...payload, token: accessToken }, { requireToken: true })
        info = await authenticatedClient.hub.status()
      } catch (_err) {
        info = undefined
      }

      return {
        accessToken,
        hub: {
          id: info?.attributes?.serialNumber || '',
          name: info?.attributes?.customName || '',
        },
      }
    }

    async status(payload) {
      const client = await createClient(payload, { requireToken: true })
      const info = await client.hub.status()

      return {
        id: info?.attributes?.serialNumber || '',
        name: info?.attributes?.customName || '',
        firmwareVersion: info?.attributes?.firmwareVersion || '',
      }
    }

    async listDevices(payload) {
      const client = await createClient(payload, { requireToken: true })
      const devices = await client.devices.list()

      return devices
        .filter((device) => SUPPORTED_DEVICE_TYPES.has(device.deviceType))
        .map(deviceSummary)
        .sort((left, right) => {
          const roomCompare = left.roomName.localeCompare(right.roomName)
          if (roomCompare !== 0) return roomCompare
          return left.name.localeCompare(right.name)
        })
    }
  }

  return new DirigeraUiServer()
})().catch((err) => {
  console.error(err)
  process.exit(1)
})
