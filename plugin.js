import { useEffect, useRef, useState } from 'react'
import { atom, haptic, icons, Popover, PopoverContent, PopoverTrigger, TITLEBAR_AREAS, useQuery, useValue } from '@hermes/plugin-sdk'
import { jsx, jsxs } from 'react/jsx-runtime'
const ID = 'weather'
// bump on every change; shown in tooltip so we can verify the running copy
const VERSION = 'v1.0.1'
// WMO weather codes -> [label, emoji] (Open-Meteo weather_code)
const WMO = {
  0: ['Clear', '☀️'],
  1: ['Mostly clear', '🌤️'],
  2: ['Partly cloudy', '⛅'],
  3: ['Cloudy', '☁️'],
  45: ['Foggy', '🌫️'],
  48: ['Foggy', '🌫️'],
  51: ['Light drizzle', '🌦️'],
  53: ['Drizzle', '🌦️'],
  55: ['Heavy drizzle', '🌧️'],
  56: ['Freezing drizzle', '🌧️'],
  57: ['Freezing drizzle', '🌧️'],
  61: ['Light rain', '🌦️'],
  63: ['Rain', '🌧️'],
  65: ['Heavy rain', '🌧️'],
  66: ['Freezing rain', '🌧️'],
  67: ['Freezing rain', '🌧️'],
  71: ['Light snow', '🌨️'],
  73: ['Snow', '🌨️'],
  75: ['Heavy snow', '❄️'],
  77: ['Snow grains', '🌨️'],
  80: ['Light showers', '🌦️'],
  81: ['Showers', '🌧️'],
  82: ['Heavy showers', '⛈️'],
  85: ['Snow showers', '🌨️'],
  86: ['Snow showers', '🌨️'],
  95: ['Thunderstorm', '⛈️'],
  96: ['Thunderstorm with hail', '⛈️'],
  99: ['Thunderstorm with hail', '⛈️']
}
const COL_DAY_W = 150
const COL_GAP = 8
const ZOOMS = [
  ['weekly', 'Weekly'],
  ['monthly', 'Monthly'],
  ['yearly', 'Yearly']
]
function wmo(code, isDay) {
  if (code == null) return ['Unknown', '❓']
  if (code === 0) return isDay ? ['Clear', '☀️'] : ['Clear night', '🌙']
  if (!isDay) {
    if (code === 1) return ['Mostly clear', '🌙']
    if (code === 2) return ['Partly cloudy', '☁️']
  }
  return WMO[code] || ['Unknown', '❓']
}
function majorityCode(codes) {
  const dry = [], wet = []
  for (const c of codes ?? []) {
    if (c == null) continue
    ;(wmoClass(c) >= 2 ? wet : dry).push(c)
  }
  const dryInteresting = dry.filter((c) => wmoClass(c) > 0)
  const pick = (arr) => {
    if (!arr.length) return null
    const m = new Map()
    let best = arr[0], n = 0
    for (const c of arr) {
      const k = m.get(c) ?? 0
      m.set(c, k + 1)
      if (k + 1 > n) { n = k + 1; best = c }
    }
    return best
  }
  if (wet.length && wet.length > dry.length) return pick(wet)
  return pick(dry.length ? dry : wet)
}
function wmoClass(code) {
  if (code == null) return 0
  if (code <= 3 || code === 45 || code === 48) return 0
  if (code >= 51 && code <= 57) return 2
  if (code >= 61 && code <= 67) return 3
  if (code >= 71 && code <= 77) return 4
  if (code >= 80 && code <= 82) return 5
  if (code >= 85 && code <= 86) return 4
  if (code >= 95 && code <= 99) return 6
  return 0
}
function badWindows(codes, times) {
  const wins = []
  let i = 0
  while (i < codes.length) {
    const c = codes[i]
    if (c != null && wmoClass(c) >= 2) {
      let j = i
      while (j + 1 < codes.length && wmoClass(codes[j + 1]) >= 2) j++
      wins.push({
        startIdx: i,
        endIdx: j,
        startH: (times?.[i] ?? '').slice(11, 16) || `${i}:00`,
        endH: (times?.[j] ?? '').slice(11, 16),
        hours: j - i + 1,
        code: codes[i]
      })
      i = j + 1
    } else {
      i++
    }
  }
  return wins
}
function tVal(c) { return c == null ? null : unitAtom.get() === 'F' ? c * 9 / 5 + 32 : c }
function dispTemp(c) { const v = tVal(c); return v == null ? '\u2014\u00b0' : `${Math.round(v)}\u00b0` }
function dispWind(kmh) {
  if (kmh == null) return '\u2014'
  return unitAtom.get() === 'F' ? `${Math.round(kmh * 0.621371)} mph` : `${kmh} km/h`
}
function dispTempUnit(c) { const v = tVal(c); return v == null ? '\u2014\u00b0C'.slice(0, -1) + (unitAtom.get()) : `${Math.round(v)}\u00b0${unitAtom.get()}` }
function hr12(hm) {
  const h = parseInt(String(hm).slice(0, 2), 10)
  if (isNaN(h)) return hm
  const suffix = h < 12 ? 'am' : 'pm'
  const hh = h % 12 === 0 ? 12 : h % 12
  return `${hh}${suffix}`
}
function aqiInfo(v) {
  if (v == null) return ['\u2014', 'var(--ui-text-quaternary)']
  if (v <= 50) return ['Good', 'var(--ui-text-tertiary)']
  if (v <= 100) return ['Moderate', 'var(--ui-text-secondary)']
  if (v <= 150) return ['Unhealthy', 'var(--ui-accent)']
  if (v <= 200) return ['Unhealthy', 'var(--ui-accent)']
  if (v <= 300) return ['Very unhealthy', 'var(--ui-accent)']
  return ['Hazardous', 'var(--ui-accent)']
}
const manualAtom = atom('')
const autoAtom = atom(false) // auto-location is OPT-IN (privacy): sends public IP to ipwho.is, off until user enables
const unitAtom = atom('C')
const savedLocsAtom = atom([])
const aqAtom = atom(true)
const sunAtom = atom(true)
const chartsOpenAtom = atom(false)
const hourlyOpenAtom = atom(false)
const forecastOpenAtom = atom(false)
const editingAtom = atom(false)
const draftAtom = atom('')
const zoomAtom = atom('monthly')
let storage
function setAuto(on) {
  autoAtom.set(on)
  try {
    storage?.set('auto', on ? '1' : '0')
  } catch {
  }
}
// thin wrapper: set a boolean atom + persist '0'/'1' (single source for toggle behavior)
function makeToggle(atom_, key) {
  return (v) => { atom_.set(v); try { storage?.set(key, v ? '1' : '0') } catch {} }
}
const setCharts = makeToggle(chartsOpenAtom, 'charts')
const setHourly = makeToggle(hourlyOpenAtom, 'hourly')
const setForecast = makeToggle(forecastOpenAtom, 'forecast')
function removeSaved(name) {
  const next = (savedLocsAtom.get() || []).filter((x) => x.name !== name)
  savedLocsAtom.set(next)
  try {
    storage?.set('savedLocations', JSON.stringify(next))
  } catch {}
}
function switchTo(name) {
  manualAtom.set(name)
  setAuto(false)
  draftAtom.set('')
  editingAtom.set(false)
  try {
    storage?.set('location', name)
  } catch {}
}
function setLocation(name) {
  manualAtom.set(name)
  setAuto(false)
  draftAtom.set('')
  editingAtom.set(false)
  try {
    storage?.set('location', name)
    const cur = (savedLocsAtom.get() || []).filter((x) => x.name.toLowerCase() !== name.toLowerCase())
    const next = [{ name }, ...cur].slice(0, 3)
    savedLocsAtom.set(next)
    storage?.set('savedLocations', JSON.stringify(next))
  } catch {
  }
}
function isoDaysAgo(days) {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10)
}
async function jfetch(url, ms = 15000) {
  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort(), ms)
  try {
    const res = await fetch(url, { signal: ctl.signal })
    return res
  } finally {
    clearTimeout(t)
  }
}
async function ipWho() {
  const res = await jfetch('https://ipwho.is/')
  if (!res.ok) throw new Error(`location detection failed (${res.status})`)
  const d = await res.json()
  if (!d || d.success === false || !d.city) throw new Error('location detection failed')
  return { city: d.city, country: d.country }
}

