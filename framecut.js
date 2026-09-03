/* Framecut — pick a crop visually, get exact numbers back.
 *
 * Works three ways, in order of least setup:
 *   1. Drop image files (or pick a folder) onto the page. No server, no config.
 *   2. Point CONFIG.manifest at a JSON array of image paths.
 *   3. Point CONFIG.scanPage at a same-origin page; Framecut opens it hidden and
 *      measures where each image actually sits, so the advice is about real slots.
 *
 * Everything is measured against a canvas holding the image already rotated, so
 * the numbers always describe what you are looking at.
 */

const CONFIG = {
  // Optional: JSON file containing ["images/a.jpg", "images/b.png", ...]
  manifest: './images.json',
  // Optional: same-origin page to scan for real containers, e.g. './index.html'
  scanPage: null,
  // Prefix joined to manifest paths when loading them
  base: './',
  // Tabs/panels to click through while scanning, so hidden images get measured
  scanClickSelectors: ['button[role="tab"]', '[data-tab]', '.tab'],
};

const AR_DEFAULT = 4 / 3;
let images = [];            // {name, url, revoke?}
let current = null, ar = AR_DEFAULT, posX = 50, posY = 50, zoom = 1;
let rot = 0, srcImg = null, stageCanvas = null, rotatedURL = null;
let USAGE = null;           // path -> [{tab,w,h,fit,pos}]
let manualSlot = null;      // {w,h} typed by hand

const $ = id => document.getElementById(id);

/* ---------------------------------------------------------------- sources */

