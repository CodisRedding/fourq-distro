const tbody = document.getElementById('tbody');
const overlay = document.getElementById('overlay');
const panel = document.getElementById('panel');
const lightbox = document.getElementById('lightbox');
const lightboxImg = document.getElementById('lightboxImg');

// Zoom is a CSS scale() on top of the image's normal fit-to-viewport size
// (so scale 1 = fully zoomed out), pan is a translate() alongside it. Wheel
// zooms in/out gradually, keeping the point under the cursor fixed; drag
// pans once zoomed in past 1x.
const MIN_ZOOM = 1;
const MAX_ZOOM = 8;
let lbZoom = 1;
let lbPanX = 0;
let lbPanY = 0;
let lbPanning = false;
let lbPanStartX = 0;
let lbPanStartY = 0;

function applyLightboxTransform() {
  lightboxImg.style.transform = `translate(${lbPanX}px, ${lbPanY}px) scale(${lbZoom})`;
  lightboxImg.classList.toggle('zoomed', lbZoom > MIN_ZOOM);
}

function openLightbox(src) {
  lightboxImg.src = src;
  lbZoom = 1;
  lbPanX = 0;
  lbPanY = 0;
  applyLightboxTransform();
  lightbox.classList.remove('hidden');
}
function closeLightbox() {
  lightbox.classList.add('hidden');
  lightboxImg.src = '';
}
lightbox.addEventListener('click', (e) => {
  if (e.target === lightbox) closeLightbox();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !lightbox.classList.contains('hidden')) closeLightbox();
});

lightboxImg.addEventListener('wheel', (e) => {
  e.preventDefault();
  const rect = lightbox.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const cursorX = e.clientX - centerX;
  const cursorY = e.clientY - centerY;

  const oldZoom = lbZoom;
  const factor = Math.exp(-e.deltaY * 0.0015);
  const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, oldZoom * factor));
  if (newZoom === oldZoom) return;

  // Keep the image point currently under the cursor fixed on screen.
  lbPanX = cursorX - (cursorX - lbPanX) * (newZoom / oldZoom);
  lbPanY = cursorY - (cursorY - lbPanY) * (newZoom / oldZoom);
  lbZoom = newZoom;
  if (lbZoom === MIN_ZOOM) { lbPanX = 0; lbPanY = 0; }
  applyLightboxTransform();
}, { passive: false });

lightboxImg.addEventListener('mousedown', (e) => {
  if (lbZoom <= MIN_ZOOM) return;
  e.preventDefault();
  lbPanning = true;
  lbPanStartX = e.clientX - lbPanX;
  lbPanStartY = e.clientY - lbPanY;
  lightboxImg.classList.add('panning');
});
window.addEventListener('mousemove', (e) => {
  if (!lbPanning) return;
  lbPanX = e.clientX - lbPanStartX;
  lbPanY = e.clientY - lbPanStartY;
  applyLightboxTransform();
});
window.addEventListener('mouseup', () => {
  lbPanning = false;
  lightboxImg.classList.remove('panning');
});
lightboxImg.addEventListener('dblclick', () => {
  lbZoom = 1;
  lbPanX = 0;
  lbPanY = 0;
  applyLightboxTransform();
});

const searchEl = document.getElementById('search');
const tierEl = document.getElementById('tierFilter');
const ebayEl = document.getElementById('ebayFilter');
const fbEl = document.getElementById('fbFilter');
const discogsEl = document.getElementById('discogsFilter');
const hideSoldEl = document.getElementById('hideSold');
const autoTagDeadwaxEl = document.getElementById('autoTagDeadwax');
const autoIdentifyEl = document.getElementById('autoIdentify');

async function loadSettings() {
  const s = await fetch('/api/settings').then(r => r.json());
  autoTagDeadwaxEl.checked = !!s.auto_tag_deadwax_photos;
  autoIdentifyEl.checked = !!s.auto_identify_from_photos;
}
autoTagDeadwaxEl.addEventListener('change', () => {
  fetch('/api/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ auto_tag_deadwax_photos: autoTagDeadwaxEl.checked })
  });
});
autoIdentifyEl.addEventListener('change', () => {
  fetch('/api/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ auto_identify_from_photos: autoIdentifyEl.checked })
  });
});

let gradeOptions = { media: [], sleeve: [] };
async function loadGradeOptions() {
  gradeOptions = await fetch('/api/grades').then(r => r.json());
}

function gradeSelect(id, options, current) {
  const opts = ['<option value="">(not set)</option>']
    .concat(options.map(g => `<option value="${g}" ${g === current ? 'selected' : ''}>${g}</option>`));
  return `<select id="${id}">${opts.join('')}</select>`;
}

