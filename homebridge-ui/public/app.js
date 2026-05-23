;(function () {
  const PLUGIN_NAME = 'homebridge-dirigera'
  const PLATFORM_NAME = 'Dirigera'
  const QUALIFIED_PLATFORM_NAME = `${PLUGIN_NAME}.${PLATFORM_NAME}`
  const PLATFORM_NAME_ALIASES = new Set([
    PLATFORM_NAME,
    QUALIFIED_PLATFORM_NAME,
    '@uboness/homebridge-dirigera.Dirigera',
  ])

  const DEVICE_TYPE_LABELS = {
    light: 'Light Bulb',
    outlet: 'Outlet',
    openCloseSensor: 'Contact Sensor',
  }

  const app = document.getElementById('app')
  const hb = window.homebridge
  const state = {
    pluginConfig: [],
    platformConfig: null,
    devicesByHub: {},
    modal: null,
    updateTimer: null,
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
  }

  function getErrorMessage(err) {
    if (!err) return 'Unknown error'
    if (typeof err === 'string') return err
    if (err.message) return err.message
    if (err.error) return err.error
    return JSON.stringify(err)
  }

  function notify(type, message, title) {
    if (hb?.toast?.[type]) {
      hb.toast[type](message, title)
    }
  }

  function truncateMiddle(value, head = 10, tail = 8) {
    const text = String(value || '')
    if (text.length <= head + tail + 3) return text
    return `${text.slice(0, head)}...${text.slice(-tail)}`
  }

  function normalizeDeviceConfig(deviceConfig = {}) {
    const normalized = { ...deviceConfig }
    if (typeof normalized.expose !== 'boolean') {
      delete normalized.expose
    }
    normalized.asSwitch = Boolean(normalized.asSwitch)
    return normalized
  }

  function normalizeHub(hub = {}) {
    const normalized = {
      ...hub,
      host: String(hub.host || '').trim(),
      name: String(hub.name || '').trim(),
      token: String(hub.token || '').trim(),
      exposeConfiguredDevicesOnly: Boolean(hub.exposeConfiguredDevicesOnly),
      devices: {},
    }

    Object.entries(hub.devices || {}).forEach(([id, deviceConfig]) => {
      if (!String(id).trim()) return
      normalized.devices[id] = normalizeDeviceConfig(deviceConfig)
    })

    return normalized
  }

  function ensurePlatformConfig(pluginConfig) {
    const blocks = Array.isArray(pluginConfig) ? pluginConfig : []
    let platformConfig = blocks.find((block) => PLATFORM_NAME_ALIASES.has(block.platform))

    if (!platformConfig) {
      platformConfig = blocks.find((block) => Array.isArray(block.hubs))
    }

    if (!platformConfig) {
      platformConfig = {
        platform: QUALIFIED_PLATFORM_NAME,
        name: PLATFORM_NAME,
        hubs: [],
      }
      blocks.push(platformConfig)
    }

    platformConfig.platform = QUALIFIED_PLATFORM_NAME
    platformConfig.name = platformConfig.name || PLATFORM_NAME
    platformConfig.hubs = Array.isArray(platformConfig.hubs) ? platformConfig.hubs.map(normalizeHub) : []

    state.pluginConfig = blocks
    state.platformConfig = platformConfig
  }

  function hubTitle(hub, index) {
    return hub.name || hub.host || `DIRIGERA Hub ${index + 1}`
  }

  function deviceTypeLabel(type) {
    return DEVICE_TYPE_LABELS[type] || type || 'Device'
  }

  function getHubDevices(hubIndex) {
    const discovered = state.devicesByHub[hubIndex]
    if (Array.isArray(discovered) && discovered.length) return discovered

    const hub = state.platformConfig.hubs[hubIndex]
    return Object.entries(hub.devices || {})
      .map(([id, deviceConfig]) => ({
        id,
        name: deviceConfig.name || id,
        type: deviceConfig.type || '',
        roomName: deviceConfig.roomName || '',
        model: deviceConfig.model || '',
        manufacturer: deviceConfig.manufacturer || '',
        capabilities: {},
      }))
      .sort((left, right) => {
        const roomCompare = String(left.roomName || '').localeCompare(String(right.roomName || ''))
        if (roomCompare !== 0) return roomCompare
        return String(left.name || '').localeCompare(String(right.name || ''))
      })
  }

  function getDeviceConfig(hub, deviceId) {
    hub.devices = hub.devices || {}
    hub.devices[deviceId] = normalizeDeviceConfig(hub.devices[deviceId])
    return hub.devices[deviceId]
  }

  function isDeviceExposed(hub, deviceId) {
    const deviceConfig = hub.devices?.[deviceId]
    if (!deviceConfig) return !hub.exposeConfiguredDevicesOnly
    if (hub.exposeConfiguredDevicesOnly) return deviceConfig.expose === true
    return deviceConfig.expose !== false
  }

  function capabilityPills(device) {
    const capabilities = device.capabilities || {}
    const labels = []

    if (capabilities.contact) labels.push('Contact')
    if (capabilities.power) labels.push('Power')
    if (capabilities.brightness) labels.push('Brightness')
    if (capabilities.colorTemperature) labels.push('Temperature')
    if (capabilities.color) labels.push('Color')
    if (capabilities.battery) labels.push('Battery')

    return labels.length
      ? `<div class="capability-list">${labels
          .map((label) => `<span class="capability-pill">${escapeHtml(label)}</span>`)
          .join('')}</div>`
      : ''
  }

  function fieldHtml(hubIndex, field, label, options = {}) {
    const hub = state.platformConfig.hubs[hubIndex]
    const type = options.type || 'text'
    const value = escapeHtml(hub[field] || '')
    const placeholder = options.placeholder ? `placeholder="${escapeHtml(options.placeholder)}"` : ''

    return `
      <div class="${options.wide ? 'wide' : ''}">
        <label class="form-label" for="hub-${hubIndex}-${field}">${escapeHtml(label)}</label>
        <input
          id="hub-${hubIndex}-${field}"
          class="form-control ${options.secret ? 'secret-value' : ''}"
          data-hub-index="${hubIndex}"
          data-hub-field="${field}"
          type="${type}"
          value="${value}"
          ${placeholder}
          ${options.readonly ? 'readonly' : ''}
          autocomplete="${type === 'password' ? 'new-password' : 'off'}"
        />
        ${options.note ? `<div class="field-note">${escapeHtml(options.note)}</div>` : ''}
      </div>
    `
  }

  function renderDeviceRow(hub, hubIndex, device) {
    const deviceConfig = getDeviceConfig(hub, device.id)
    const exposed = isDeviceExposed(hub, device.id)
    const meta = [device.roomName, deviceTypeLabel(device.type), device.model, device.manufacturer].filter(Boolean).join(' | ')
    const allowAsSwitch = device.type === 'light' || device.type === 'outlet'
    const allowAsDoor = device.type === 'openCloseSensor'

    return `
      <div class="device-row ${exposed ? '' : 'excluded'}">
        <input
          type="checkbox"
          data-hub-index="${hubIndex}"
          data-device-id="${escapeHtml(device.id)}"
          data-device-field="expose"
          ${exposed ? 'checked' : ''}
        />
        <div>
          <span class="device-title">${escapeHtml(device.name || device.id)}</span>
          <div class="device-meta">${escapeHtml(meta || deviceTypeLabel(device.type))}</div>
          <div class="device-meta device-id">${escapeHtml(device.id)}</div>
          ${capabilityPills(device)}
        </div>
        <div class="device-actions">
          <span class="status-pill ${exposed ? 'ready' : 'off'}">${exposed ? 'Exposed' : 'Excluded'}</span>
          ${
            allowAsSwitch
              ? `<label class="as-switch">
                  <input
                    type="checkbox"
                    data-hub-index="${hubIndex}"
                    data-device-id="${escapeHtml(device.id)}"
                    data-device-field="asSwitch"
                    ${deviceConfig.asSwitch ? 'checked' : ''}
                  />
                  <span>As switch</span>
                </label>`
              : ''
          }
          ${
            allowAsDoor
              ? `<label class="as-switch">
                  <input
                    type="checkbox"
                    data-hub-index="${hubIndex}"
                    data-device-id="${escapeHtml(device.id)}"
                    data-device-field="asDoor"
                    ${deviceConfig.asDoor ? 'checked' : ''}
                  />
                  <span>As door</span>
                </label>`
              : ''
          }
        </div>
      </div>
    `
  }

  function renderDeviceList(hub, hubIndex) {
    const devices = getHubDevices(hubIndex)
    if (!devices.length) {
      return '<div class="empty-state">No supported devices have been loaded for this hub.</div>'
    }

    return `
      <div class="button-row">
        <button type="button" class="btn btn-outline-primary" data-action="select-all-devices" data-hub-index="${hubIndex}">Select All</button>
        <button type="button" class="btn btn-outline-secondary" data-action="clear-all-devices" data-hub-index="${hubIndex}">Clear All</button>
      </div>
      <div class="device-list">
        ${devices.map((device) => renderDeviceRow(hub, hubIndex, device)).join('')}
      </div>
    `
  }

  function renderHub(hub, index) {
    const token = hub.token || ''
    const devices = getHubDevices(index)
    const selectedCount = devices.filter((device) => isDeviceExposed(hub, device.id)).length
    const detailsOpen = index === 0 || !hub.host || devices.length > 0

    return `
      <details class="hub-card" ${detailsOpen ? 'open' : ''}>
        <summary>
          <span class="summary-main">
            <span class="summary-title">${escapeHtml(hubTitle(hub, index))}</span>
            <span class="hub-meta">${escapeHtml(hub.host || 'Host not set')} | ${selectedCount} selected</span>
          </span>
          <span class="status-pill ${token ? 'ready' : 'blocked'}">${token ? 'Paired' : 'Needs token'}</span>
        </summary>
        <div class="hub-body">
          <div class="field-grid">
            ${fieldHtml(index, 'host', 'Host / IP', { placeholder: '192.168.1.10' })}
            ${fieldHtml(index, 'name', 'Name', { placeholder: 'Home' })}
            ${
              token
                ? fieldHtml(index, 'token', 'Access Token', {
                    type: 'password',
                    readonly: true,
                    secret: true,
                    wide: true,
                    note: `Stored token: ${truncateMiddle(token)}`,
                  })
                : ''
            }
          </div>

          <label class="switch-panel">
            <input
              type="checkbox"
              data-hub-index="${index}"
              data-hub-field="exposeConfiguredDevicesOnly"
              ${hub.exposeConfiguredDevicesOnly ? 'checked' : ''}
            />
            <span>
              <strong>Only expose selected devices</strong>
              <span class="field-note">Newly discovered devices stay excluded until selected.</span>
            </span>
          </label>

          <div class="button-row">
            <button type="button" class="btn btn-primary" data-action="pair-hub" data-hub-index="${index}" ${hub.host ? '' : 'disabled'}>
              Pair Hub
            </button>
            <button type="button" class="btn btn-outline-primary" data-action="find-devices" data-hub-index="${index}" ${
              hub.host && hub.token ? '' : 'disabled'
            }>
              Find Devices
            </button>
            <button type="button" class="btn btn-outline-danger" data-action="confirm-remove-hub" data-hub-index="${index}">
              Remove Hub
            </button>
          </div>

          ${renderDeviceList(hub, index)}
        </div>
      </details>
    `
  }

  function render() {
    const hubs = state.platformConfig.hubs

    app.innerHTML = `
      <div class="ui-shell">
        <div class="topbar">
          <div>
            <h2>DIRIGERA</h2>
            <p>Pair hubs and choose the contact sensors, bulbs, and outlets Homebridge should publish.</p>
          </div>
          <button type="button" class="btn btn-primary" data-action="add-hub">Add Hub</button>
        </div>

        <section class="panel">
          <div class="section-heading section-heading-action">
            <span class="section-number">1</span>
            <div>
              <h3>Hubs and Devices</h3>
              <p>${hubs.length ? `${hubs.length} hub configuration${hubs.length === 1 ? '' : 's'}` : 'No hubs configured'}</p>
            </div>
          </div>
          ${
            hubs.length
              ? `<div class="hub-list">${hubs.map(renderHub).join('')}</div>`
              : '<div class="empty-state">Add a DIRIGERA hub to start pairing.</div>'
          }
        </section>
      </div>
    `
  }

  function sanitizeDeviceConfig(deviceConfig) {
    const clone = { ...deviceConfig }
    Object.keys(clone).forEach((key) => {
      if (clone[key] === '' || clone[key] === undefined || clone[key] === null) delete clone[key]
    })
    if (!clone.asSwitch) delete clone.asSwitch
    if (!clone.asDoor) delete clone.asDoor
    return clone
  }

  function sanitizeHub(hub) {
    const clone = {
      ...hub,
      host: String(hub.host || '').trim(),
      name: String(hub.name || '').trim(),
      token: String(hub.token || '').trim(),
      exposeConfiguredDevicesOnly: Boolean(hub.exposeConfiguredDevicesOnly),
      devices: {},
    }

    Object.entries(hub.devices || {}).forEach(([id, deviceConfig]) => {
      const sanitized = sanitizeDeviceConfig(deviceConfig)
      if (Object.keys(sanitized).length) clone.devices[id] = sanitized
    })

    if (!clone.name) delete clone.name
    if (!clone.token) delete clone.token
    if (!Object.keys(clone.devices).length) delete clone.devices
    if (!clone.exposeConfiguredDevicesOnly) delete clone.exposeConfiguredDevicesOnly

    return clone
  }

  function getSanitizedPluginConfig() {
    return state.pluginConfig.map((block) => {
      if (block !== state.platformConfig) return block

      return {
        ...block,
        platform: QUALIFIED_PLATFORM_NAME,
        name: block.name || PLATFORM_NAME,
        hubs: state.platformConfig.hubs
          .map(sanitizeHub)
          .filter((hub) => hub.host || hub.name || hub.token || hub.devices),
      }
    })
  }

  async function updateConfig() {
    await hb.updatePluginConfig(getSanitizedPluginConfig())
  }

  function scheduleUpdate() {
    clearTimeout(state.updateTimer)
    state.updateTimer = setTimeout(() => {
      updateConfig().catch((err) => notify('error', getErrorMessage(err), 'Config Update Failed'))
    }, 350)
  }

  async function flushUpdate() {
    clearTimeout(state.updateTimer)
    await updateConfig()
  }

  function openModal(title, body, footer) {
    closeModal()

    const modal = document.createElement('div')
    modal.className = 'modal-backdrop-custom'
    modal.innerHTML = `
      <div class="modal-panel" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}">
        <div class="modal-header-custom">
          <h4>${escapeHtml(title)}</h4>
          <button type="button" class="btn-close" aria-label="Close" data-action="close-modal"></button>
        </div>
        <div class="modal-body-custom">
          ${body}
          ${footer || '<div class="button-row"><button type="button" class="btn btn-secondary" data-action="close-modal">Close</button></div>'}
        </div>
      </div>
    `

    document.body.appendChild(modal)
    state.modal = modal
  }

  function closeModal() {
    state.modal?.remove()
    state.modal = null
  }

  function loadingHtml(message) {
    return `
      <div class="spinner-inline">
        <span class="spinner-border spinner-border-sm" role="status"></span>
        <span>${escapeHtml(message)}</span>
      </div>
    `
  }

  function getHub(index) {
    return state.platformConfig.hubs[Number(index)]
  }

  function addHub() {
    state.platformConfig.hubs.push({
      host: '',
      name: '',
      token: '',
      exposeConfiguredDevicesOnly: true,
      devices: {},
    })
    render()
  }

  function confirmRemoveHub(index) {
    const hub = getHub(index)
    if (!hub) return

    openModal(
      `Remove ${hubTitle(hub, Number(index))}`,
      '<p>This removes the hub and its saved device selections from the staged plugin config.</p>',
      `<div class="button-row">
        <button type="button" class="btn btn-danger" data-action="remove-hub" data-hub-index="${index}">Remove Hub</button>
        <button type="button" class="btn btn-secondary" data-action="close-modal">Cancel</button>
      </div>`,
    )
  }

  function removeHub(index) {
    state.platformConfig.hubs.splice(Number(index), 1)
    delete state.devicesByHub[index]
    closeModal()
    scheduleUpdate()
    render()
  }

  async function pairHub(index) {
    const hub = getHub(index)
    if (!hub?.host) return

    openModal(
      'Pair DIRIGERA',
      `
        <p>Press the Action Button on the bottom of the DIRIGERA hub after starting pairing.</p>
        <p class="inline-note">The token will be staged as a read-only field when pairing succeeds.</p>
      `,
      `<div class="button-row">
        <button type="button" class="btn btn-primary" data-action="start-pair-hub" data-hub-index="${index}">Start Pairing</button>
        <button type="button" class="btn btn-secondary" data-action="close-modal">Cancel</button>
      </div>`,
    )
  }

  async function startPairHub(index) {
    const hub = getHub(index)
    if (!hub?.host) return

    openModal('Pairing DIRIGERA', loadingHtml('Waiting for the hub button press...'), '')

    try {
      await flushUpdate()
      const result = await hb.request('/dirigera-authenticate', { host: hub.host })
      hub.token = result.accessToken
      if (!hub.name && result.hub?.name) hub.name = result.hub.name
      await updateConfig()
      notify('success', 'DIRIGERA access token is staged. Use the Homebridge Save button to write it.', 'Hub Paired')
      closeModal()
      render()
      await findDevices(index)
    } catch (err) {
      openModal(
        'DIRIGERA Pairing Failed',
        `<p>${escapeHtml(getErrorMessage(err))}</p>`,
        `<div class="button-row">
          <button type="button" class="btn btn-primary" data-action="pair-hub" data-hub-index="${index}">Try Again</button>
          <button type="button" class="btn btn-secondary" data-action="close-modal">Close</button>
        </div>`,
      )
    }
  }

  function mergeDiscoveredDevices(hub, devices) {
    hub.devices = hub.devices || {}
    hub.exposeConfiguredDevicesOnly = true

    devices.forEach((device) => {
      const existing = normalizeDeviceConfig(hub.devices[device.id])
      hub.devices[device.id] = {
        ...existing,
        expose: typeof existing.expose === 'boolean' ? existing.expose : false,
        name: device.name,
        type: device.type,
        roomName: device.roomName,
        model: device.model,
        manufacturer: device.manufacturer,
      }
    })
  }

  async function findDevices(index) {
    const hub = getHub(index)
    if (!hub?.host || !hub?.token) return

    openModal('Finding Devices', loadingHtml('Reading supported devices from DIRIGERA...'), '')

    try {
      await flushUpdate()
      const devices = await hb.request('/dirigera-devices', {
        host: hub.host,
        token: hub.token,
      })
      state.devicesByHub[index] = devices
      mergeDiscoveredDevices(hub, devices)
      await updateConfig()
      notify('success', `${devices.length} supported device${devices.length === 1 ? '' : 's'} loaded.`, 'Devices Found')
      closeModal()
      render()
    } catch (err) {
      openModal('Could Not Find Devices', `<p>${escapeHtml(getErrorMessage(err))}</p>`)
    }
  }

  function updateDeviceConfig(target) {
    const hub = getHub(target.getAttribute('data-hub-index'))
    const deviceId = target.getAttribute('data-device-id')
    const field = target.getAttribute('data-device-field')
    if (!hub || !deviceId || !field) return false

    const deviceConfig = getDeviceConfig(hub, deviceId)
    deviceConfig[field] = target.checked
    hub.exposeConfiguredDevicesOnly = true

    scheduleUpdate()
    render()
    return true
  }

  function setAllDevices(index, expose) {
    const hub = getHub(index)
    if (!hub) return

    getHubDevices(index).forEach((device) => {
      const deviceConfig = getDeviceConfig(hub, device.id)
      deviceConfig.expose = expose
    })
    hub.exposeConfiguredDevicesOnly = true
    scheduleUpdate()
    render()
  }

  function updateHubField(target) {
    const hub = getHub(target.getAttribute('data-hub-index'))
    const field = target.getAttribute('data-hub-field')
    if (!hub || !field) return false

    if (target.type === 'checkbox') {
      hub[field] = target.checked
      render()
    } else {
      hub[field] = target.value
    }

    scheduleUpdate()
    return true
  }

  function handleInput(event) {
    const target = event.target
    if (target?.matches?.('[data-hub-field]') && target.type !== 'checkbox') {
      updateHubField(target)
    }
  }

  function handleChange(event) {
    const target = event.target
    if (target?.matches?.('[data-device-field]')) {
      updateDeviceConfig(target)
      return
    }

    if (target?.matches?.('[data-hub-field]')) {
      updateHubField(target)
    }
  }

  function handleClick(event) {
    const actionTarget = event.target.closest('[data-action]')
    if (!actionTarget || actionTarget.disabled) {
      if (event.target.classList.contains('modal-backdrop-custom')) closeModal()
      return
    }

    const action = actionTarget.getAttribute('data-action')
    const hubIndex = actionTarget.getAttribute('data-hub-index')

    switch (action) {
      case 'add-hub':
        addHub()
        break
      case 'confirm-remove-hub':
        confirmRemoveHub(hubIndex)
        break
      case 'remove-hub':
        removeHub(hubIndex)
        break
      case 'pair-hub':
        pairHub(hubIndex)
        break
      case 'start-pair-hub':
        startPairHub(hubIndex)
        break
      case 'find-devices':
        findDevices(hubIndex)
        break
      case 'select-all-devices':
        setAllDevices(hubIndex, true)
        break
      case 'clear-all-devices':
        setAllDevices(hubIndex, false)
        break
      case 'close-modal':
        closeModal()
        break
    }
  }

  function renderError(message) {
    app.innerHTML = `<div class="panel"><p>${escapeHtml(message)}</p></div>`
  }

  async function init() {
    if (!hb) {
      renderError('The Homebridge custom UI API is not available in this window.')
      return
    }

    try {
      const pluginConfig = await hb.getPluginConfig()
      ensurePlatformConfig(pluginConfig)
      render()
    } catch (err) {
      renderError(getErrorMessage(err))
    }
  }

  app.addEventListener('input', handleInput)
  app.addEventListener('change', handleChange)
  document.addEventListener('click', handleClick)

  init()
})()