function addFiles(fileList){
  const added = [];
  [...fileList].forEach(f => {
    if (!/^image\//.test(f.type)) return;
    const url = URL.createObjectURL(f);
    const name = f.webkitRelativePath || f.name;
    if (images.some(i => i.name === name)) return;
    images.push({ name, url, local: true });
    added.push(name);
  });
  images.sort((a, b) => a.name.localeCompare(b.name));
  renderList();
  if (added.length) note_scan(images.length + ' image' + (images.length > 1 ? 's' : '') + ' loaded.');
  return added.length;
}

function note_scan(text){ $('scan').textContent = text; }

async function loadManifest(){
  if (!CONFIG.manifest) return false;
  try {
    const r = await fetch(CONFIG.manifest, { cache: 'no-store' });
    if (!r.ok) return false;
    const list = await r.json();
    if (!Array.isArray(list) || !list.length) return false;
    images = list.map(p => ({ name: p, url: CONFIG.base + p }));
    images.sort((a, b) => a.name.localeCompare(b.name));
    renderList();
    return true;
  } catch (e) { return false; }
}

/* Open the site in a hidden iframe and measure every image's real container.
   Falls back silently: without it you can still type a slot size by hand. */
function scanSite(){
  return new Promise(resolve => {
    if (!CONFIG.scanPage) return resolve(null);
    const f = document.createElement('iframe');
    f.style.cssText = 'position:fixed;left:-9999px;top:0;width:1440px;height:900px;border:0';
    f.src = CONFIG.scanPage;
    f.onload = async () => {
      try {
        const d = f.contentDocument, win = f.contentWindow, map = {};
        const fire = el => ['pointerdown','mousedown','pointerup','mouseup','click']
          .forEach(ev => el.dispatchEvent(new win.PointerEvent(
            ev, { bubbles:true, cancelable:true, pointerId:1, button:0, isPrimary:true })));
        const grab = label => {
          d.querySelectorAll('img').forEach(i => i.loading = 'eager');
          [...d.querySelectorAll('img')].forEach(im => {
            const src = (im.getAttribute('src') || '').replace(/^\.\//, '').split('?')[0];
            const r = im.getBoundingClientRect();
            if (!src || r.width < 4) return;
            const cs = win.getComputedStyle(im);
            const rec = { tab: label, w: Math.round(r.width), h: Math.round(r.height),
                          fit: cs.objectFit, pos: cs.objectPosition };
            const l = map[src] = map[src] || [];
            if (!l.some(x => x.tab === rec.tab && x.w === rec.w && x.h === rec.h)) l.push(rec);
          });
        };
        await new Promise(r => setTimeout(r, 2200));
        grab('page');
        for (const sel of CONFIG.scanClickSelectors){
          for (const el of [...d.querySelectorAll(sel)]){
            fire(el); await new Promise(r => setTimeout(r, 550));
            grab((el.textContent || 'section').trim().slice(0, 40) || 'section');
          }
        }
        resolve(map);
      } catch (e) { resolve(null); }
      finally { setTimeout(() => f.remove(), 250); }
    };
    f.onerror = () => resolve(null);
    document.body.appendChild(f);
  });
}

/* ------------------------------------------------------------------ list */

function renderList(){
  const q = $('q').value.trim().toLowerCase();
  const shown = images.filter(i => !q || i.name.toLowerCase().includes(q));
  const el = $('list');
  el.innerHTML = '';
  shown.forEach(i => {
    const b = document.createElement('button');
    b.textContent = i.name;
    b.title = i.name;
    if (i.name === current) b.className = 'on';
    b.onclick = () => pick(i.name);
    el.appendChild(b);
  });
  if (!shown.length) el.innerHTML = '<p class="scan">' +
    (images.length ? 'No match.' : 'Nothing loaded yet.') + '</p>';
}
$('q').oninput = renderList;

/* ----------------------------------------------------------- stage/canvas */

function renderStage(){
  if (!srcImg) return null;
  const a = rot * Math.PI / 180;
  const c = Math.abs(Math.cos(a)), s = Math.abs(Math.sin(a));
  const W = Math.round(srcImg.naturalWidth * c + srcImg.naturalHeight * s);
  const H = Math.round(srcImg.naturalWidth * s + srcImg.naturalHeight * c);
  const cv = stageCanvas;
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#e9edeb'; ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.rotate(a);
  ctx.drawImage(srcImg, -srcImg.naturalWidth / 2, -srcImg.naturalHeight / 2);
  ctx.restore();
  cv.naturalWidth = W; cv.naturalHeight = H;   // the rest of the tool reads these
  rotatedURL = null;
  return cv;
}

function pick(name, keepPos){
  const entry = images.find(i => i.name === name);
  if (!entry) return;
  current = name;
  if (!keepPos) { posX = 50; posY = 50; }
  renderList();
  const wrap = $('stageWrap');
  wrap.innerHTML = '';
  const stage = document.createElement('div');
  stage.className = 'stage';
  const img = new Image();
  // never let a cached copy report dimensions the file no longer has
  img.src = entry.local ? entry.url : entry.url + (entry.url.includes('?') ? '&' : '?') + 't=' + Date.now();
  img.onload = () => {
    srcImg = img;
    stageCanvas = document.createElement('canvas');
    renderStage();
    stage.appendChild(stageCanvas);
    const box = document.createElement('div');
    box.className = 'box';
    stage.appendChild(box);
    wrap.appendChild(stage);
    layout(stageCanvas, box);
    drag(stageCanvas, box);
    $('hint').textContent = name + ' — ' + img.naturalWidth + ' × ' + img.naturalHeight + ' px';
  };
  img.onerror = () => { wrap.innerHTML = '<p class="empty">Could not load that image.</p>'; };
}

/* At 100% zoom the box is the largest rect of the chosen shape that fits, which is
   exactly what object-fit:cover shows. Zooming shrinks it — a genuine crop. */
function geom(img){
  const W = img.clientWidth, H = img.clientHeight;
  let w, h;
  if (ar === 'free') { w = W; h = H; }
  else { w = W; h = W / ar; if (h > H) { h = H; w = H * ar; } }
  return { W, H, w: w / zoom, h: h / zoom };
}
function layout(img, box){
  const { W, H, w, h } = geom(img);
  box.style.width = w + 'px'; box.style.height = h + 'px';
  box.style.left = (W - w) * (posX / 100) + 'px';
  box.style.top  = (H - h) * (posY / 100) + 'px';
  emit(img);
}
function drag(img, box){
  let sx, sy, ox, oy, on = false;
  box.addEventListener('pointerdown', e => {
    // record the origin BEFORE capturing: setPointerCapture can throw, and the
    // drag maths would then run on undefined offsets
    sx = e.clientX; sy = e.clientY; ox = box.offsetLeft; oy = box.offsetTop;
    on = true; box.classList.add('drag');
    try { box.setPointerCapture(e.pointerId); } catch (_) {}
  });
  box.addEventListener('pointermove', e => {
    if (!on) return;
    const { W, H, w, h } = geom(img);
    const nx = Math.min(Math.max(0, ox + e.clientX - sx), W - w);
    const ny = Math.min(Math.max(0, oy + e.clientY - sy), H - h);
    posX = (W - w) > 0.5 ? nx / (W - w) * 100 : 50;
    posY = (H - h) > 0.5 ? ny / (H - h) * 100 : 50;
    box.style.left = nx + 'px'; box.style.top = ny + 'px';
    emit(img);
  });
  box.addEventListener('pointerup', () => { on = false; box.classList.remove('drag'); });
  window.addEventListener('resize', () => layout(img, box));
}

/* ------------------------------------------------------------- controls */

document.querySelectorAll('.chip[data-ar]').forEach(c => c.onclick = () => {
  document.querySelectorAll('.chip[data-ar]').forEach(x => x.classList.remove('on'));
  c.classList.add('on');
  ar = c.dataset.ar === 'free' ? 'free' : parseFloat(c.dataset.ar);
  if (current) pick(current, true);
});
$('zoom').oninput = e => {
  zoom = parseInt(e.target.value, 10) / 100;
  $('zoomVal').textContent = e.target.value + '%';
  const box = document.querySelector('.box');
  if (stageCanvas && box) layout(stageCanvas, box);
};
$('zreset').onclick = () => {
  $('zoom').value = 100; zoom = 1; $('zoomVal').textContent = '100%';
  posX = 50; posY = 50;
  const box = document.querySelector('.box');
  if (stageCanvas && box) layout(stageCanvas, box);
};
function applyRotation(deg){
  rot = ((deg % 360) + 360) % 360;
  if (rot > 180) rot -= 360;
  $('rot').value = rot; $('rotVal').textContent = rot + '°';
  if (!srcImg) return;
  renderStage();
  const box = document.querySelector('.box');
  if (box) layout(stageCanvas, box);
}
$('rot').oninput = e => applyRotation(parseInt(e.target.value, 10));
document.querySelectorAll('.chip[data-rot]').forEach(c =>
  c.onclick = () => applyRotation(rot + parseInt(c.dataset.rot, 10)));
$('rreset').onclick = () => applyRotation(0);

function readSlot(){
  const w = parseInt($('cw').value, 10), h = parseInt($('ch').value, 10);
  manualSlot = (w > 0 && h > 0) ? { w, h } : null;
  if (stageCanvas) { advise(stageCanvas); preview(stageCanvas); }
}
$('cw').oninput = readSlot;
$('ch').oninput = readSlot;

/* --------------------------------------------------------------- output */

function ratioLabel(){
  if (ar === 'free') return 'original shape';
  const named = [[4/3,'4:3'],[1,'1:1'],[16/9,'16:9'],[3/4,'3:4'],[3/2,'3:2']];
  const hit = named.find(([v]) => Math.abs(v - ar) < 0.02);
  return hit ? hit[1] : (Math.round(ar * 1000) / 1000 + '');
}
function shapeName(r){
  const named = [[4/3,'4:3'],[1,'square'],[16/9,'16:9'],[3/4,'3:4 tall'],[3/2,'3:2'],
                 [2/3,'2:3 tall'],[21/9,'21:9 banner'],[5/4,'5:4'],[4/5,'4:5 tall']];
  const hit = named.find(([v]) => Math.abs(v - r) < 0.04);
  if (hit) return hit[1];
  let best = null;
  for (let d = 1; d <= 16; d++){
    const n = Math.round(r * d);
    if (!n) continue;
    const err = Math.abs(n / d - r);
    if (!best || err < best.err) best = { n, d, err };
  }
  return best.n < best.d ? best.n + ':' + best.d + ' tall' : best.n + ':' + best.d;
}
function slotsFor(){
  const fromScan = USAGE && USAGE[current];
  if (fromScan && fromScan.length) return fromScan;
  if (manualSlot) return [{ tab: 'your container', w: manualSlot.w, h: manualSlot.h,
                            fit: 'cover', pos: '50% 50%' }];
  return [];
}

function emit(img){
  const { W, H, w, h } = geom(img);
  const fixedX = (W - w) < 1, fixedY = (H - h) < 1;
  const px = Math.round(posX), py = Math.round(posY);

  let line = current + ' — shape ' + ratioLabel();
  if (rot) line += ', rotated ' + rot + '°';
  if (zoom > 1.001) line += ', zoomed ' + Math.round(zoom * 100) + '%';
  line += ', show ';
  if (fixedX && fixedY)      line += 'the whole image (nothing is cropped here)';
  else if (fixedX)           line += py + '% down from the top';
  else if (fixedY)           line += px + '% across from the left';
  else                       line += px + '% across, ' + py + '% down';

  let how;
  if (zoom > 1.001 || rot) {
    const s = img.naturalWidth / W;
    let cw = Math.round(w * s), ch = Math.round(h * s);
    let cx = Math.round((W - w) * (posX / 100) * s);
    let cy = Math.round((H - h) * (posY / 100) * s);
    cw = Math.min(cw, img.naturalWidth);  ch = Math.min(ch, img.naturalHeight);
    cx = Math.max(0, Math.min(cx, img.naturalWidth  - cw));
    cy = Math.max(0, Math.min(cy, img.naturalHeight - ch));
    how = (rot ? 'Rotate the file by ' + rot + '°, then crop' : 'Crop the file')
        + ' to ' + cw + ' x ' + ch + ' px, starting ' + cx + ' px from the left and '
        + cy + ' px from the top.\n'
        + (rot ? '(after rotating it is ' + img.naturalWidth + ' x ' + img.naturalHeight
                 + ' px; it started at ' + srcImg.naturalWidth + ' x ' + srcImg.naturalHeight + ' px)'
               : '(source is ' + img.naturalWidth + ' x ' + img.naturalHeight + ' px)');
  } else {
    how = 'CSS: aspect-ratio: ' + (ar === 'free' ? 'auto' : ratioLabel())
        + '; object-fit: cover; object-position: ' + px + '% ' + py + '%;';
  }
  $('msg').textContent = line + '\n\n' + how;
  $('out').hidden = false;
  advise(img);
  preview(img);
}

function previewSrc(){
  const entry = images.find(i => i.name === current) || {};
  if (!rot) return entry.local ? entry.url : entry.url + '?t=' + Date.now();
  if (!rotatedURL && stageCanvas) {
    try { rotatedURL = stageCanvas.toDataURL('image/jpeg', 0.9); } catch (e) { return entry.url; }
  }
  return rotatedURL || entry.url;
}

function preview(img){
  const wrap = $('previewWrap'), row = $('pvRow');
  const uses = slotsFor();
  if (!uses.length) { wrap.hidden = true; return; }
  const px = Math.round(posX), py = Math.round(posY);
  row.innerHTML = '';
  const src = previewSrc();
  uses.forEach(u => {
    const scale = Math.min(1, 380 / u.w);
    const fig = document.createElement('figure');
    fig.className = 'pv';
    fig.innerHTML =
      '<div class="slot" style="width:' + Math.round(u.w * scale) + 'px;height:'
        + Math.round(u.h * scale) + 'px">'
      + '<img src="' + src + '" style="object-fit:' + (u.fit || 'cover')
        + ';object-position:' + px + '% ' + py + '%'
        + (zoom > 1.001 ? ';transform:scale(' + zoom.toFixed(2) + ');transform-origin:'
             + px + '% ' + py + '%' : '') + '">'
      + '</div><figcaption>' + u.tab + ' — ' + u.w + ' × ' + u.h + ' px'
      + (scale < 1 ? ' (at ' + Math.round(scale * 100) + '%)' : '') + '</figcaption>';
    row.appendChild(fig);
  });
  wrap.hidden = false;
}

function note(kind, tag, html){
  return '<div class="note ' + kind + '"><span class="tag">' + tag + '</span><span>' + html + '</span></div>';
}

function advise(img){
  const el = $('advice');
  const uses = slotsFor();
  const NW = img.naturalWidth, NH = img.naturalHeight;
  if (!uses.length) {
    el.innerHTML = note('info', 'no slot',
      'Type the container size above (or set <b>CONFIG.scanPage</b>) and Framecut will warn you '
      + 'about crops that cut too much or land below the resolution the slot needs.');
    el.hidden = false; return;
  }
  let out = '';
  uses.forEach(u => {
    const cAr = u.w / u.h;
    out += note('info', 'slot', '<b>' + u.tab + '</b> — ' + u.w + ' × ' + u.h + ' px ('
              + shapeName(cAr) + '), <b>object-fit: ' + (u.fit || 'cover') + '</b>.');

    if (u.fit === 'contain' || u.fit === 'fill') {
      out += note('ok', 'no crop',
        'This container shows the <b>whole image</b> — nothing is cut off, so cropping only helps '
        + 'if you want to remove something from the edges of the file itself.');
    } else {
      const s = Math.max(u.w / NW, u.h / NH);
      const visW = Math.min(NW, u.w / s), visH = Math.min(NH, u.h / s);
      const lost = Math.round((1 - (visW * visH) / (NW * NH)) * 100);
      if (lost >= 30)
        out += note('warn', lost + '% cut',
          'The slot is <b>' + shapeName(cAr) + '</b> but the image is <b>' + shapeName(NW / NH)
          + '</b>, so <b>' + lost + '%</b> gets cut. If the whole picture matters, change the '
          + 'container to ' + shapeName(NW / NH) + ' rather than fighting it with a crop.');
      else if (lost > 0)
        out += note('ok', lost + '% cut', 'Only ' + lost + '% is trimmed — this fits its slot well.');

      if (ar !== 'free' && Math.abs(ar - cAr) / cAr > 0.06)
        out += note('warn', 'shape',
          'You are framing at <b>' + ratioLabel() + '</b> but the slot is <b>' + shapeName(cAr)
          + '</b>. Match the shape, or change the container.');
    }

    const { W, H, w, h } = geom(img);
    const scale = NW / W;
    const cropW = Math.round(w * scale);
    const ratio = cropW / u.w;
    if (ratio < 1)
      out += note('bad', 'too small',
        'This leaves <b>' + cropW + ' px</b> of width for a <b>' + u.w + ' px</b> slot. '
        + 'It will be stretched and look blurry — zoom out, or find a bigger original.');
    else if (ratio < 1.6)
      out += note('warn', 'a bit soft',
        '<b>' + cropW + ' px</b> for a <b>' + u.w + ' px</b> slot. Fine on an ordinary screen, '
        + 'slightly soft on a retina display.');
    else
      out += note('ok', 'sharp', '<b>' + cropW + ' px</b> for a ' + u.w + ' px slot — sharp, including retina.');

    const coverW = (ar === 'free') ? W : (W / ar > H ? H * ar : W);
    const maxZoom = Math.floor((coverW * scale) / (u.w * 1.6) * 100);
    if (maxZoom >= 105)
      out += note('info', 'headroom',
        'You can zoom to about <b>' + Math.min(maxZoom, 400) + '%</b> before it starts looking soft.');
  });
  el.innerHTML = out;
  el.hidden = false;
}

$('copy').onclick = () => {
  navigator.clipboard.writeText($('msg').textContent).then(() => {
    const b = $('copy'); b.textContent = 'Copied'; setTimeout(() => b.textContent = 'Copy', 1200);
  });
};

/* ------------------------------------------------------------ drag & drop */

const drop = $('drop');
['dragenter','dragover'].forEach(ev => drop.addEventListener(ev, e => {
  e.preventDefault(); drop.classList.add('hot');
}));
['dragleave','drop'].forEach(ev => drop.addEventListener(ev, e => {
  e.preventDefault(); drop.classList.remove('hot');
}));
drop.addEventListener('drop', e => { if (e.dataTransfer?.files) addFiles(e.dataTransfer.files); });
document.addEventListener('dragover', e => e.preventDefault());
document.addEventListener('drop', e => {
  e.preventDefault();
  if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files);
});
$('pickFiles').onchange = e => addFiles(e.target.files);
$('pickDir').onchange  = e => addFiles(e.target.files);

/* ------------------------------------------------------------------ boot */

(async function boot(){
  const gotManifest = await loadManifest();
  if (!gotManifest) {
    note_scan('Drop images below to start.');
    renderList();
  }
  if (CONFIG.scanPage) {
    note_scan('Checking how each image is used…');
    const m = await scanSite();
    if (m && Object.keys(m).length) {
      USAGE = m;
      note_scan('Checked ' + Object.keys(m).length + ' images against their real containers.');
    } else {
      note_scan(gotManifest ? images.length + ' images loaded.' : 'Drop images below to start.');
    }
    if (stageCanvas) { advise(stageCanvas); preview(stageCanvas); }
  } else if (gotManifest) {
    note_scan(images.length + ' images loaded.');
  }
})();