const GRADE_MEANINGS = [
  ['M', 'Mint — perfect, essentially unplayed'],
  ['NM', 'Near Mint — no visible wear, plays cleanly'],
  ['VG+', 'Very Good Plus — light wear, minor marks, plays with barely any noise'],
  ['VG', 'Very Good — noticeable wear, some audible surface noise'],
  ['G+', 'Good Plus — significant wear, still fully playable'],
  ['G', 'Good — heavy wear, prominent surface noise'],
  ['F', 'Fair — well-worn, rough playback, may skip'],
  ['P', 'Poor — barely playable, major damage']
];
const SLEEVE_MEANINGS = [
  ['M', 'Mint — flawless; no ring wear, seam splits, creases, or writing'],
  ['NM', 'Near Mint — just about perfect; may have the slightest sign of handling but nothing that detracts'],
  ['VG+', 'Very Good Plus — minor ring wear, slightly turned-up corners, or light shelf wear; no major structural damage'],
  ['VG', 'Very Good — ring wear visible, possible seam wear or a small split (usually at the bottom seam), noticeable corner wear'],
  ['G+', 'Good Plus — significant ring wear, seam splits (may be taped), creases, and/or writing/stickers present'],
  ['G', 'Good — significant ring wear, seam splits (may be taped), creases, and/or writing/stickers present'],
  ['F', 'Fair — major damage: heavy seam splits, missing pieces, water damage, heavy writing, or barely holding together'],
  ['P', 'Poor — major damage: heavy seam splits, missing pieces, water damage, heavy writing, or barely holding together']
];
const SLEEVE_EXTRA_MEANINGS = [
  ['Generic', 'Plain blank sleeve, not the original artwork'],
  ['No Cover', 'No sleeve included at all'],
  ['Not Graded', 'Sleeve condition wasn\'t assessed']
];

function gradeInfoIcon(isSleeve) {
  const base = isSleeve ? SLEEVE_MEANINGS : GRADE_MEANINGS;
  const rows = base.concat(isSleeve ? SLEEVE_EXTRA_MEANINGS : [])
    .map(([code, desc]) => `<dt>${code}</dt><dd>${desc}</dd>`).join('');
  return `<span class="info-icon" tabindex="0">i<span class="tooltip"><dl>${rows}</dl></span></span>`;
}

function positionTooltip(e) {
  const icon = e.target.closest && e.target.closest('.info-icon');
  if (!icon) return;
  const tooltip = icon.querySelector('.tooltip');
  if (!tooltip) return;
  const margin = 8;
  tooltip.style.transform = 'translateX(-50%)';
  tooltip.classList.remove('tooltip-below');
  const rect = tooltip.getBoundingClientRect();
  const overflowRight = rect.right - (window.innerWidth - margin);
  const overflowLeft = margin - rect.left;
  if (overflowRight > 0) {
    tooltip.style.transform = `translateX(calc(-50% - ${overflowRight}px))`;
  } else if (overflowLeft > 0) {
    tooltip.style.transform = `translateX(calc(-50% + ${overflowLeft}px))`;
  }
  if (rect.top < margin) {
    tooltip.classList.add('tooltip-below');
  }
}
document.addEventListener('mouseover', positionTooltip, true);
document.addEventListener('focusin', positionTooltip);

function tierClass(tier) {
  if (tier.startsWith('Unsorted')) return 'tier-new';
  if (tier.startsWith('Tier 1')) return 'tier1';
  if (tier.startsWith('Tier 2')) return 'tier2';
  return 'tier3';
}
function tierShort(tier) {
  if (tier.startsWith('Unsorted')) return 'New · unsorted';
  if (tier.startsWith('Tier 1')) return tier.includes('no comp') ? 'T1 · no comp' : 'T1 · high value';
  if (tier.startsWith('Tier 2')) return 'T2 · lot';
  return 'T3 · bulk';
}

async function loadStats() {
  const stats = await fetch('/api/stats').then(r => r.json());
  document.getElementById('stats').innerHTML = `
    <span><strong>${stats.total}</strong> total</span>
    <span><strong>${stats.sold}</strong> sold</span>
    <span><strong>${stats.ebayListed}</strong> on eBay</span>
    <span><strong>${stats.fbListed}</strong> on FB</span>
    <span><strong>${stats.discogsListed}</strong> on Discogs</span>
    <span>eBay ${stats.ebayConfigured ? 'connected ✓' : '<em>not connected</em>'}</span>
  `;
}