async function geocode(name) {
  const url =
    'https://geocoding-api.open-meteo.com/v1/search?name=' +
    encodeURIComponent(name) +
    '&count=1&language=en&format=json'
  const res = await jfetch(url)
  if (!res.ok) throw new Error(`geocoding failed (${res.status})`)
  const data = await res.json()
  const hit = data.results?.[0]
  if (!hit) throw new Error(`Couldn't find "${name}"`)
  return { latitude: hit.latitude, longitude: hit.longitude, name: hit.name, country: hit.country }
}
async function forecast(lat, lon) {
  const url =
    'https://api.open-meteo.com/v1/forecast?latitude=' +
    lat +
    '&longitude=' +
    lon +
    '&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m' +
    '&hourly=weather_code,temperature_2m,is_day' +
    '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,sunrise,sunset,uv_index_max' +
    '&past_days=3' +
    '&forecast_days=7&timezone=auto'
  const res = await jfetch(url)
  if (!res.ok) throw new Error(`forecast failed (${res.status})`)
  return res.json()
}
async function history(lat, lon) {
  const end = isoDaysAgo(1)
  const start = isoDaysAgo(364)
  const url =
    'https://archive-api.open-meteo.com/v1/archive?latitude=' +
    lat +
    '&longitude=' +
    lon +
    '&start_date=' +
    start +
    '&end_date=' +
    end +
    '&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=auto'
  const res = await jfetch(url)
  if (!res.ok) throw new Error(`history failed (${res.status})`)
  return res.json()
}
async function airQuality(lat, lon) {
  const url =
    'https://air-quality-api.open-meteo.com/v1/air-quality?latitude=' +
    lat +
    '&longitude=' +
    lon +
    '&current=us_aqi,pm2_5&timezone=auto'
  const res = await jfetch(url)
  if (!res.ok) throw new Error(`air quality failed (${res.status})`)
  return res.json()
}
function useWeather() {
  const manual = useValue(manualAtom)
  const auto = useValue(autoAtom)
  const ip = useQuery({
    queryKey: ['weather', 'ip'],
    queryFn: ipWho,
    enabled: auto,
    staleTime: 6 * 60 * 60 * 1000,
    retry: 1
  })
  const loc = auto && ip.data?.city ? ip.data.city : manual
  const geo = useQuery({
    queryKey: ['weather', 'geo', loc],
    queryFn: () => geocode(loc),
    enabled: !!loc?.trim(),
    staleTime: 60 * 60 * 1000,
    retry: 1
  })
  const g = geo.data
  const fc = useQuery({
    queryKey: ['weather', 'fc', g?.latitude, g?.longitude],
    queryFn: () => forecast(g.latitude, g.longitude),
    enabled: !!g,
    staleTime: 5 * 60 * 1000,
    refetchInterval: 10 * 60 * 1000,
    retry: 2
  })
  const hist = useQuery({
    queryKey: ['weather', 'hist', g?.latitude, g?.longitude],
    queryFn: () => history(g.latitude, g.longitude),
    enabled: !!g,
    staleTime: 60 * 60 * 1000,
    retry: 2
  })
  const showAq = useValue(aqAtom)
  const aq = useQuery({
    queryKey: ['weather', 'aq', g?.latitude, g?.longitude],
    queryFn: () => airQuality(g.latitude, g.longitude),
    enabled: !!g && showAq,
    staleTime: 30 * 60 * 1000,
    retry: 1
  })
  return { loc, auto, ip, geo, fc, hist, aq }
}
function fmtDay(d) {
  return new Date(d + 'T12:00:00').toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short'
  })
}
function fmtWeekday(d) {
  return new Date(d + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short' })
}
function fmtMonthShort(key) {
  return new Date(key + '-01T12:00:00').toLocaleDateString(undefined, { month: 'short' })
}
function fmtMonthYear(d) {
  return new Date(d + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
}
function buildChartData(zoom, fc, hist) {
  if (zoom === 'weekly') {
    const d = fc?.daily
    const t = d?.time
    if (!t || !t.length) return null
    const pts = []
    for (let i = 0; i < t.length; i++) {
      pts.push({
        label: fmtWeekday(t[i] ?? ''),
        full: fmtDay(t[i] ?? ''),
        v: d.temperature_2m_max?.[i] ?? 0,
        v2: d.temperature_2m_min?.[i] ?? 0,
        r: d.precipitation_sum?.[i] ?? 0
      })
    }
    return {
      temp: pts,
      precip: pts,
      range: `${fmtDay(t[0])} – ${fmtDay(t[t.length - 1])}`
    }
  }
  if (!hist?.daily) return null
  const hd = hist.daily
  const ht = hd.time
  if (!ht || !ht.length) return null
  if (zoom === 'monthly') {
    const n = Math.min(30, ht.length)
    const pts = []
    for (let i = ht.length - n; i < ht.length; i++) {
      const dt = new Date((ht[i] ?? '') + 'T12:00:00')
      pts.push({
        label: String(dt.getDate()),
        full: dt.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }),
        v: hd.temperature_2m_max?.[i] ?? 0,
        v2: hd.temperature_2m_min?.[i] ?? 0,
        r: hd.precipitation_sum?.[i] ?? 0
      })
    }
    return {
      temp: pts,
      precip: pts,
      range: fmtMonthYear(ht[ht.length - 1])
    }
  }
  const byMonth = new Map()
  for (let i = 0; i < ht.length; i++) {
    const key = (ht[i] ?? '').slice(0, 7)
    const rec = byMonth.get(key) || { sumMax: 0, sumMin: 0, sumR: 0, n: 0 }
    rec.sumMax += hd.temperature_2m_max?.[i] ?? 0
    rec.sumMin += hd.temperature_2m_min?.[i] ?? 0
    rec.sumR += hd.precipitation_sum?.[i] ?? 0
    rec.n++
    byMonth.set(key, rec)
  }
  const entries = [...byMonth.entries()]
  const pts = entries.map(([key, rec]) => ({
    label: fmtMonthShort(key),
    full: `${fmtMonthShort(key)} ${key.slice(0, 4)}`,
    v: rec.sumMax / rec.n,
    v2: rec.sumMin / rec.n,
    r: rec.sumR
  }))
  const first = entries[0]?.[0]
  const last = entries[entries.length - 1]?.[0]
  return {
    temp: pts,
    precip: pts,
    range: `${fmtMonthShort(first ?? '')} ${(first ?? '').slice(0, 4)} – ${fmtMonthShort(last ?? '')} ${(last ?? '').slice(0, 4)}`
  }
}
const CHART_W = 400
function nearestIndex(e, pts, pad) {
  const rect = e.currentTarget.getBoundingClientRect()
  const fx = ((e.clientX - rect.left) / rect.width) * CHART_W
  const denom = Math.max(1, pts.length - 1)
  let idx = Math.round((fx - pad) / ((CHART_W - 2 * pad) / denom))
  idx = Math.max(0, Math.min(pts.length - 1, idx))
  return idx
}
function nearestSlot(e, pts, pad) {
  const rect = e.currentTarget.getBoundingClientRect()
  const fx = ((e.clientX - rect.left) / rect.width) * CHART_W
  const slot = (CHART_W - 2 * pad) / pts.length
  let idx = Math.floor((fx - pad) / slot)
  return Math.max(0, Math.min(pts.length - 1, idx))
}
function TempChart({ pts }) {
  const [hover, setHover] = useState(-1)
  const H = 94
  const PAD = 12
  const BAND = 18
  const vals = pts.flatMap((p) => [p.v, p.v2 ?? p.v])
  const lo = Math.min(...vals)
  const hi = Math.max(...vals)
  const span = hi - lo || 1
  const step = Math.max(1, Math.ceil(pts.length / 6))
  const slot = (CHART_W - 2 * PAD) / Math.max(1, pts.length)
  const x = (i) => PAD + i * slot + slot / 2
  const plotBot = H - BAND
  const y = (v) => H - BAND - ((v - lo) / span) * (plotBot - PAD)
  const line = pts.map((p, i) => `${x(i)},${y(p.v)}`).join(' ')
  const line2 = pts[0]?.v2 != null ? pts.map((p, i) => `${x(i)},${y(p.v2)}`).join(' ') : null
  const h = hover >= 0 ? pts[hover] : null
  const hx = hover >= 0 ? x(hover) : 0
  return jsxs('div', {
    className: 'relative',
    children: [
      jsx('svg', {
        viewBox: `0 0 ${CHART_W} ${H}`,
        className: 'w-full cursor-crosshair',
        style: { height: 94 },
        onMouseMove: (e) => setHover(nearestSlot(e, pts, PAD)),
        onMouseLeave: () => setHover(-1),
        children: [
          jsx('line', {
            x1: PAD,
            y1: y(hi),
            x2: CHART_W - PAD,
            y2: y(hi),
            stroke: 'var(--ui-stroke-secondary)',
            strokeWidth: 0.5,
            strokeDasharray: '2 3'
          }),
          jsx('text', {
            x: 2,
            y: y(hi) - 2,
            style: { fill: 'var(--ui-text-tertiary)', fontSize: 11 },
            children: `${Math.round(hi)}°`
          }),
          jsx('line', {
            x1: PAD,
            y1: y(lo),
            x2: CHART_W - PAD,
            y2: y(lo),
            stroke: 'var(--ui-stroke-secondary)',
            strokeWidth: 0.5,
            strokeDasharray: '2 3'
          }),
          jsx('text', {
            x: 2,
            y: y(lo) - 2,
            style: { fill: 'var(--ui-text-tertiary)', fontSize: 11 },
            children: `${Math.round(lo)}°`
          }),
          jsx('polyline', {
            points: line,
            fill: 'none',
            stroke: 'var(--ui-accent)',
            strokeWidth: 1.5,
            strokeLinejoin: 'round',
            strokeLinecap: 'round'
          }),
          line2 &&
            jsx('polyline', {
              points: line2,
              fill: 'none',
              stroke: 'var(--ui-text-quaternary)',
              strokeWidth: 1,
              strokeLinejoin: 'round',
              strokeLinecap: 'round'
            }),
          pts.map((p, i) =>
            i % step === 0
              ? jsx(
                  'text',
                  {
                    x: x(i),
                    y: H - 6,
                    textAnchor: 'middle',
                    style: { fill: 'var(--ui-text-tertiary)', fontSize: 11 },
                    children: p.label
                  },
                  i
                )
              : null
          ),
          h &&
            jsx('line', {
              x1: hx,
              y1: PAD,
              x2: hx,
              y2: H - PAD,
              stroke: 'var(--ui-accent)',
              strokeWidth: 0.75,
              strokeDasharray: '2 2'
            }),
          h && jsx('circle', { cx: hx, cy: y(h.v), r: 3, fill: 'var(--ui-accent)' }),
          h &&
            pts[hover].v2 != null &&
            jsx('circle', { cx: hx, cy: y(pts[hover].v2), r: 2.5, fill: 'var(--ui-text-quaternary)' })
        ]
      }),
      h &&
        jsx('div', {
          className:
            'pointer-events-none absolute z-10 whitespace-nowrap rounded border border-(--ui-stroke-secondary) px-1.5 py-0.5 text-[0.6875rem] tabular-nums',
          style: {
            left: `${(hx / CHART_W) * 100}%`,
            top: `${Math.max(0, Math.min(H - 20, y((h.v + (h.v2 != null ? h.v2 : h.v)) / 2) - 18))}px`,
            transform: 'translateX(-50%)',
            backgroundColor: 'var(--popover-surface)'
          },
          children: `${h.full}: ${Math.round(h.v)}°${h.v2 != null ? ` / ${Math.round(h.v2)}°` : ''}`
        })
    ]
  })
}
function PrecipChart({ pts }) {
  const [hover, setHover] = useState(-1)
  const H = 66
  const PAD = 12
  const BAND = 16
  const maxR = Math.max(...pts.map((p) => p.r), 0.1)
  const slot = (CHART_W - 2 * PAD) / pts.length
  const barW = Math.max(1, slot - 2)
  const step = Math.max(1, Math.ceil(pts.length / 6))
  const total = pts.reduce((s, p) => s + p.r, 0)
  const h = hover >= 0 ? pts[hover] : null
  const hx = hover >= 0 ? PAD + hover * slot + slot / 2 : 0
  const plotBot = H - BAND
  const plotH = plotBot - PAD
  return jsxs('div', {
    className: 'relative',
    children: [
      jsx('svg', {
        viewBox: `0 0 ${CHART_W} ${H}`,
        className: 'w-full cursor-crosshair',
        style: { height: 66 },
        onMouseMove: (e) => setHover(nearestSlot(e, pts, PAD)),
        onMouseLeave: () => setHover(-1),
        children: [
          jsx('text', {
            x: 2,
            y: 8,
            style: { fill: 'var(--ui-text-tertiary)', fontSize: 11 },
            children: `${maxR >= 10 ? Math.round(maxR) : maxR.toFixed(1)}mm`
          }),
          pts.map((p, i) =>
            p.r > 0
              ? jsx('rect', {
                  x: PAD + i * slot + (slot - barW) / 2,
                  y: plotBot - (p.r / maxR) * plotH,
                  width: barW,
                  height: Math.max(1, (p.r / maxR) * plotH),
                  rx: 1,
                  style: { fill: 'var(--ui-accent)', fillOpacity: 0.7 }
                })
              : null
          ),
          pts.map((p, i) =>
            i % step === 0
              ? jsx(
                  'text',
                  {
                    x: PAD + i * slot + slot / 2,
                    y: H - 6,
                    textAnchor: 'middle',
                    style: { fill: 'var(--ui-text-tertiary)', fontSize: 11 },
                    children: p.label
                  },
                  i
                )
              : null
          ),
          h && jsx('line', { x1: hx, y1: PAD, x2: hx, y2: H - PAD, stroke: 'var(--ui-accent)', strokeWidth: 0.75, strokeDasharray: '2 2' })
        ]
      }),
      h &&
        jsx('div', {
          className:
            'pointer-events-none absolute z-10 whitespace-nowrap rounded border border-(--ui-stroke-secondary) px-1.5 py-0.5 text-[0.6875rem] tabular-nums',
          style: {
            left: `${(hx / CHART_W) * 100}%`,
            top: `${Math.max(0, Math.min(H - 20, 14))}px`,
            transform: 'translateX(-50%)',
            backgroundColor: 'var(--popover-surface)'
          },
          children: `${h.full}: ${h.r.toFixed(1)}mm`
        })
    ]
  })
}
function LocPin({ size = 14 }) {
  return jsx('svg', {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    className: 'text-(--ui-text-tertiary)',
    children: jsx('path', {
      d: 'M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 1 1 16 0Z'
    })
  })
}
function SectionToggle({ label, open, onToggle }) {
  return jsx('button', {
    type: 'button',
    title: open ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`,
    className:
      'flex w-full items-center gap-1 rounded px-1 py-0.5 text-[0.6875rem] uppercase tracking-wide text-(--ui-text-quaternary) ' +
      'hover:bg-(--chrome-action-hover) hover:text-foreground',
    onClick: onToggle,
    children: [
      jsx(icons.ChevronDown, {
        className: 'size-3 transition-transform',
        style: { transform: open ? 'rotate(0deg)' : 'rotate(-90deg)' }
      }),
      label
    ]
  })
}
function hourIsDay(t, daily) {
  const d = (t || '')
  const date = d.slice(0, 10)
  const idx = (daily?.time || []).indexOf(date)
  if (idx < 0) return true
  const rh = parseInt(String(daily?.sunrise?.[idx] || '').slice(11, 13), 10)
  const sh = parseInt(String(daily?.sunset?.[idx] || '').slice(11, 13), 10)
  const h = parseInt(d.slice(11, 13), 10)
  if (isNaN(rh) || isNaN(sh)) return true
  return h >= rh && h < sh
}
function HourlyStrip({ fc, curTime }) {
  const stripRef = useRef(null)
  const dragRef = useRef({ down: false, x: 0, sl: 0, moved: false })
  useEffect(() => {
    const el = stripRef.current
    if (!el) return
    let target = el.scrollLeft
    let raf = 0
    const glide = () => {
      el.scrollLeft += (target - el.scrollLeft) * 0.25
      if (Math.abs(target - el.scrollLeft) > 0.5) raf = requestAnimationFrame(glide)
    }
    const onWheel = (e) => {
      const canL = el.scrollLeft > 0
      const canR = el.scrollLeft < el.scrollWidth - el.clientWidth - 0.5
      const dMain = e.deltaY !== 0 ? e.deltaY : e.deltaX
      if ((dMain < 0 && !canL) || (dMain > 0 && !canR)) return
      e.preventDefault()
      target = Math.max(0, Math.min(el.scrollWidth - el.clientWidth, target + dMain))
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(glide)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      el.removeEventListener('wheel', onWheel)
      cancelAnimationFrame(raf)
    }
  }, [])
  const onPointerDown = (e) => {
    const el = stripRef.current
    dragRef.current = { down: true, x: e.clientX, sl: el.scrollLeft, moved: false }
    el.setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e) => {
    const d = dragRef.current
    if (!d.down) return
    const dx = e.clientX - d.x
    if (Math.abs(dx) > 3) d.moved = true
    stripRef.current.scrollLeft = d.sl - dx
  }
  const onPointerUp = () => {
    dragRef.current.down = false
  }
  const hTimes = fc?.hourly?.time
  const hCodes = fc?.hourly?.weather_code
  const hTemps = fc?.hourly?.temperature_2m
  const hIsDay = fc?.hourly?.is_day
  if (!hTimes?.length || !hCodes?.length || !hTemps?.length) return null
  let start = -1
  if (curTime) {
    const dayKey = curTime.slice(0, 10)
    const hourNow = parseInt(curTime.slice(11, 13), 10)
    for (let i = 0; i < hTimes.length; i++) {
      const t = hTimes[i] ?? ''
      if (t.slice(0, 10) === dayKey && parseInt(t.slice(11, 13), 10) >= hourNow) { start = i; break }
    }
    if (start < 0) {
      for (let i = 0; i < hTimes.length; i++) {
        if ((hTimes[i] ?? '') > curTime) { start = i; break }
      }
    }
  }
  if (start < 0) return null
  const SIDE = 24
  const from = Math.max(0, start - SIDE)
  const to = Math.min(hTimes.length, start + SIDE)
  const items = []
  for (let i = from; i < to; i++) {
    const [, we] = wmo(hCodes[i] ?? 3, hourIsDay(hTimes[i], fc?.daily))
    const t = hTimes[i] ?? ''
    const wd = new Date(t.slice(0, 10) + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short' })
    items.push({ h: `${wd} ${hr12(t.slice(11, 16))}`, we, t: dispTemp(hTemps?.[i]), now: i === start })
  }
  useEffect(() => {
    const el = stripRef.current
    if (!el) return
    const chip = el.querySelector('[data-now]')
    if (chip) el.scrollLeft = chip.offsetLeft
  }, [fc, curTime])
  return jsxs('div', {
    className: 'pb-1',
    children: [
      jsx('div', {
        style: { position: 'relative' },
        children: [
          jsx('div', {
            style: {
              position: 'absolute', top: 0, right: 0, bottom: 0, width: 24,
              background: 'linear-gradient(to left, var(--popover-surface), transparent)',
              pointerEvents: 'none'
            }
          }),
          jsxs('div', {
            ref: stripRef,
            onWheelCapture: undefined,
            onPointerDown,
            onPointerMove,
            onPointerUp,
            onPointerLeave: onPointerUp,
            style: { scrollbarWidth: 'none', cursor: 'grab' },
            className: 'flex gap-2 select-none overflow-x-auto px-1 pb-1',
            children: items.map((it, i) =>
              jsxs(
                'div',
                {
                  key: i,
                  ...(it.now ? { 'data-now': '' } : {}),
                  style: { minWidth: 44 },
                  className: 'flex shrink-0 flex-col items-center gap-0.5',
                  children: [
                    jsx('span', { className: 'text-[0.6875rem] tabular-nums text-(--ui-text-quaternary)', children: it.h }),
                    jsx('span', { style: { fontSize: 18, lineHeight: 1 }, children: it.we }),
                    jsx('span', { className: 'text-[0.6875rem] tabular-nums text-(--ui-text-secondary)', children: it.t })
                  ]
                }
              )
            )
          })
        ]
      })
    ]
  })
}
function WeatherTitleTool() {
  const { loc, auto, ip, geo, fc, hist, aq } = useWeather()
  useValue(unitAtom)
  const cur = fc.data?.current
  const place =
    auto && ip.data?.city
      ? `${ip.data.city}${ip.data.country ? ', ' + ip.data.country : ''}`
      : geo.data?.name
        ? `${geo.data.name}, ${geo.data.country ?? ''}`
        : loc
  const noLoc = !auto && !place?.trim()
  const [label, emoji] = noLoc
    ? ['No location set', '⏳']
    : cur?.weather_code != null
      ? wmo(cur.weather_code, cur.is_day)
      : ['…', '🌡️']
  const temp = noLoc ? '…' : cur?.temperature_2m != null ? dispTempUnit(cur.temperature_2m) : '—'
  return jsx(Popover, {
    children: [
      jsx(PopoverTrigger, {
        asChild: true,
        children: jsx('span', {
          role: 'button',
          tabIndex: 0,
          onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.currentTarget.click(); } },
          onClick: () => { if (noLoc) { draftAtom.set(''); editingAtom.set(true) } },
          title: `${VERSION} — ${place || 'No location'} — ${label}`,
          style: {
            position: 'relative',
            WebkitAppRegion: 'no-drag',
            right:
              'calc(var(--titlebar-tools-right, 0.75rem) + 5 * var(--titlebar-control-size, 24px) + 0.75rem - max(var(--workspace-right, 0px) + 0.5rem, var(--titlebar-tools-right, 0.75rem) + 4 * var(--titlebar-control-size, 24px) + 0.5rem))',
            height: 'var(--titlebar-control-size, 24px)',
            display: 'inline-flex',
            alignItems: 'center'
          },
          className:
            'cursor-pointer items-center gap-1 rounded-[4px] px-1.5 text-xs ' +
            'text-(--ui-text-secondary) transition-colors hover:bg-(--chrome-action-hover) hover:text-foreground',
          children: [
            jsx('span', { className: 'text-sm leading-none', children: emoji }),
            jsx('span', { className: 'tabular-nums font-medium', children: temp })
          ]
        })
      }),
      jsx(PopoverContent, {
        align: 'end',
        side: 'bottom',
        className: 'weather-scroll',
        style: {
          width: 480,
          maxHeight: 'min(94vh, 940px)',
          overflowY: 'auto',
          overflowX: 'hidden',
          padding: '10px 14px',
          scrollbarGutter: 'stable',
          scrollbarWidth: 'thin',
          scrollbarColor: 'var(--ui-stroke-secondary) transparent'
        },
        children: jsx(ForecastPopover, { geo, fc, hist, place, auto, ip, aq, loc })
      })
    ]
  })
}
function ForecastPopover({ geo, fc, hist, place, auto, ip, aq, loc }) {
  const editing = useValue(editingAtom)
  const draft = useValue(draftAtom)
  const zoom = useValue(zoomAtom)
  const savedLocs = useValue(savedLocsAtom)
  const [hoverRow, setHoverRow] = useState(-1)
  useValue(unitAtom)
  const hourlyOpen = useValue(hourlyOpenAtom)
  const forecastOpen = useValue(forecastOpenAtom)
  const chartsOpen = useValue(chartsOpenAtom)
  const cur = fc.data?.current
  const daily = fc.data?.daily
  const histData = hist?.data
  const editorRow = editing
          ? jsxs('div', {
              className: 'flex items-center gap-1.5',
              children: [
                jsx('input', {
                  className: 'h-6 w-40 rounded border border-(--ui-stroke-secondary) bg-transparent px-1.5 text-xs outline-none focus:border-(--ui-accent)',
                  value: draft,
                  placeholder: 'City, country…',
                  autoFocus: true,
                  onChange: (e) => draftAtom.set(e.target.value),
                  onKeyDown: (e) => {
                    if (e.key === 'Enter') {
                      const v = draft.trim()
                      if (v) switchTo(v)
                    }
                    if (e.key === 'Escape') editingAtom.set(false)
                  }
                }),
                jsx('button', {
                  type: 'button',
                  title: 'Save location',
                  className: 'inline-flex size-5 items-center justify-center rounded text-(--ui-text-tertiary) hover:bg-(--chrome-action-hover) hover:text-foreground',
                  onClick: () => {
                    const v = draft.trim()
                    if (v) switchTo(v)
                  },
                  children: jsx(icons.Check, { className: 'size-3.5' })
                }),
                jsx('button', {
                  type: 'button',
                  title: 'Cancel',
                  className: 'inline-flex size-5 items-center justify-center rounded text-(--ui-text-tertiary) hover:bg-(--chrome-action-hover) hover:text-foreground',
                  onClick: () => editingAtom.set(false),
                  children: jsx(icons.X, { className: 'size-3.5' })
                }),
                
                jsx('button', {
                  type: 'button',
                  title: 'Detect my location automatically',
                  className: 'rounded border border-(--ui-stroke-secondary) px-1.5 py-0.5 text-(--ui-text-tertiary) hover:bg-(--chrome-action-hover) hover:text-foreground',
                  onClick: () => {
                    setAuto(true)
                    editingAtom.set(false)
                  },
                  children: 'Auto'
                })
              ]
            })
          : null
  if (loc?.trim() && (geo.isLoading || fc.isLoading || (hist && hist.isLoading))) {
    return jsxs('div', {
      className: 'flex items-center justify-between gap-2 p-2 text-xs text-(--ui-text-quaternary)',
      children: [
        jsx('span', { children: 'Loading weather…' }),
        jsx('button', {
          type: 'button',
          title: 'Change location',
          className: 'inline-flex size-5 shrink-0 items-center justify-center rounded text-(--ui-text-tertiary) hover:bg-(--chrome-action-hover) hover:text-foreground',
          onClick: () => {
            draftAtom.set(place || draftAtom.get())
            editingAtom.set(true)
          },
          children: jsx(icons.Pencil, { className: 'size-3.5' })
        }),
        editorRow
      ]
    })
  }
  const errMsg =
    !loc?.trim() && !auto
      ? 'Set a location to see the weather'
      : geo.error
        ? `${geo.error.message}`
        : fc.error || !cur || !daily
          ? 'Weather unavailable — check your connection'
          : null
  if (errMsg) {
    return jsxs('div', {
      className: 'flex flex-col gap-1.5 p-2 text-xs',
      children: [
        jsxs('div', {
          className: 'flex items-center justify-between gap-2',
          children: [
            jsx('span', {
              className: 'min-w-0 truncate text-(--ui-text-tertiary)',
              children: `${place} \u2014 ${errMsg}`
            }),
            jsx('button', {
              type: 'button',
              title: 'Change location',
              className: 'inline-flex size-5 shrink-0 items-center justify-center rounded text-(--ui-text-tertiary) hover:bg-(--chrome-action-hover) hover:text-foreground',
              onClick: () => {
                draftAtom.set(place || draftAtom.get())
                editingAtom.set(true)
              },
              children: jsx(icons.Pencil, { className: 'size-3.5' })
            })
          ]
        }),
        editorRow,
        !editing && savedLocs.length > 0
          ? jsxs('div', {
              className: 'flex flex-wrap items-center gap-1',
              children: [
                jsx('span', { className: 'text-(--ui-text-quaternary)', children: 'Saved:' }),
                savedLocs.map((sl) =>
                  jsx('button', {
                    type: 'button',
                    title: `Switch to ${sl.name}`,
                    className: 'rounded border border-(--ui-stroke-secondary) px-1.5 py-0.5 text-(--ui-text-tertiary) hover:bg-(--chrome-action-hover) hover:text-foreground',
                    onClick: () => setLocation(sl.name),
                    children: sl.name
                  }, sl.name)
                )
              ]
            })
          : null
      ]
    })
  }
  const [label, emoji] = cur?.weather_code != null ? wmo(cur.weather_code, cur.is_day) : ['…', '🌡️']
  const hourly = fc.data?.hourly
  const hTimes = hourly?.time ?? []
  const hCodes = hourly?.weather_code ?? []
  const dayWinsMap = {}
  if (hTimes.length && hCodes.length) {
    let start = 0
    while (start < hTimes.length) {
      const date = hTimes[start]?.slice(0, 10) ?? ''
      let end = start
      while (end + 1 < hTimes.length && (hTimes[end + 1]?.slice(0, 10) ?? '') === date) end++
      dayWinsMap[date] = badWindows(hCodes.slice(start, end + 1), hTimes.slice(start, end + 1))
      start = end + 1
    }
  }
  let curLine = null
  const curTime = cur?.time
  const todayStr = curTime ? curTime.slice(0, 10) : hTimes[0]?.slice(0, 10) ?? ''
  const todayWins = dayWinsMap[todayStr] ?? []
  if (todayWins.length && curTime) {
    const curHourIdx = parseInt(curTime.slice(11, 13), 10)
    const curWin = todayWins.find((w) => curHourIdx >= w.startIdx && curHourIdx <= w.endIdx)
    const nextWin = todayWins.find((w) => curHourIdx < w.startIdx)
    if (curWin) {
      const [wl, we] = wmo(curWin.code ?? 3, cur?.is_day === 1)
      curLine = `${we} ${wl} expected until ${curWin.endH}`
    } else if (nextWin) {
      const [wl, we] = wmo(nextWin.code ?? 3, cur?.is_day === 1)
      curLine = `${we} ${wl} from ${nextWin.startH} · ~${nextWin.hours}h`
    }
  }
  const rows = []
  const t = daily?.time ?? []
  const todayIdx = todayStr ? Math.max(0, t.indexOf(todayStr)) : 0
  const tEnd = Math.min(t.length, todayIdx + 5)
  for (let i = todayIdx; i < tEnd; i++) {
    const d = t[i]
    const isToday = d === todayStr
    const dayCodes = hTimes.length
      ? hCodes.filter((_, hi2) => (hTimes[hi2] ?? '').slice(0, 10) === (d ?? '')).filter((c) => c != null)
      : []
    const [dLabel, dEmoji] = dayCodes.length ? wmo(majorityCode(dayCodes), true) : wmo(daily?.weather_code?.[i] ?? 3, true)
    const hi = daily?.temperature_2m_max?.[i]
    const lo = daily?.temperature_2m_min?.[i]
    const prob = daily?.precipitation_probability_max?.[i]
    const sum = daily?.precipitation_sum?.[i]
    const dayWins = dayWinsMap[d ?? ''] ?? []
    rows.push(
      jsxs(
        'div',
        {
          onMouseEnter: () => setHoverRow(i),
          onMouseLeave: () => setHoverRow(-1),
          className: 'relative flex flex-col rounded px-1 py-0.5 hover:bg-(--chrome-action-hover)',
          children: [
            jsxs('div', {
              className: 'flex items-center gap-2',
              children: [
            jsxs('div', {
              style: { width: COL_DAY_W },
              className: 'flex shrink-0 items-baseline gap-1.5',
              children: [
                jsx('span', {
                  className: 'w-14 shrink-0 text-xs font-medium',
                  children: isToday ? 'Today' : fmtWeekday(d ?? '')
                }),
                jsx('span', {
                  className: 'text-xs text-(--ui-text-tertiary)',
                  children: new Date((d ?? '') + 'T12:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
                })
              ]
            }),
            jsxs('div', {
              style: { flex: 1, minWidth: 0 },
              className: 'flex items-center gap-1.5',
              children: [
                jsx('span', { className: 'text-base leading-none', children: dEmoji }),
                jsx('span', { className: 'truncate text-xs text-(--ui-text-secondary)', children: dLabel })
              ]
            }),
            jsxs('span', {
              style: { width: 72 },
              className: 'flex shrink-0 items-center justify-center gap-1 text-xs tabular-nums',
              children: [
                jsx('span', { className: 'text-(--ui-text-secondary)', children: dispTemp(hi) }),
                jsx('span', { className: 'text-(--ui-text-quaternary)', children: '/' }),
                jsx('span', { className: 'text-(--ui-text-quaternary)', children: dispTemp(lo) })
              ]
            }),
            jsxs('span', {
              className: 'flex shrink-0 gap-1.5 text-xs tabular-nums text-(--ui-text-tertiary)',
              children: [
                jsx('span', { style: { width: 30 }, className: 'text-right', children: `${prob != null ? prob : '—'}%` }),
                jsx('span', { style: { width: 40 }, className: 'text-right', children: `${sum != null ? Number(sum).toFixed(1) : '—'}mm` })
              ]
            })
              ]
            }),
            jsx('div', {
              style: { minHeight: 10, paddingLeft: COL_DAY_W + COL_GAP }
            }),
            hoverRow === i && dayWins.length
              ? jsx('div', {
                  className:
                    'pointer-events-none absolute -top-2 z-10 translate-y-[-100%] whitespace-nowrap rounded border border-(--ui-stroke-secondary) px-1.5 py-1 text-[0.6875rem] tabular-nums',
                  style: {
                    left: COL_DAY_W + COL_GAP,
                    backgroundColor: 'var(--popover-surface)'
                  },
                  children: jsxs('div', {
                    className: 'flex flex-col gap-0.5',
                    children: dayWins.map((w) => {
                      const [, we] = wmo(w.code ?? 3, true)
                      return jsx('div', {
                        className: 'whitespace-nowrap text-(--ui-text-secondary)',
                        children: `${we} ${w.startH}–${w.endH}`
                      }, `${w.startIdx}-${w.endIdx}`)
                    })
                  })
                })
              : null
          ]
        },
        i
      )
    )
  }
  let chart = buildChartData(zoom, fc.data, histData)
  if (chart && unitAtom.get() === 'F') {
    const cv = (pts) => pts.map((p) => ({ ...p, v: tVal(p.v), v2: p.v2 != null ? tVal(p.v2) : null }))
    chart = { ...chart, temp: cv(chart.temp) }
  }
  return jsxs('div', {
    className: 'flex flex-col gap-1.5',
    children: [
      jsxs('div', {
        className: 'flex flex-col gap-1 border-b border-(--ui-stroke-secondary) pb-2',
        children: [
          jsxs('div', {
            className: 'flex items-center justify-between',
            children: [
              jsxs('div', {
                className: 'flex items-center gap-1.5 font-medium',
                children: [
                  jsx(LocPin, { size: 14 }),
                  jsx('span', { className: 'max-w-[300px] truncate', children: place }),
                  auto &&
                    jsx('button', {
                      type: 'button',
                      title: 'Auto location is ON — uses your public IP via ipwho.is to detect location. Click to switch to manual',
                      className:
                        'rounded border border-(--ui-accent) px-1 text-[0.6875rem] text-(--ui-accent) hover:bg-(--chrome-action-hover)',
                      onClick: () => setAuto(false),
                      children: 'auto · on'
                    })
                ]
              }),
              jsxs('div', {
                className: 'flex items-center gap-2 text-xs tabular-nums',
                children: [
                  jsx('button', {
                    type: 'button',
                    title: 'Refresh',
                    className: 'inline-flex size-5 items-center justify-center rounded text-(--ui-text-tertiary) hover:bg-(--chrome-action-hover) hover:text-foreground',
                    onClick: () => {
                      haptic('tap')
                      void fc.refetch()
                      if (auto) void ip.refetch()
                    },
                    children: jsx(icons.RefreshCw, { className: 'size-3.5' })
                  }),
                  jsx('button', {
                    type: 'button',
                    title: 'Change location',
                    className: 'inline-flex size-5 items-center justify-center rounded text-(--ui-text-tertiary) hover:bg-(--chrome-action-hover) hover:text-foreground',
                    onClick: () => {
                      draftAtom.set(place)
                      editingAtom.set(true)
                    },
                    children: jsx(icons.Pencil, { className: 'size-3.5' })
                  }),
                  jsx('button', {
                    type: 'button',
                    title: 'Pin current location to saved',
                    className: 'inline-flex size-5 items-center justify-center rounded text-(--ui-text-tertiary) hover:bg-(--chrome-action-hover) hover:text-foreground',
                    onClick: () => {
                      const cur2 = (savedLocsAtom.get() || []).filter((x) => x.name.toLowerCase() !== place.toLowerCase())
                      const next2 = [{ name: place }, ...cur2].slice(0, 3)
                      savedLocsAtom.set(next2)
                      try { storage?.set('savedLocations', JSON.stringify(next2)) } catch {}
                    },
                    children: jsx(icons.Pin, { className: 'size-3.5' })
                  }),
                  jsx('button', {
                    type: 'button',
                    title: 'Switch \u00b0C/km/h \u2194 \u00b0F/mph',
                    className:
                      'inline-flex h-5 items-center justify-center rounded px-1 text-[0.6875rem] tabular-nums text-(--ui-text-tertiary) ' +
                      'hover:bg-(--chrome-action-hover) hover:text-foreground',
                    onClick: () => {
                      const next = unitAtom.get() === 'C' ? 'F' : 'C'
                      unitAtom.set(next)
                      try { storage?.set('unit', next) } catch {}
                    },
                    children: `\u00b0${unitAtom.get()}`
                  })
                ]
              })
            ]
          }),
          jsxs('div', {
            className: 'flex items-start justify-between gap-3',
            children: [
              jsx('div', {
                className: 'flex items-center gap-4',
                children: [
                  jsx('span', {
                    style: {
                      width: 48,
                      height: 48,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      fontSize: 46,
                      lineHeight: '46px',
                      textAlign: 'center'
                    },
                    children: emoji
                  }),
                  jsx('div', {
                    className: 'flex flex-col',
                    children: [
                      jsxs('div', {
                        className: 'flex items-baseline gap-2',
                        children: [
                          jsx('span', { className: 'text-2xl font-semibold tabular-nums', children: cur?.temperature_2m != null ? dispTempUnit(cur.temperature_2m) : '—' }),
                          jsx('span', { className: 'text-sm text-(--ui-text-secondary)', children: label })
                        ]
                      }),
                      jsx('span', {
                        className: 'whitespace-nowrap text-xs text-(--ui-text-tertiary)',
                        children: `feels like ${dispTemp(cur?.apparent_temperature)}`
                      }),
                      jsx('span', {
                        className: 'whitespace-nowrap text-xs text-(--ui-text-tertiary)',
                        children: `Humidity ${cur?.relative_humidity_2m != null ? cur.relative_humidity_2m : '—'}% · Wind ${dispWind(cur?.wind_speed_10m)}`
                      }),
                    ]
                  })
                ]
              }),
              jsxs('div', {
                style: { minWidth: 110 },
                className: 'flex flex-col items-end gap-1 pt-1 text-right text-xs text-(--ui-text-tertiary)',
                children: [
                  sunAtom.get() && daily?.sunrise?.[0] && daily?.sunset?.[0]
                    ? jsxs('span', {
                        className: 'inline-flex items-center gap-2',
                        children: [
                          jsxs('span', {
                            className: 'inline-flex items-center gap-0.5',
                            children: [
                              jsx(icons.Sun, { className: 'size-3 text-(--ui-text-tertiary)' }),
                              String(daily.sunrise[0]).slice(11, 16)
                            ]
                          }),
                          jsxs('span', {
                            className: 'inline-flex items-center gap-0.5',
                            children: [
                              jsx(icons.Moon, { className: 'size-3 text-(--ui-text-tertiary)' }),
                              String(daily.sunset[0]).slice(11, 16)
                            ]
                          })
                        ]
                      })
                    : null,
                  sunAtom.get() && daily?.uv_index_max?.[0] != null
                    ? (() => {
                        const uv = daily.uv_index_max[0]
                        const c = uv < 3 ? 'var(--ui-text-quaternary)' : uv < 8 ? 'var(--ui-text-secondary)' : 'var(--ui-accent)'
                        return jsx('span', {
                          style: uv >= 3 ? { color: c } : undefined,
                          children: `UV max ${Math.round(uv)}`
                        })
                      })()
                    : null,
                  aqAtom.get() && aq?.data?.current?.us_aqi != null
                    ? jsx(
                        'span',
                        {
                          style: { color: aqiInfo(aq.data.current.us_aqi)[1] },
                          children: `AQI ${Math.round(aq.data.current.us_aqi)} (${aqiInfo(aq.data.current.us_aqi)[0]})`
                        }
                      )
                    : null
                ]
              })
            ]
          }),
          curLine
            ? jsx('div', {
                className: 'whitespace-nowrap text-xs font-medium text-(--ui-accent)',
                style: { paddingLeft: 64 },
                children: curLine
              })
            : null,
          editing
            ? jsxs('div', {
                className: 'mt-1 flex items-center gap-1.5',
                children: [
                  jsx('input', {
                    className:
                      'h-6 w-44 rounded border border-(--ui-stroke-secondary) bg-transparent px-1.5 text-xs ' +
                      'outline-none focus:border-(--ui-accent)',
                    value: draft,
                    placeholder: 'City, country…',
                    autoFocus: true,
                    onChange: (e) => draftAtom.set(e.target.value),
                    onKeyDown: (e) => {
                      if (e.key === 'Enter') {
                        const v = draft.trim()
                        if (v) switchTo(v)
                      }
                      if (e.key === 'Escape') editingAtom.set(false)
                    }
                  }),
                  jsx('button', {
                    type: 'button',
                    title: 'Save location',
                    className: 'inline-flex size-5 items-center justify-center rounded text-(--ui-text-tertiary) hover:bg-(--chrome-action-hover) hover:text-foreground',
                    onClick: () => {
                      const v = draft.trim()
                      if (v) switchTo(v)
                    },
                    children: jsx(icons.Check, { className: 'size-3.5' })
                  }),
                  jsx('button', {
                    type: 'button',
                    title: 'Cancel',
                    className: 'inline-flex size-5 items-center justify-center rounded text-(--ui-text-tertiary) hover:bg-(--chrome-action-hover) hover:text-foreground',
                    onClick: () => editingAtom.set(false),
                    children: jsx(icons.X, { className: 'size-3.5' })
                  }),                  
                  jsx('button', {
                    type: 'button',
                    title: 'Detect my location automatically',
                    className:
                      'rounded border border-(--ui-stroke-secondary) px-1.5 text-xs text-(--ui-text-tertiary) ' +
                      'hover:bg-(--chrome-action-hover) hover:text-foreground',
                    onClick: () => {
                      setAuto(true)
                      editingAtom.set(false)
                    },
                    children: 'Auto'
                  })
                ]
              })
            : null,
          !editing && savedLocs.length > 1
            ? jsxs('div', {
                className: 'mt-1.5 flex flex-nowrap items-center gap-1.5 overflow-hidden border-t border-(--ui-stroke-secondary) pt-1.5',
                children: [
                  jsx('span', { className: 'shrink-0 text-[0.6875rem] text-(--ui-text-quaternary)', children: 'Saved:' }),
                  savedLocs.map((sl) =>
                    jsx(
                      'span',
                      {
                        key: sl.name,
                        title: sl.name,
                        style: { maxWidth: 180 },
                        className:
                          'inline-flex max-w-[180px] shrink-0 items-center gap-1 overflow-hidden rounded border border-(--ui-stroke-secondary) px-1.5 py-0.5 text-[0.6875rem] text-(--ui-text-tertiary)',
                        children: [
                          jsx('button', {
                            type: 'button',
                            title: `Switch to ${sl.name}`,
                            className: 'min-w-0 truncate hover:text-foreground',
                            onClick: () => setLocation(sl.name),
                            children: sl.name
                          }),
                          jsx('button', {
                            type: 'button',
                            title: `Remove ${sl.name} from saved`,
                            className: 'shrink-0 text-(--ui-text-quaternary) hover:text-foreground',
                            onClick: () => removeSaved(sl.name),
                            children: '\u00d7'
                          })
                        ]
                      }
                    )
                  )
                ]
              })
            : null
        ]
      }),
      jsx('div', {
        className: 'border-b border-(--ui-stroke-secondary)',
        children: [
          jsx(SectionToggle, {
            label: 'Hourly',
            open: hourlyOpen,
            onToggle: () => {
              const v = !hourlyOpenAtom.get()
              setHourly(v)
            }
          }),
          hourlyOpen ? jsx(HourlyStrip, { fc: fc.data, curTime: cur?.time }) : null
        ]
      }),
      jsx('div', {
        className: 'border-b border-(--ui-stroke-secondary)',
        children: [
          jsx(SectionToggle, {
            label: 'Forecast',
            open: forecastOpen,
            onToggle: () => {
              const v = !forecastOpenAtom.get()
              setForecast(v)
            }
          }),
          forecastOpen
            ? jsx('div', {
                className: 'py-1',
                children: jsxs('div', {
                  className: 'flex flex-col gap-0.5',
                  children: rows
                })
              })
            : null
        ]
      }),
      jsx('div', {
        className: 'flex flex-col',
        children: [
          jsx(SectionToggle, {
            label: 'Historical charts',
            open: chartsOpen,
            onToggle: () => {
              const v = !chartsOpenAtom.get()
              setCharts(v)
            }
          }),
          !chartsOpen
            ? null
            : jsxs('div', {
                className: 'flex flex-col gap-1 pb-1',
                children: [
                  jsxs('div', {
                    className: 'flex items-center justify-end',
                    children: [
                      jsxs('div', {
                        className: 'flex items-center gap-0.5 rounded-md border border-(--ui-stroke-secondary) p-0.5',
                        children: ZOOMS.map(([key, zLabel]) =>
                          jsx(
                            'button',
                            {
                              type: 'button',
                              className:
                                'rounded px-1.5 py-0.5 text-[0.6875rem] transition-colors ' +
                                (zoom === key
                                  ? 'bg-(--ui-accent) font-medium'
                                  : 'text-(--ui-text-tertiary) hover:bg-(--chrome-action-hover) hover:text-foreground'),
                              style: zoom === key ? { color: 'var(--ui-accent-foreground)' } : undefined,
                              onClick: () => zoomAtom.set(key),
                              children: zLabel
                            },
                            key
                          )
                        )
                      })
                    ]
                  }),
                  chart
                    ? jsxs('div', {
                        className: 'flex flex-col gap-1',
                        children: [
                          jsx('div', {
                            className: 'px-1 text-[0.6875rem] text-(--ui-text-tertiary)',
                            children: `Temperature · ${chart.range}`
                          }),
                          jsx(TempChart, { pts: chart.temp }),
                          jsx('div', {
                            className: 'mt-0.5 px-1 text-[0.6875rem] text-(--ui-text-tertiary)',
                            children: `Precipitation · ${chart.precip.reduce((s, p) => s + (p.r ?? 0), 0).toFixed(1)}mm`
                          }),
                          jsx(PrecipChart, { pts: chart.precip })
                        ]
                      })
                    : jsx('div', { className: 'px-1 py-2 text-xs text-(--ui-text-tertiary)', children: 'Chart data unavailable' })
                ]
              })
        ]
      })
    ]
  })
}
export default {
  id: ID,
  name: 'Weather',
  register(ctx) {
    storage = ctx.storage
    try {
      if (typeof document !== 'undefined' && !document.getElementById('weather-scroll-css')) {
        const st = document.createElement('style')
        st.id = 'weather-scroll-css'
        st.textContent =
          '.weather-scroll::-webkit-scrollbar{width:6px;height:6px}' +
          '.weather-scroll::-webkit-scrollbar-track{background:transparent}' +
          '.weather-scroll::-webkit-scrollbar-thumb{background:var(--ui-stroke-secondary);border-radius:3px}'
        document.head.appendChild(st)
      }
    } catch {}
    const saved = ctx.storage.get('location', '')
    if (saved) manualAtom.set(saved)
    if (ctx.storage.get('auto', '') === '0') {
      autoAtom.set(false)
    }
    try {
      const u = ctx.storage.get('unit', '')
      if (u === 'F' || u === 'C') unitAtom.set(u)
      const sl = ctx.storage.get('savedLocations', '')
      if (sl) {
        const arr = JSON.parse(sl)
        if (Array.isArray(arr)) {
          const seen = new Map()
          const norm = []
          for (const x of arr) {
            if (!x?.name) continue
            const key = String(x.name).trim().toLowerCase()
            if (!seen.has(key)) { seen.set(key, true); norm.push({ name: String(x.name).trim() }) }
          }
          savedLocsAtom.set(norm.slice(0, 3))
        }
      } else if (saved && !poisoned) {
        const seed = JSON.stringify([{ name: saved }])
        savedLocsAtom.set([{ name: saved }])
        try { ctx.storage.set('savedLocations', seed) } catch {}
      }
      if (ctx.storage.get('auto', '') === '1') autoAtom.set(true) // restore the user's opt-in choice
      const aqS = ctx.storage.get('aq', '')
      if (aqS === '0') aqAtom.set(false)
      const sunS = ctx.storage.get('sun', '')
      if (sunS === '0') sunAtom.set(false)
      if (ctx.storage.get('charts', '') === '0') chartsOpenAtom.set(false)
      if (ctx.storage.get('hourly', '') === '0') hourlyOpenAtom.set(false)
      if (ctx.storage.get('forecast', '') === '0') forecastOpenAtom.set(false)
    } catch {
    }
    ctx.register({
      id: 'tool',
      area: TITLEBAR_AREAS.right,
      order: 1,
      render: () => jsx(WeatherTitleTool, {})
    })
  }
}