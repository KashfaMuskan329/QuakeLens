import { CITY_PRESETS, haversineKm, normalizeGeojson, filterEvents, eventStatistics, makeRadiusPolygon, toFeatureCollection, emptyFeatureCollection, dailyHistogram, formatTime } from './geo.js';

const $ = id => document.getElementById(id);
const cfg = window.QUAKELENS_CONFIG || {};
// Prefer the full 30-day feed; smaller official feeds are partial-data fallbacks.
// Never present a partial feed as complete 30-day M2.5+ coverage.
const USGS_FEEDS = [
  { url: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_month.geojson', mode: 'usgs', label: 'M2.5+ · past 30 days', timeout: 20000 },
  { url: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_week.geojson', mode: 'usgs-week', label: 'M2.5+ · past 7 days only', timeout: 12000 },
  { url: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_month.geojson', mode: 'usgs-strong', label: 'M4.5+ · past 30 days only', timeout: 12000 },
];
const DAY = 86400000;
const state = {
  events: [], now: Date.now(), fetched: false, dataMode: 'loading', map: null, mapLoaded: false,
  cityId: 'islamabad', radius: 500, minMag: 2.5, days: 30, view: 'global', mapStyle: 'Monochrome',
  replayDay: 30, playing: null, shown: 6, selectedId: null, popup: null, compareLeft: 'islamabad', compareRight: 'tokyo', compareRadius: 1000,
};
let toastTimer;
let loadingFeed = false;
let lastFeedFailures = [];
function toast(message) { const el = $('toast'); el.textContent = message; el.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 4200); }
function setConnection(mode) {
  state.dataMode = mode;
  const description = {
    aws: ['AWS PIPELINE LIVE', 'AWS PIPELINE · USGS DATA'],
    usgs: ['USGS CURRENT FEED', 'DIRECT USGS · M2.5+ / 30 DAYS'],
    'usgs-week': ['USGS PARTIAL FEED', 'DIRECT USGS · 7 DAYS ONLY'],
    'usgs-strong': ['USGS PARTIAL FEED', 'DIRECT USGS · M4.5+ ONLY'],
    sample: ['LIMITED SNAPSHOT', 'HISTORICAL REFERENCE · 15 EVENTS'],
    loading: ['CONNECTING', 'LOADING USGS RECORDS'],
    error: ['DATA UNAVAILABLE', 'NO DATA'],
  }[mode] || ['DATA STATUS UNKNOWN', 'CHECK DATA SOURCE'];
  $('connection-state').textContent = description[0];
  $('data-status').textContent = description[1];
  document.querySelectorAll('.online-pulse,.live-indicator').forEach(el => {
    el.style.background = ['sample', 'usgs-week', 'usgs-strong', 'error'].includes(mode) ? '#ffa55a' : '#b8f18b';
  });
}
async function fetchJson(url, ms = 10000) {
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), ms);
  try { const response = await fetch(url, { signal: controller.signal, cache: 'no-store' }); if (!response.ok) throw new Error(`HTTP ${response.status}`); return await response.json(); }
  finally { clearTimeout(timer); }
}
async function loadEvents() {
  if (loadingFeed) return;
  loadingFeed = true;
  state.now = Date.now();
  const retry = $('data-retry');
  retry.disabled = true;
  retry.textContent = 'CHECKING FEEDS…';
  setConnection('loading');
  lastFeedFailures = [];
  const urls = cfg.dataApiUrl
    ? [{ url: cfg.dataApiUrl, mode: 'aws', label: 'AWS cached USGS feed', timeout: 15000 }, ...USGS_FEEDS]
    : USGS_FEEDS;
  let payload = null, mode = 'error', coverage = '';
  for (const candidate of urls) {
    try {
      const response = await fetchJson(candidate.url, candidate.timeout);
      const events = normalizeGeojson(response);
      if (!events.length) throw new Error('Feed contains no valid events');
      state.events = events; payload = response; mode = candidate.mode; coverage = candidate.label;
      break;
    } catch (error) {
      const message = `${candidate.label}: ${error.name === 'AbortError' ? 'timed out' : error.message}`;
      lastFeedFailures.push(message);
      console.warn('Earthquake feed unavailable:', message);
    }
  }
  if (!payload) {
    try {
      payload = await fetchJson('data/usgs-reference.geojson', 3500);
      state.events = normalizeGeojson(payload); mode = 'sample'; coverage = '15 events · archived snapshot, NOT a complete USGS catalog';
    } catch (error) {
      console.error('Reference snapshot unavailable', error); state.events = []; mode = 'error';
    }
  }
  state.fetched = true;
  setConnection(mode);
  if (mode === 'sample') toast('Live feeds unavailable. Showing 15 historical reference records only. Check DevTools Console / Network.');
  else if (mode === 'error') toast('Could not load earthquake data. Check your connection or AWS API.');
  else if (mode === 'usgs-week' || mode === 'usgs-strong') toast(`Partial official feed loaded: ${coverage}. Some comparisons may be incomplete.`);
  const generated = payload?.metadata?.generated;
  $('last-updated').textContent = mode === 'sample'
    ? 'Archived · 28 Oct 2026 · 15 events only'
    : Number.isFinite(generated)
      ? `${coverage} · generated ${formatTime(generated)}`
      : `${coverage || 'No usable feed'} · generation time unknown`;
  $('event-range').textContent = mode === 'sample'
    ? 'Historical sample: 15 events only (not comprehensive)'
    : mode === 'usgs-week' ? 'Partial dataset · last 7 days only'
    : mode === 'usgs-strong' ? 'Partial dataset · M4.5+ only'
    : 'USGS recorded events · filtered';
  if (lastFeedFailures.length) retry.title = lastFeedFailures.join(' | ');
  else retry.title = 'Fetch the latest earthquake dataset';
  loadingFeed = false;
  retry.disabled = false;
  retry.textContent = '↻ RETRY LIVE DATA';
  refresh();
}
function getCity() { return CITY_PRESETS[state.cityId]; }
function compareRecords(cityId) {
  const city = CITY_PRESETS[cityId];
  const events = filterEvents(state.events, { now: state.now, days: state.days, minMag: state.minMag, replayDay: state.days });
  return events.filter(e => haversineKm(city.lat,city.lon,e.lat,e.lon) <= state.compareRadius);
}
function compareBins(events) {
  return [
    events.filter(e => e.mag < 4).length,
    events.filter(e => e.mag >= 4 && e.mag < 5).length,
    events.filter(e => e.mag >= 5 && e.mag < 6).length,
    events.filter(e => e.mag >= 6).length,
  ];
}
function refreshComparison() {
  const A = compareRecords(state.compareLeft), B = compareRecords(state.compareRight);
  const aBins = compareBins(A), bBins = compareBins(B), maxBin = Math.max(1,...aBins,...bBins);
  for (const [side, events, bins, cityId] of [['left',A,aBins,state.compareLeft],['right',B,bBins,state.compareRight]]) {
    const city = CITY_PRESETS[cityId];
    const stats = eventStatistics(events);
    setText(`compare-${side}-count`,shortNumber(events.length));
    setText(`compare-${side}-max`,stats.strongest ? `M ${stats.strongest.mag.toFixed(1)}` : '—');
    const nearest = events.reduce((min,e) => Math.min(min,haversineKm(city.lat,city.lon,e.lat,e.lon)),Infinity);
    setText(`compare-${side}-nearest`,Number.isFinite(nearest) ? `${Math.round(nearest)} km` : '—');
    const root = $(`compare-${side}-bars`), frag = document.createDocumentFragment(); root.replaceChildren();
    ['M2.5–3.9','M4–4.9','M5–5.9','M6+'].forEach((label,i) => {
      const line=document.createElement('div');line.className='compare-bar-line';
      const l=document.createElement('span');l.textContent=label;
      const track=document.createElement('div');track.className='compare-bar-track';
      const fill=document.createElement('div');fill.className='compare-bar-fill';fill.style.width=`${bins[i]/maxBin*100}%`;
      const value=document.createElement('span');value.className='compare-bar-value';value.textContent=String(bins[i]);
      track.append(fill);line.append(l,track,value);frag.append(line);
    });root.append(frag);
  }
  setText('compare-foot', `Same ${state.days}-day window · M ${state.minMag.toFixed(1)}+ · ${state.compareRadius.toLocaleString()} km from each city center. Counts reflect catalog observations, not relative seismic safety.`);
}