async function loadTable() {
  const params = new URLSearchParams();
  if (searchEl.value) params.set('search', searchEl.value);
  if (tierEl.value) params.set('tier', tierEl.value);
  if (ebayEl.value) params.set('ebay_status', ebayEl.value);
  if (fbEl.value) params.set('fb_status', fbEl.value);
  if (discogsEl.value) params.set('discogs_status', discogsEl.value);
  if (hideSoldEl.checked) params.set('sold', 'false');

  const records = await fetch('/api/inventory?' + params.toString()).then(r => r.json());
  renderTable(records);
}

function renderTable(records) {
  tbody.innerHTML = records.map(r => `
    <tr data-id="${r.id}">
      <td class="artist-cell">${escapeHtml(r.artist)}</td>
      <td class="title-cell">${escapeHtml(r.title)}</td>
      <td>${escapeHtml(r.format || '')}</td>
      <td>${escapeHtml(r.year || '')}</td>
      <td><span class="chip ${tierClass(r.tier)}">${tierShort(r.tier)}</span></td>
      <td>${r.asking_price ? '$' + r.asking_price : '—'}</td>
      <td><span class="status-badge ${r.status.ebay}">${r.status.ebay}</span></td>
      <td><span class="status-badge ${r.status.fb}">${r.status.fb}</span></td>
      <td><span class="status-badge ${r.status.discogs}">${r.status.discogs}</span></td>
      <td>${r.sold ? '✅ sold' : ''}</td>
    </tr>
  `).join('');

  [...tbody.querySelectorAll('tr')].forEach(tr => {
    tr.addEventListener('click', () => openPanel(tr.dataset.id));
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

async function openPanel(id) {
  if (!gradeOptions.media.length) await loadGradeOptions();
  const [record, listing, priceSuggestion] = await Promise.all([
    fetch(`/api/inventory/${id}`).then(r => r.json()),
    fetch(`/api/inventory/${id}/listing`).then(r => r.json()),
    fetch(`/api/inventory/${id}/price-suggestion`).then(r => r.json())
  ]);
  renderPanel(record, listing, priceSuggestion);
  overlay.classList.remove('hidden');
}

function closePanel() {
  overlay.classList.add('hidden');
  panel.innerHTML = '';
}

function renderPanel(r, listing, priceSuggestion) {
  const isNewArrival = r.tier.startsWith('Unsorted');
  const hasPhotos = (r.photos || []).length > 0;
  const panelRenderStamp = Date.now();

  const photosMarkup = `
      <label>Photos <span class="meta">(first photo is the primary/thumbnail image on eBay and most marketplaces — drag to reorder, click to zoom)</span></label>
      <div class="photos" id="photos">
        ${(r.photos || []).map((p, i) => {
          const isDeadwax = (r.deadwax_photos || []).includes(p);
          return `
          <div class="photo-wrap" draggable="true" data-idx="${i}">
            ${i === 0 ? '<span class="photo-primary-badge">1st</span>' : ''}
            ${isDeadwax ? '<span class="photo-deadwax-badge">⊙ Runout</span>' : ''}
            <img src="${p}?v=${panelRenderStamp}" draggable="false">
            <button data-url="${p}" class="delPhoto" title="Delete">✕</button>
            <button data-url="${p}" class="rotatePhoto" title="Rotate 90°">⟳</button>
            <button data-url="${p}" class="toggleDeadwax" title="${isDeadwax ? 'Unmark as runout/deadwax photo' : 'Mark as runout/deadwax photo'}">⊙</button>
          </div>
        `;
        }).join('')}
      </div>
      <input type="file" id="photoInput" accept="image/*,.zip" multiple>
      <div class="meta" style="margin-top:4px">Tip: drop a .zip of a whole camera-roll export here instead — HEIC photos get converted automatically.</div>
      <div id="photoUploadStatus" class="publish-status" hidden></div>
  `;

  const newArrivalStep1 = isNewArrival ? `
    <div class="section">
      <div class="section-header">Step 1 — Upload photos</div>
      <div class="meta">Add the photos for this record (or drop a .zip of the whole camera-roll export). Once they're up, open them to see the artist/title/label, then fill in the details below.</div>
      ${photosMarkup}
    </div>
  ` : '';

  panel.innerHTML = `
    <button class="close-btn" id="closeBtn">Close ✕</button>
    <h2>${r.artist || r.title ? escapeHtml(r.artist) + ' — ' + escapeHtml(r.title) : 'New record'}</h2>
    <div class="meta">Discogs low comp: ${r.discogs_low_price ? '$' + r.discogs_low_price : 'none'} · Tier: ${escapeHtml(r.tier)}</div>

    ${newArrivalStep1}

    <div class="section">
      <div class="section-header">${isNewArrival ? 'Step 2 — Fill in details' : 'Details'}</div>
      ${isNewArrival && !hasPhotos ? '<div class="meta">Upload photos above first, then fill in what you can identify from them.</div>' : ''}
      <div class="row">
        <div>
          <label>Artist</label>
          <input type="text" id="fieldArtist" value="${escapeHtml(r.artist || '')}">
        </div>
        <div>
          <label>Title</label>
          <input type="text" id="fieldTitle" value="${escapeHtml(r.title || '')}">
        </div>
      </div>
      <div class="row">
        <div>
          <label>Format</label>
          <input type="text" id="fieldFormat" value="${escapeHtml(r.format || '')}" placeholder="e.g. Vinyl, 7&quot;, 45 RPM">
        </div>
        <div>
          <label>Year</label>
          <input type="text" id="fieldYear" value="${escapeHtml(r.year || '')}">
        </div>
        <div>
          <label>Country</label>
          <input type="text" id="fieldCountry" value="${escapeHtml(r.country || '')}">
        </div>
        <div>
          <label>Label / Cat#</label>
          <input type="text" id="fieldLabel" value="${escapeHtml(r.label || '')}" placeholder="e.g. V.M.L. Records – VML 623">
        </div>
      </div>
      <div class="row">
        <div>
          <label>Asking price ($)</label>
          <input type="number" id="askingPrice" value="${r.asking_price || ''}" step="0.01">
        </div>
        <div>
          <div class="label-row"><label>Media condition</label>${gradeInfoIcon(false)}</div>
          ${gradeSelect('condMedia', gradeOptions.media, r.condition_media || '')}
        </div>
        <div>
          <div class="label-row"><label>Sleeve condition</label>${gradeInfoIcon(true)}</div>
          ${gradeSelect('condSleeve', gradeOptions.sleeve, r.condition_sleeve || '')}
        </div>
      </div>

      <label>Matrix / runout number <span class="meta">(public — shown in the listing text and sent to eBay as a "Vinyl Matrix Number" item specific)</span></label>
      <input type="text" id="matrixNumber" placeholder="e.g. LK-112-A / LK-112-B" value="${escapeHtml(r.matrix_number || '')}">

      <label class="label-row" style="margin-top:12px">
        <input type="checkbox" id="sealedCheck" ${r.sealed ? 'checked' : ''} style="width:auto;margin:0">
        Factory sealed <span class="meta">(adds a "STILL SEALED" watermark across every photo used in listings)</span>
      </label>

      <label>Private notes <span class="meta">(just for you — never shown to buyers or included in any listing)</span></label>
      <textarea id="notes" placeholder="e.g. bought as part of a $200 lot, already turned down a $20 offer...">${escapeHtml(r.notes || '')}</textarea>

      <label>Listing extras <span class="meta">(public — included in every eBay/FB description and Discogs comments)</span></label>
      <textarea id="listingExtras" placeholder="e.g. hand-etched runouts, included insert/sticker, notable provenance...">${escapeHtml(r.listing_extras || '')}</textarea>

      ${isNewArrival ? '' : photosMarkup}

      <div class="actions">
        <button id="saveBtn" class="primary">Save changes</button>
        <button id="markSold">${r.sold ? 'Mark unsold' : 'Mark sold everywhere'}</button>
        <button id="deleteRecord">Delete record</button>
      </div>
    </div>

    <div class="section pricing-section">
      <div class="section-header">Pricing</div>

      <div class="price-hero">
        ${priceSuggestion.suggested != null
          ? `<div class="big-number">$${priceSuggestion.suggested.toFixed(2)}</div><div class="price-reason">${escapeHtml(priceSuggestion.reason)}</div><button id="applySuggested">Use this as asking price</button>`
          : `<div class="price-reason">${escapeHtml(priceSuggestion.reason || '')}</div>`}
      </div>
      ${priceSuggestion.demand ? `<div class="demand-line">${escapeHtml(priceSuggestion.demand)}</div>` : ''}
      <div class="lookup-row">
        <button id="discogsLookup">${r.discogs_release_id ? 'Refresh Discogs pricing' : 'Look up Discogs pricing'}</button>
        ${r.discogs_release_id ? `<span class="meta">matched release #${r.discogs_release_id}</span>` : ''}
      </div>

      <div class="subsection-label">Discogs sold stats (manual — not available via API)</div>
      <div class="compact-grid">
        <div><label>Low ($)</label><input type="number" id="soldLow" value="${(r.discogs_sold_stats && r.discogs_sold_stats.low) || ''}" step="0.01"></div>
        <div><label>Median ($)</label><input type="number" id="soldMedian" value="${(r.discogs_sold_stats && r.discogs_sold_stats.median) || ''}" step="0.01"></div>
        <div><label>High ($)</label><input type="number" id="soldHigh" value="${(r.discogs_sold_stats && r.discogs_sold_stats.high) || ''}" step="0.01"></div>
        <div><label>Last sold</label><input type="text" id="soldLastDate" value="${escapeHtml((r.discogs_sold_stats && r.discogs_sold_stats.lastSoldDate) || '')}" placeholder="Nov 24, 2024"></div>
      </div>

      <div class="subsection-label">Net proceeds calculator</div>
      <div class="compact-grid">
        <div>
          <label>Platform</label>
          <select id="feePlatform">
            <option value="discogs">Discogs (9% + PayPal)</option>
            <option value="ebay">eBay (13.25%, all-in)</option>
            <option value="fbShipped">FB Marketplace, shipped (10%)</option>
            <option value="fbLocal">FB Marketplace, local pickup (0%)</option>
          </select>
        </div>
        <div><label>Sale price ($)</label><input type="number" id="feeSalePrice" value="${r.asking_price || ''}" step="0.01"></div>
        <div><label>Ship charged to buyer ($)</label><input type="number" id="feeShipCharged" value="0" step="0.01"></div>
        <div><label>Your ship cost ($)</label><input type="number" id="feeShipCost" value="${window.RecordFees.mediaMailEstimate(r.format).toFixed(2)}" step="0.01"></div>
      </div>
      <div id="feeResult" class="fee-result-box"></div>
    </div>

    <div class="section">
      <div class="section-header">Listing content</div>
      <div class="meta">Shared across every platform — included automatically in each Copy button below.</div>
      <div class="listing-text">${escapeHtml(listing.coreFacts)}</div>
      <button data-copy="${encodeURIComponent(listing.coreFacts)}" class="copyBtn">Copy core facts</button>

      <div class="tab-bar" style="margin-top:18px">
        <button class="tab-btn active" data-tab="ebay">eBay <span class="status-badge ${r.status.ebay}">${r.status.ebay}</span></button>
        <button class="tab-btn" data-tab="fb">Facebook <span class="status-badge ${r.status.fb}">${r.status.fb}</span></button>
        <button class="tab-btn" data-tab="discogs">Discogs <span class="status-badge ${r.status.discogs}">${r.status.discogs}</span></button>
      </div>

      <div class="tab-panel" data-tab-panel="ebay">
        <div><strong>Title:</strong></div>
        <div class="listing-text">${escapeHtml(listing.ebayTitle)}</div>
        <button data-copy="${encodeURIComponent(listing.ebayTitle)}" class="copyBtn">Copy title</button>
        <div style="margin-top:8px"><strong>Platform-specific addition:</strong> <span class="meta">(full description below already includes the core facts above)</span></div>
        <div class="listing-text">${escapeHtml(listing.ebayWrapper)}</div>
        <button data-copy="${encodeURIComponent(listing.ebayDescription)}" class="copyBtn">Copy full description</button>
        <div class="actions">
          <button id="publishEbay" class="primary">Publish to eBay</button>
          <button id="markEbayListed">Mark listed manually</button>
        </div>
        <div id="ebayPublishStatus" class="publish-status" hidden></div>
      </div>

      <div class="tab-panel" data-tab-panel="fb" hidden>
        <div><strong>Title:</strong></div>
        <div class="listing-text">${escapeHtml(listing.fbTitle)}</div>
        <button data-copy="${encodeURIComponent(listing.fbTitle)}" class="copyBtn">Copy title</button>
        <div style="margin-top:8px"><strong>Platform-specific addition:</strong> <span class="meta">(full description below already includes the core facts above)</span></div>
        <div class="listing-text">${escapeHtml(listing.fbWrapper)}</div>
        <button data-copy="${encodeURIComponent(listing.fbDescription)}" class="copyBtn">Copy full description</button>
        <div class="actions">
          <button id="openFb">Open FB Marketplace ↗</button>
          <button id="markFbListed">Mark listed manually</button>
        </div>
      </div>

      <div class="tab-panel" data-tab-panel="discogs" hidden>
        <div class="meta">
          Condition: ${escapeHtml(r.condition_media || '(not set)')} media / ${escapeHtml(r.condition_sleeve || '(not set)')} sleeve
          · Price: ${r.asking_price ? '$' + r.asking_price : '(not set)'}
          ${r.discogs_release_id ? `· Release #${r.discogs_release_id}` : '· not yet matched to a release'}
          ${r.discogs_listing_id ? `· Listing #${r.discogs_listing_id}` : ''}
        </div>
        <div class="meta" style="margin-top:6px">
          This creates a real "For Sale" listing on your Discogs account for this exact release —
          best reserved for the rare/no-comp pieces that pressing-focused collectors only search
          for there. Condition and price come from the Details section above.
        </div>
        <div class="actions">
          <button id="publishDiscogs" class="primary">Publish to Discogs</button>
          <button id="markDiscogsListed">Mark listed manually</button>
          ${r.discogs_listing_id ? '<button id="unlistDiscogs">Unlist from Discogs</button>' : ''}
        </div>
      </div>
    </div>
  `;

  [...panel.querySelectorAll('.tab-btn')].forEach(btn => {
    btn.onclick = () => {
      panel.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      panel.querySelectorAll('.tab-panel').forEach(p => {
        p.hidden = p.dataset.tabPanel !== btn.dataset.tab;
      });
    };
  });

  document.getElementById('closeBtn').onclick = closePanel;

  const defaultShipCost = window.RecordFees.mediaMailEstimate(r.format);
  let preLocalShipCharged = '0';
  let preLocalShipCost = defaultShipCost.toFixed(2);

  function applyLocalPickupState() {
    const platform = document.getElementById('feePlatform').value;
    const chargedEl = document.getElementById('feeShipCharged');
    const costEl = document.getElementById('feeShipCost');
    if (platform === 'fbLocal') {
      preLocalShipCharged = chargedEl.value;
      preLocalShipCost = costEl.value;
      chargedEl.value = 0;
      costEl.value = 0;
      chargedEl.disabled = true;
      costEl.disabled = true;
    } else if (chargedEl.disabled) {
      chargedEl.disabled = false;
      costEl.disabled = false;
      chargedEl.value = preLocalShipCharged;
      costEl.value = preLocalShipCost;
    }
  }

  function recomputeFees() {
    const platform = document.getElementById('feePlatform').value;
    const salePrice = parseFloat(document.getElementById('feeSalePrice').value) || 0;
    const shippingCharged = parseFloat(document.getElementById('feeShipCharged').value) || 0;
    const sellerShippingCost = parseFloat(document.getElementById('feeShipCost').value) || 0;
    const result = window.RecordFees.computeNet({ platform, salePrice, shippingCharged, sellerShippingCost });
    const fmt = (n) => (n < 0 ? '-$' + Math.abs(n).toFixed(2) : '$' + n.toFixed(2));
    const row = (label, value) => `<div class="receipt-row"><span class="label">${label}</span><span class="dots"></span><span class="amount">${value}</span></div>`;
    document.getElementById('feeResult').innerHTML =
      row('Gross received', fmt(result.gross)) +
      row('Platform fee', fmt(-result.platformFee)) +
      (result.paymentFee > 0 ? row('Payment processing (PayPal)', fmt(-result.paymentFee)) : '') +
      row('Your shipping cost', fmt(-sellerShippingCost)) +
      `<div class="receipt-row receipt-total"><span class="label">Net proceeds</span><span class="amount">${fmt(result.net)}</span></div>`;
  }
  document.getElementById('feePlatform').addEventListener('input', () => {
    applyLocalPickupState();
    recomputeFees();
  });
  ['feeSalePrice', 'feeShipCharged', 'feeShipCost'].forEach(id => {
    document.getElementById(id).addEventListener('input', recomputeFees);
  });
  recomputeFees();

  const applyBtn = document.getElementById('applySuggested');
  if (applyBtn) {
    applyBtn.onclick = async () => {
      document.getElementById('askingPrice').value = priceSuggestion.suggested;
      await patchRecord(r.id, { asking_price: String(priceSuggestion.suggested) });
      await openPanel(r.id);
      await loadTable();
    };
  }

  document.getElementById('discogsLookup').onclick = async () => {
    const btn = document.getElementById('discogsLookup');
    btn.disabled = true;
    btn.textContent = 'Looking up…';
    try {
      const res = await fetch(`/api/inventory/${r.id}/discogs-lookup`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Lookup failed');
      await openPanel(r.id);
    } catch (err) {
      alert(err.message);
      btn.disabled = false;
      btn.textContent = 'Look up Discogs pricing';
    }
  };

  document.getElementById('saveBtn').onclick = async () => {
    await patchRecord(r.id, {
      artist: document.getElementById('fieldArtist').value,
      title: document.getElementById('fieldTitle').value,
      format: document.getElementById('fieldFormat').value,
      year: document.getElementById('fieldYear').value,
      country: document.getElementById('fieldCountry').value,
      label: document.getElementById('fieldLabel').value,
      asking_price: document.getElementById('askingPrice').value,
      condition_media: document.getElementById('condMedia').value,
      condition_sleeve: document.getElementById('condSleeve').value,
      matrix_number: document.getElementById('matrixNumber').value,
      sealed: document.getElementById('sealedCheck').checked,
      notes: document.getElementById('notes').value,
      listing_extras: document.getElementById('listingExtras').value,
      discogs_sold_stats: {
        low: document.getElementById('soldLow').value,
        median: document.getElementById('soldMedian').value,
        high: document.getElementById('soldHigh').value,
        lastSoldDate: document.getElementById('soldLastDate').value
      }
    });
    await openPanel(r.id);
    await loadTable();
  };

  document.getElementById('markSold').onclick = async () => {
    await patchRecord(r.id, {
      sold: !r.sold,
      status: { ebay: !r.sold ? 'sold' : 'unlisted', fb: !r.sold ? 'sold' : 'unlisted' }
    });
    await openPanel(r.id);
    await loadTable();
    await loadStats();
  };

  document.getElementById('deleteRecord').onclick = async () => {
    if (!confirm(`Delete "${r.artist || '(untitled)'} — ${r.title || '(untitled)'}"? This can't be undone.`)) return;
    await fetch(`/api/inventory/${r.id}`, { method: 'DELETE' });
    closePanel();
    await loadTable();
    await loadStats();
  };

  document.getElementById('markEbayListed').onclick = async () => {
    await patchRecord(r.id, { status: { ebay: 'listed' } });
    await openPanel(r.id);
    await loadTable();
    await loadStats();
  };
  document.getElementById('markFbListed').onclick = async () => {
    await patchRecord(r.id, { status: { fb: 'listed' } });
    await openPanel(r.id);
    await loadTable();
    await loadStats();
  };

  document.getElementById('openFb').onclick = () => {
    window.open('https://www.facebook.com/marketplace/create/item', '_blank');
  };

  document.getElementById('publishEbay').onclick = async () => {
    const btn = document.getElementById('publishEbay');
    const statusEl = document.getElementById('ebayPublishStatus');
    const steps = [
      'Uploading photos to image host…',
      'Creating eBay inventory listing…',
      'Attaching business policies (shipping/payment/returns)…',
      'Publishing offer live on eBay…'
    ];
    let stepIndex = 0;
    statusEl.hidden = false;
    statusEl.innerHTML = `<span class="spinner"></span> <span class="step-text">${steps[0]}</span>`;
    const stepTimer = setInterval(() => {
      stepIndex = Math.min(stepIndex + 1, steps.length - 1);
      statusEl.querySelector('.step-text').textContent = steps[stepIndex];
    }, 2200);
    btn.disabled = true;
    btn.textContent = 'Publishing…';
    try {
      const res = await fetch(`/api/inventory/${r.id}/publish-ebay`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to publish');
      clearInterval(stepTimer);
      statusEl.innerHTML = `<span class="step-done">✓ Published — listing #${json.ebay_listing_id}</span>`;
      setTimeout(() => { statusEl.hidden = true; }, 4000);
      await openPanel(r.id);
      await loadTable();
      await loadStats();
    } catch (err) {
      clearInterval(stepTimer);
      statusEl.hidden = true;
      alert(err.message);
      btn.disabled = false;
      btn.textContent = 'Publish to eBay';
    }
  };

  document.getElementById('markDiscogsListed').onclick = async () => {
    await patchRecord(r.id, { status: { discogs: 'listed' } });
    await openPanel(r.id);
    await loadTable();
    await loadStats();
  };

  document.getElementById('publishDiscogs').onclick = async () => {
    const btn = document.getElementById('publishDiscogs');
    btn.disabled = true;
    btn.textContent = 'Publishing…';
    try {
      const res = await fetch(`/api/inventory/${r.id}/publish-discogs`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to publish');
      await openPanel(r.id);
      await loadTable();
      await loadStats();
    } catch (err) {
      alert(err.message);
      btn.disabled = false;
      btn.textContent = 'Publish to Discogs';
    }
  };

  const unlistDiscogsBtn = document.getElementById('unlistDiscogs');
  if (unlistDiscogsBtn) {
    unlistDiscogsBtn.onclick = async () => {
      unlistDiscogsBtn.disabled = true;
      unlistDiscogsBtn.textContent = 'Unlisting…';
      try {
        const res = await fetch(`/api/inventory/${r.id}/unlist-discogs`, { method: 'POST' });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Failed to unlist');
        await openPanel(r.id);
        await loadTable();
        await loadStats();
      } catch (err) {
        alert(err.message);
        unlistDiscogsBtn.disabled = false;
        unlistDiscogsBtn.textContent = 'Unlist from Discogs';
      }
    };
  }

  [...panel.querySelectorAll('.copyBtn')].forEach(btn => {
    btn.onclick = () => {
      const text = decodeURIComponent(btn.dataset.copy);
      navigator.clipboard.writeText(text);
      const old = btn.textContent;
      btn.textContent = 'Copied ✓';
      setTimeout(() => (btn.textContent = old), 1200);
    };
  });

  document.getElementById('photoInput').onchange = async (e) => {
    const files = e.target.files;
    if (!files.length) return;
    const statusEl = document.getElementById('photoUploadStatus');

    const isSingleZip = files.length === 1 && /\.zip$/i.test(files[0].name);
    if (isSingleZip) {
      statusEl.hidden = false;
      statusEl.innerHTML = '<span class="spinner"></span> <span class="step-text">Extracting zip, converting any HEIC photos, and checking photos with the local AI model (can take a minute or so if that\'s on)…</span>';
      const formData = new FormData();
      formData.append('zip', files[0]);
      try {
        const res = await fetch(`/api/inventory/${r.id}/photos-zip`, { method: 'POST', body: formData });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Zip upload failed');
        statusEl.innerHTML = `<span class="step-done">✓ Added ${json.photos.length - (r.photos || []).length} photo(s)</span>`;
        setTimeout(() => { statusEl.hidden = true; }, 4000);
      } catch (err) {
        statusEl.hidden = true;
        alert(err.message);
      }
      await openPanel(r.id);
      await loadTable();
      return;
    }

    const formData = new FormData();
    for (const f of files) formData.append('photos', f);
    await fetch(`/api/inventory/${r.id}/photos`, { method: 'POST', body: formData });
    await openPanel(r.id);
    await loadTable();
  };

  [...panel.querySelectorAll('.delPhoto')].forEach(btn => {
    btn.onclick = async () => {
      await fetch(`/api/inventory/${r.id}/photos`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: btn.dataset.url })
      });
      await openPanel(r.id);
    };
  });

  [...panel.querySelectorAll('.rotatePhoto')].forEach(btn => {
    btn.onclick = async () => {
      btn.disabled = true;
      await fetch(`/api/inventory/${r.id}/photos/rotate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: btn.dataset.url, degrees: 90 })
      });
      await openPanel(r.id);
    };
  });

  [...panel.querySelectorAll('.toggleDeadwax')].forEach(btn => {
    btn.onclick = async () => {
      await fetch(`/api/inventory/${r.id}/photos/toggle-deadwax`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: btn.dataset.url })
      });
      await openPanel(r.id);
    };
  });

  let draggedIdx = null;
  [...panel.querySelectorAll('.photo-wrap')].forEach(el => {
    el.addEventListener('dragstart', () => {
      draggedIdx = parseInt(el.dataset.idx, 10);
      el.classList.add('dragging');
    });
    el.addEventListener('dragend', () => {
      el.classList.remove('dragging');
    });
    el.addEventListener('dragover', (e) => {
      e.preventDefault();
      el.classList.add('drag-over');
    });
    el.addEventListener('dragleave', () => {
      el.classList.remove('drag-over');
    });
    el.addEventListener('drop', async (e) => {
      e.preventDefault();
      el.classList.remove('drag-over');
      const targetIdx = parseInt(el.dataset.idx, 10);
      if (draggedIdx === null || draggedIdx === targetIdx) return;
      const newOrder = [...r.photos];
      const [moved] = newOrder.splice(draggedIdx, 1);
      newOrder.splice(targetIdx, 0, moved);
      draggedIdx = null;
      await fetch(`/api/inventory/${r.id}/photos/reorder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photos: newOrder })
      });
      await openPanel(r.id);
    });

    const img = el.querySelector('img');
    img.addEventListener('click', () => openLightbox(img.src));
  });
}

async function patchRecord(id, patch) {
  await fetch(`/api/inventory/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch)
  });
}

overlay.addEventListener('click', (e) => {
  if (e.target === overlay) closePanel();
});

[searchEl, tierEl, ebayEl, fbEl, discogsEl, hideSoldEl].forEach(el => {
  el.addEventListener('input', loadTable);
  el.addEventListener('change', loadTable);
});

document.getElementById('addRecordBtn').addEventListener('click', async () => {
  const record = await fetch('/api/inventory', { method: 'POST' }).then(r => r.json());
  await loadTable();
  await loadStats();
  await openPanel(record.id);
});

loadStats();
loadTable();
loadGradeOptions();
loadSettings();