function baseEvents() {
  return filterEvents(state.events, { now: state.now, days: state.days, minMag: state.minMag, city: getCity(), radiusKm: state.radius, cityOnly: false, replayDay: state.replayDay });
}
function visibleEvents() { return state.view === 'radius' ? baseEvents().filter(e => haversineKm(getCity().lat, getCity().lon, e.lat, e.lon) <= state.radius) : baseEvents(); }
function shortNumber(n) { return new Intl.NumberFormat('en-US').format(n); }
function setText(id, value) { $(id).textContent = value; }
function dayLabel(ms) { return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' }).format(ms); }
function stopReplay() { if (state.playing) { clearInterval(state.playing); state.playing = null; } $('replay-play').textContent = '▶'; $('replay-play').setAttribute('aria-label','Play timeline'); }
function refreshStats(all, visible) {
  const stats = eventStatistics(visible);
  setText('total-count', shortNumber(stats.count));
  setText('max-mag', stats.strongest ? stats.strongest.mag.toFixed(1) : '—');
  setText('average-depth', stats.avgDepth === null ? '—' : stats.avgDepth.toFixed(0));
  const near = all.filter(e => haversineKm(getCity().lat, getCity().lon, e.lat, e.lon) <= state.radius);
  setText('city-count', shortNumber(near.length));
  setText('city-caption', `Within ${state.radius.toLocaleString()} km of ${getCity().label.split(',')[0]}`);
  setText('strongest-caption', stats.strongest ? stats.strongest.place : 'No events match these filters');
  setText('showing-count', `${shortNumber(visible.length)} PLOTTED`);
  setText('map-chip-text', state.view === 'radius' ? `${getCity().label.split(',')[0].toUpperCase()} · ${state.radius} KM` : 'GLOBAL VIEW');
  const nearest = all.length ? all.reduce((min, e) => {
    const km = haversineKm(getCity().lat, getCity().lon, e.lat, e.lon);
    return km < min.km ? { km, event: e } : min;
  }, { km: Infinity, event: null }) : null;
  setText('nearest-distance', nearest ? `${shortNumber(Math.round(nearest.km))} km` : '—');
  setText('nearest-caption', nearest ? `M ${nearest.event.mag.toFixed(1)} · ${nearest.event.place}` : 'No events in this time and magnitude range');
  setText('city-analysis-label', `${getCity().label.split(',')[0].toUpperCase()} / ${state.radius} KM`);
  setText('filter-message', '');
  const help = $('filter-message'); const span = document.createElement('span'); span.textContent = '✧'; const p = document.createElement('p');
  p.textContent = state.view === 'global' ? 'Switch to City lens to see the selected search radius on the map.' : `${near.length} events recorded within ${state.radius} km. Proximity is not a risk prediction.`;
  help.replaceChildren(span, p);
}
function renderFeed(events) {
  $('feed-count').textContent = String(events.length).padStart(2,'0');
  const box = $('feed-items'); box.replaceChildren();
  if (!events.length) { const div = document.createElement('div'); div.className = 'feed-empty'; div.textContent = 'No recorded events match these filters. Widen the radius, lower the magnitude, or use Global view.'; box.append(div); }
  const fragment = document.createDocumentFragment();
  events.slice(0, state.shown).forEach(e => {
    const btn = document.createElement('button'); btn.className = `feed-item ${e.id === state.selectedId ? 'selected' : ''}`; btn.dataset.id = e.id;
    const top = document.createElement('div'); top.className = 'feed-item-top';
    const mag = document.createElement('span'); mag.className = `mag-pill ${e.mag >= 6 ? 'red' : e.mag >= 4 ? 'orange' : ''}`; mag.textContent = `M ${e.mag.toFixed(1)}`;
    const time = document.createElement('span'); time.className = 'feed-time'; time.textContent = formatTime(e.time);
    top.append(mag,time);
    const location = document.createElement('div'); location.className='feed-location'; location.textContent=e.place;
    const detail = document.createElement('div'); detail.className='feed-sub';
    const d = document.createElement('span'); d.textContent = `${e.depth === null ? 'Unknown' : Math.round(e.depth) + ' km'} deep`;
    const arrow = document.createElement('span'); arrow.className='feed-arrow'; arrow.textContent='INSPECT ↗'; detail.append(d,arrow);
    btn.append(top, location, detail); btn.addEventListener('click', () => selectEvent(e.id)); fragment.append(btn);
  }); box.append(fragment);
  $('feed-more').hidden = events.length <= state.shown;
}
function renderTrend(events) {
  // Activity chart shows events in the chosen magnitude/city window, independent of playback position.
  const histogram = dailyHistogram(events, state.now, state.days);
  const max = Math.max(1, ...histogram);
  const chart = $('trend-chart'); chart.replaceChildren();
  const fragment = document.createDocumentFragment();
  histogram.forEach((count, i) => {
    const bar = document.createElement('div'); bar.className = 'chart-bar';
    bar.style.height = `${Math.max(2, count / max * 100)}%`;
    const day = state.now - (state.days - i) * DAY;
    bar.dataset.info = `${dayLabel(day)}: ${count} events`;
    bar.title = bar.dataset.info;
    fragment.append(bar);
  }); chart.append(fragment);
  setText('trend-date-start', dayLabel(state.now - state.days * DAY)); setText('trend-date-end', dayLabel(state.now));
}
function refreshTimeline() {
  const slider = $('replay-slider'); slider.max = state.days; slider.value = state.replayDay;
  setText('replay-label', state.replayDay >= state.days ? `Full ${state.days}-day window` : `${dayLabel(state.now - state.days * DAY)} – ${dayLabel(state.now - (state.days - state.replayDay) * DAY)}`);
}
function refresh() {
  const all = baseEvents(); const shown = visibleEvents();
  refreshStats(all, shown); renderFeed(shown);
  renderTrend(filterEvents(state.events, { now: state.now, days: state.days, minMag: state.minMag, city: getCity(), radiusKm: state.radius, cityOnly: state.view === 'radius', replayDay: state.days }));
  refreshTimeline(); refreshComparison(); refreshMap(shown);
}
function mapStyleUrl() {
  if (cfg.amazonLocationApiKey && cfg.awsRegion && /^v1\.public\./.test(cfg.amazonLocationApiKey)) {
    const awsStyle = state.mapStyle === 'Standard' ? 'Standard' : 'Monochrome';
    return `https://maps.geo.${cfg.awsRegion}.amazonaws.com/v2/styles/${awsStyle}/descriptor?key=${encodeURIComponent(cfg.amazonLocationApiKey)}&color-scheme=Dark`;
  }
  return state.mapStyle === 'Standard' ? 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json' : 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';
}
function showMapFailure(message) { $('map-fallback-msg').textContent = message; $('map-fallback').hidden = false; }
function initMap() {
  if (!window.maplibregl) { showMapFailure('MapLibre library unavailable. Your network may block the map CDN.'); return; }
  $('map-fallback').hidden = true;
  try {
    if (state.map) { state.map.remove(); state.map = null; }
    state.mapLoaded = false;
    const map = new window.maplibregl.Map({ container:'map', style:mapStyleUrl(), center: [69,29], zoom:2.2, minZoom:1.2, maxZoom:13, attributionControl: false, validateStyle: false, antialias: true });
    state.map = map;
    map.addControl(new window.maplibregl.NavigationControl({ showCompass: true }), 'bottom-right');
    map.addControl(new window.maplibregl.AttributionControl({ compact: true }), 'bottom-left');
    map.on('load', () => { state.mapLoaded = true; $('map-fallback').hidden = true; ensureLayers(); refreshMap(visibleEvents()); });
    map.on('style.load', () => { state.mapLoaded = true; $('map-fallback').hidden = true; ensureLayers(); refreshMap(visibleEvents()); });
    map.on('mousemove', e => { setText('map-coords', `${Math.abs(e.lngLat.lat).toFixed(2)}° ${e.lngLat.lat >= 0 ? 'N' : 'S'} · ${Math.abs(e.lngLat.lng).toFixed(2)}° ${e.lngLat.lng >= 0 ? 'E' : 'W'}`); });
    map.on('click', 'quakes-points', e => { const id = e.features?.[0]?.properties?.id; if (id) selectEvent(id); });
    map.on('click', 'quakes-clusters', async e => { const clusterId = e.features?.[0]?.properties?.cluster_id; const source = map.getSource('quakes'); if (!source || clusterId == null) return; try { const zoom = await source.getClusterExpansionZoom(clusterId); map.easeTo({ center:e.lngLat, zoom, duration:700 }); } catch(error) { console.warn('Cluster zoom failed', error); } });
    map.on('mouseenter','quakes-points', () => { map.getCanvas().style.cursor='pointer'; }); map.on('mouseleave','quakes-points', () => { map.getCanvas().style.cursor=''; });
    map.on('mouseenter','quakes-clusters', () => { map.getCanvas().style.cursor='zoom-in'; }); map.on('mouseleave','quakes-clusters', () => { map.getCanvas().style.cursor=''; });
    map.on('error', e => { if (!state.mapLoaded) console.warn('Map load issue:', e?.error?.message ?? 'unknown'); });
    setTimeout(() => { if (state.map === map && !state.mapLoaded) showMapFailure(cfg.amazonLocationApiKey ? 'Amazon Location map failed. Check your AWS region, API-key actions and allowed website referer.' : 'Preview basemap failed to load. Check your internet connection.'); }, 12000);
  } catch(error) { showMapFailure(`Could not initialize the map: ${error.message}`); }
}
function ensureLayers() {
  const map = state.map; if (!map || !map.isStyleLoaded()) return;
  if (!map.getSource('city-ring')) map.addSource('city-ring', { type:'geojson', data: emptyFeatureCollection() });
  if (!map.getLayer('city-fill')) map.addLayer({ id:'city-fill', type:'fill', source:'city-ring', paint:{ 'fill-color':'#b8f18b', 'fill-opacity':0.095 } });
  if (!map.getLayer('city-outline')) map.addLayer({ id:'city-outline', type:'line', source:'city-ring', paint:{ 'line-color':'#b8f18b','line-opacity':0.7,'line-width':1.5,'line-dasharray':[3,2] } });
  if (!map.getSource('quakes')) map.addSource('quakes', {type:'geojson',data:emptyFeatureCollection(),cluster:true,clusterRadius:38,clusterMaxZoom:8});
  if (!map.getLayer('quakes-clusters')) map.addLayer({id:'quakes-clusters',type:'circle',source:'quakes',filter:['has','point_count'],paint:{'circle-color':'#395a51','circle-opacity':0.87,'circle-stroke-color':'#b8f18b','circle-stroke-width':1,'circle-radius':['step',['get','point_count'],16,15,21,100,27]}});
  if (!map.getLayer('quakes-count')) map.addLayer({id:'quakes-count',type:'symbol',source:'quakes',filter:['has','point_count'],layout:{'text-field':['get','point_count_abbreviated'],'text-size':11,'text-font':['Open Sans Bold','Arial Unicode MS Bold']},paint:{'text-color':'#e2ffe0'}});
  if (!map.getLayer('quakes-halo')) map.addLayer({id:'quakes-halo',type:'circle',source:'quakes',filter:['!',['has','point_count']],paint:{'circle-color':['step',['get','mag'],'#b8f18b',4,'#ffa55a',6,'#ed6a6b'],'circle-radius':['interpolate',['linear'],['get','mag'],2.5,9,5,16,8,29],'circle-opacity':0.12}});
  if (!map.getLayer('quakes-points')) map.addLayer({id:'quakes-points',type:'circle',source:'quakes',filter:['!',['has','point_count']],paint:{'circle-color':['step',['get','mag'],'#b8f18b',4,'#ffa55a',6,'#ed6a6b'],'circle-radius':['interpolate',['linear'],['get','mag'],2.5,4,5,7,8,12],'circle-stroke-color':'#0d1824','circle-stroke-width':1.2,'circle-opacity':0.93}});
  if (!map.getSource('city-marker')) map.addSource('city-marker', {type:'geojson',data:emptyFeatureCollection()});
  if (!map.getLayer('city-marker-halo')) map.addLayer({id:'city-marker-halo',type:'circle',source:'city-marker',paint:{'circle-color':'#b8f18b','circle-radius':20,'circle-opacity':0.15}});
  if (!map.getLayer('city-marker-point')) map.addLayer({id:'city-marker-point',type:'circle',source:'city-marker',paint:{'circle-color':'#b8f18b','circle-radius':7,'circle-stroke-color':'#10251c','circle-stroke-width':2}});
}
function refreshMap(events) {
  const map = state.map;
  if (!map || !map.isStyleLoaded() || !map.getSource('quakes')) return;
  map.getSource('quakes').setData(toFeatureCollection(events));
  const city = getCity(), on = state.view === 'radius';
  map.getSource('city-ring').setData(on ? makeRadiusPolygon(city.lat, city.lon, state.radius) : emptyFeatureCollection());
  map.getSource('city-marker').setData(on ? {type:'FeatureCollection',features:[{type:'Feature',geometry:{type:'Point',coordinates:[city.lon,city.lat]},properties:{name:city.label}}]} : emptyFeatureCollection());
}
function moveToCity() {
  const city = getCity();
  if (!state.map || !state.mapLoaded) return;
  const zoom = state.radius === 250 ? 6.5 : state.radius === 500 ? 5.6 : 4.55;
  state.map.flyTo({center:[city.lon,city.lat],zoom,duration:1000,essential:true});
}
function popupContent(e) {
  const root = document.createElement('div');
  const over = document.createElement('div'); over.className='popup-overline'; over.textContent=`SEISMIC EVENT · ${formatTime(e.time)}`;
  const title = document.createElement('div'); title.className='popup-title'; title.textContent=e.place;
  const details = document.createElement('div'); details.className='popup-details';
  for (const [name,value] of [['MAGNITUDE',`M ${e.mag.toFixed(1)}`],['DEPTH',e.depth === null ? 'N/A' : `${Math.round(e.depth)} km`],['CITY DISTANCE',`${Math.round(haversineKm(getCity().lat,getCity().lon,e.lat,e.lon))} km`],['COORDINATES',`${e.lat.toFixed(2)}, ${e.lon.toFixed(2)}`]]) {
    const cell = document.createElement('div'); cell.textContent=name; const strong = document.createElement('strong'); strong.textContent=value; cell.append(strong); details.append(cell);
  }
  root.append(over,title,details);
  if (e.url) {const a = document.createElement('a'); a.className='popup-link'; a.href=e.url; a.target='_blank'; a.rel='noopener noreferrer'; a.textContent='VIEW VERIFIED USGS RECORD ↗'; root.append(a);}
  return root;
}
function selectEvent(id) {
  const e = state.events.find(item => item.id === id);
  if (!e) return;
  state.selectedId = id;
  renderFeed(visibleEvents());
  const btn = [...document.querySelectorAll('.feed-item')].find(el=>el.dataset.id===id);
  btn?.scrollIntoView({behavior:'smooth',block:'nearest'});
  if (!state.map || !state.mapLoaded) {toast(`${e.place} · M ${e.mag.toFixed(1)}`);return;}
  state.map.flyTo({center:[e.lon,e.lat], zoom:Math.max(5,state.map.getZoom()),duration:850,essential:true});
  state.popup?.remove(); state.popup = new window.maplibregl.Popup({closeOnMove:false,maxWidth:'290px'}).setLngLat([e.lon,e.lat]).setDOMContent(popupContent(e)).addTo(state.map);
}
function setView(view) {
  state.view = view;
  $('view-global').classList.toggle('selected',view==='global'); $('view-radius').classList.toggle('selected',view==='radius');
  refresh();
  if (view === 'radius') moveToCity(); else state.map?.flyTo({center:[69,29],zoom:2.2,duration:1050});
}
function syncControls() {
  $('city-select').value=state.cityId; $('time-filter').value=String(state.days); $('min-mag').value=String(state.minMag);
  setText('min-mag-value',`M ${state.minMag.toFixed(1)}+`);
  document.querySelectorAll('[data-radius]').forEach(b=>b.classList.toggle('selected',Number(b.dataset.radius)===state.radius));
  $('view-global').classList.toggle('selected',state.view==='global'); $('view-radius').classList.toggle('selected',state.view==='radius');
}
function bind() {
  for (const id of ['compare-left','compare-right']) {
    const select=$(id);
    for (const [key,city] of Object.entries(CITY_PRESETS)) { const option=document.createElement('option');option.value=key;option.textContent=city.label;select.append(option); }
  }
  $('compare-left').value=state.compareLeft; $('compare-right').value=state.compareRight;
  $('compare-left').addEventListener('change',e=>{state.compareLeft=e.target.value;refreshComparison();});
  $('compare-right').addEventListener('change',e=>{state.compareRight=e.target.value;refreshComparison();});
  $('compare-radius').addEventListener('change',e=>{state.compareRadius=Number(e.target.value);refreshComparison();});
  for (const side of ['left','right']) $(`compare-${side}-open`).addEventListener('click',()=>{
    state.cityId=side==='left'?state.compareLeft:state.compareRight;state.radius=state.compareRadius;syncControls();setView('radius');document.querySelector('.explorer').scrollIntoView({behavior:'smooth'});
  });
  $('city-select').addEventListener('change',e=>{state.cityId=e.target.value;refresh();if(state.view==='radius')moveToCity();});
  document.querySelectorAll('[data-radius]').forEach(button=>button.addEventListener('click',()=>{state.radius=Number(button.dataset.radius);syncControls();refresh();if(state.view==='radius')moveToCity();}));
  $('min-mag').addEventListener('input',e=>{state.minMag=Number(e.target.value);setText('min-mag-value',`M ${state.minMag.toFixed(1)}+`);refresh();});
  $('time-filter').addEventListener('change',e=>{stopReplay();state.days=Number(e.target.value);state.replayDay=state.days;refresh();});
  document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));
  $('reset-btn').addEventListener('click',()=>{stopReplay();Object.assign(state,{cityId:'islamabad',radius:500,minMag:2.5,days:30,view:'global',replayDay:30,shown:6});syncControls();setView('global');toast('All filters reset');});
  $('map-style').addEventListener('click',()=>{state.mapStyle=state.mapStyle==='Standard'?'Monochrome':'Standard';if(state.map) {state.mapLoaded=false;state.map.setStyle(mapStyleUrl(),{diff:false});setTimeout(()=>{if(state.map&&!state.mapLoaded)showMapFailure('Map style could not load; check your API key or network.');},12000);}toast(state.mapStyle==='Standard'?'Standard basemap selected':'Monochrome basemap selected');});
  $('map-recenter').addEventListener('click',()=>moveToCity());
  $('map-retry').addEventListener('click',initMap);
  $('data-retry').addEventListener('click',loadEvents);
  $('tip-close').addEventListener('click',()=>{$('map-tip').hidden=true;});
  $('feed-more').addEventListener('click',()=>{state.shown+=6;renderFeed(visibleEvents());});
  $('replay-slider').addEventListener('input',e=>{stopReplay();state.replayDay=Number(e.target.value);refresh();});
  $('replay-reset').addEventListener('click',()=>{stopReplay();state.replayDay=state.days;refresh();});
  $('replay-play').addEventListener('click',()=>{
    if(state.playing){stopReplay();return;}
    if(state.replayDay>=state.days)state.replayDay=0;
    $('replay-play').textContent='Ⅱ';$('replay-play').setAttribute('aria-label','Pause timeline');refresh();
    state.playing=setInterval(()=>{state.replayDay++;if(state.replayDay>=state.days){state.replayDay=state.days;stopReplay();}refresh();},420);
  });
  $('tour-btn').addEventListener('click',()=>{state.cityId='islamabad';state.radius=1000;state.view='radius';state.minMag=2.5;state.days=30;state.replayDay=30;syncControls();setView('radius');document.querySelector('.explorer').scrollIntoView({behavior:'smooth'});toast('Story mode: explore historical seismic activity around Islamabad.');});
  $('city-activate').addEventListener('click',()=>{setView('radius');document.querySelector('.explorer').scrollIntoView({behavior:'smooth'});});
  $('nav-map').addEventListener('click',()=>document.querySelector('.explorer').scrollIntoView({behavior:'smooth'}));
  $('nav-insights').addEventListener('click',()=>document.querySelector('#insights').scrollIntoView({behavior:'smooth'}));
  const close=()=>{$('about-modal').hidden=true;};
  $('nav-about').addEventListener('click',()=>{$('about-modal').hidden=false;}); $('modal-close').addEventListener('click',close);$('modal-backdrop').addEventListener('click',close);document.addEventListener('keydown',e=>{if(e.key==='Escape')close();});
  $('mobile-filters').addEventListener('click',()=>{$('filter-panel').classList.toggle('expanded');document.querySelector('.explorer').scrollIntoView({behavior:'smooth'});});
}
bind();syncControls();initMap();loadEvents();
