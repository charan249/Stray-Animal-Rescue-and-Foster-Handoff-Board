// app.js — talks to our API with fetch(), no framework needed.

const NEXT_STAGE = {
  claimed: 'picked_up',
  picked_up: 'at_clinic',
  at_clinic: 'at_foster',
  at_foster: 'resolved',
};

const TAB_STAGES = {
  emergencies: ['reported', 'claimed'],
  transit: ['picked_up'],
  foster: ['at_clinic', 'at_foster'],
};

let currentTab = 'emergencies';
let allCalls = [];
let currentLat = null;
let currentLon = null;
let pendingPhoto = null;

// --- Real-time Sync (Socket.io) ---
const socket = io();
socket.on('refresh', () => {
  console.log('Real-time update received. Refreshing calls...');
  loadCalls();
});

// --- Geolocation Helper ---
function calculateDistance(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return Infinity;
  const R = 6371; // Radius of the earth in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in km
}

async function captureUserLocation() {
  if (!navigator.geolocation) return;
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        currentLat = pos.coords.latitude;
        currentLon = pos.coords.longitude;
        resolve();
      },
      (err) => resolve(),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  });
}

function timeSince(dateString) {
  const now = new Date();
  const then = new Date(dateString);
  const diff = now - then;
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(mins / 60);
  if (hours < 1) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

window.onload = async () => {
  await captureUserLocation();
  loadCalls();
};

document.getElementById('getLocationBtn').onclick = async () => {
  const btn = document.getElementById('getLocationBtn');
  const locInput = document.getElementById('location');
  btn.disabled = true;
  btn.textContent = '...';
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      currentLat = pos.coords.latitude;
      currentLon = pos.coords.longitude;
      if (!locInput.value) locInput.value = '📍 GPS Location Captured';
      btn.textContent = '✅';
      setTimeout(() => { btn.textContent = '📍 GPS'; }, 2000);
      btn.disabled = false;
      renderCalls();
    },
    (err) => {
      alert('Unable to retrieve your location.');
      btn.textContent = '📍 GPS';
      btn.disabled = false;
    },
    { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
  );
};

document.getElementById('photoInput').onchange = (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (event) => {
    pendingPhoto = event.target.result;
    const preview = document.getElementById('photoPreview');
    preview.src = pendingPhoto;
    preview.style.display = 'block';
  };
  reader.readAsDataURL(file);
};

function updateCoordDashboard(calls) {
  const stats = {
    reported: calls.filter(c => c.status === 'reported').length,
    claimed: calls.filter(c => c.status === 'claimed').length,
    picked_up: calls.filter(c => c.status === 'picked_up').length,
    at_clinic: calls.filter(c => c.status === 'at_clinic').length,
    at_foster: calls.filter(c => c.status === 'at_foster').length,
  };

  document.getElementById('stat-reported').textContent = stats.reported;
  document.getElementById('stat-claimed').textContent = stats.claimed;
  document.getElementById('stat-transit').textContent = stats.picked_up;
  document.getElementById('stat-foster').textContent = stats.at_clinic + stats.at_foster;
}

async function updateStats() {
  try {
    const res = await fetch('/api/stats');
    const data = await res.json();
    document.getElementById('saved-count').textContent = data.saved;
  } catch (err) {
    console.error('Failed to update stats:', err);
  }
}

async function loadCalls() {
  const listEl = document.getElementById('callList');
  if (currentTab !== 'map') {
    listEl.innerHTML = '<div class="skeleton-card"></div>'.repeat(3);
  }

  updateStats();
  try {
    const res = await fetch('/api/calls');
    allCalls = await res.json();
    updateCoordDashboard(allCalls);
    renderCalls();
  } catch (err) {
    listEl.innerHTML = '<p class="status-msg error">Failed to load rescues. Please refresh.</p>';
  }
}

function renderCalls() {
  const listEl = document.getElementById('callList');
  const stages = TAB_STAGES[currentTab];
  const visible = allCalls.filter(c => stages.includes(c.status));

  if (visible.length === 0) {
    listEl.innerHTML = `
      <div style="text-align:center; padding: 2rem; color: #888;">
        <p>All clear! No animals currently in this stage.</p>
      </div>`;
    return;
  }

  if (currentLat && currentLon) {
    visible.sort((a, b) => {
      const distA = calculateDistance(currentLat, currentLon, a.latitude, a.longitude);
      const distB = calculateDistance(currentLat, currentLon, b.latitude, b.longitude);
      return distA - distB;
    });
  } else {
    visible.sort((a, b) => (a.urgency === 'urgent' ? -1 : 0) - (b.urgency === 'urgent' ? -1 : 0));
  }

  listEl.innerHTML = '';
  for (const call of visible) {
    listEl.appendChild(renderCallCard(call));
  }
}

function renderCaretaker(call) {
  if (call.status === 'reported') {
    return call.reported_by_name
      ? `<p class="desc" style="font-size: 0.85rem; color: #666;">Reported by: ${escapeHtml(call.reported_by_name)} (${escapeHtml(call.reported_by_phone || 'No phone')})</p>`
      : '';
  }
  const name = call.current_caretaker_name || call.claimed_by_name;
  const phone = call.current_caretaker_phone || call.claimed_by_phone;
  if (!name) return '';
  let role = 'Volunteer';
  if (call.status === 'claimed' || call.status === 'picked_up') role = 'Driver';
  else if (call.status === 'at_clinic') role = 'Clinic';
  else if (call.status === 'at_foster') role = 'Foster';
  return `<p class="desc">${role}: <strong>${escapeHtml(name)}</strong> (${escapeHtml(phone || 'No phone')})</p>`;
}

function renderCallCard(call) {
  const card = document.createElement('div');
  card.className = `call-card ${call.status}`;
  card.setAttribute('data-id', call.id);

  const isStalled = (call.status === 'claimed') &&
                    (Date.now() - new Date(call.updated_at).getTime() > 2 * 60 * 60 * 1000);
  if (isStalled) card.classList.add('stalled');
  if (call.urgency === 'urgent' && call.status === 'reported') card.classList.add('urgent-pulse');

  const urgentTag = call.urgency === 'urgent' ? '<span class="urgent-tag">URGENT</span> ' : '';
  const photoHtml = call.photo ? `<img class="call-photo" src="${call.photo}">` : '';
  const mapUrl = call.latitude && call.longitude
    ? `https://www.google.com/maps/search/?api=1&query=${call.latitude},${call.longitude}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(call.location)}`;

  const dist = (currentLat && currentLon && call.latitude)
    ? `<span style="font-size:0.75rem; color:#b5622b; margin-left:5px;">📍 ${calculateDistance(currentLat, currentLon, call.latitude, call.longitude).toFixed(1)} km</span>`
    : '';

  card.innerHTML = `
    ${photoHtml}
    <div class="top-row">
      <span class="location">
        ${urgentTag}
        <a href="${mapUrl}" target="_blank" style="color: inherit; text-decoration: underline;">${escapeHtml(call.location)}</a>
        ${dist}
        <span class="pin-icon" title="Open in Maps" style="cursor:pointer; margin-left:4px;" onclick="window.open('${mapUrl}', '_blank')">📍</span>
      </span>
      <div style="display:flex; align-items:center; gap:0.5rem;">
        ${isStalled ? '<span class="urgent-tag" style="background:#ffeb3b; color:#856404; border-color:#ffe58f;">STALLED</span>' : ''}
        <span class="badge ${call.status}">${call.status.replace('_', ' ')}</span>
      </div>
    </div>
    <div style="font-size:0.75rem; color:#888; margin-bottom:0.3rem;">${timeSince(call.reported_at)} since reported</div>
    <p class="desc">${escapeHtml(call.description)}</p>
    <div class="caretaker-slot">${renderCaretaker(call)}</div>
    <div class="foster-info-slot"></div>
    <div class="actions"></div>
    <div class="status-msg"></div>
    <div class="checkin-slot"></div>
    <div class="handoff-log"></div>
  `;

  const actions = card.querySelector('.actions');
  const statusMsg = card.querySelector('.status-msg');

  if (call.dietary_needs || call.medication_schedule) {
    card.querySelector('.foster-info-slot').innerHTML = `
      <div class="foster-info">
        ${call.dietary_needs ? `<div><span class="label">Diet:</span> ${escapeHtml(call.dietary_needs)}</div>` : ''}
        ${call.medication_schedule ? `<div><span class="label">Meds:</span> ${escapeHtml(call.medication_schedule)}</div>` : ''}
      </div>`;
  }

  if (call.status === 'reported') {
    const claimBtn = document.createElement('button');
    claimBtn.textContent = 'Claim this call';
    claimBtn.onclick = () => claimCall(call.id, claimBtn, statusMsg);
    actions.appendChild(claimBtn);

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel (false alarm)';
    cancelBtn.className = 'cancel-btn';
    cancelBtn.onclick = () => cancelCall(call.id, cancelBtn, statusMsg);
    actions.appendChild(cancelBtn);
  } else if (NEXT_STAGE[call.status]) {
    const advanceBtn = document.createElement('button');
    advanceBtn.textContent = `Mark as: ${NEXT_STAGE[call.status].replace('_', ' ')}`;
    advanceBtn.onclick = () => logHandoff(call.id, NEXT_STAGE[call.status], advanceBtn, statusMsg);
    actions.appendChild(advanceBtn);

    if (call.status === 'at_clinic' || call.status === 'claimed' || call.status === 'picked_up') {
      const fosterBtn = document.createElement('button');
      fosterBtn.textContent = 'Set diet/meds';
      fosterBtn.onclick = () => setFosterInfo(call.id, fosterBtn, statusMsg);
      actions.appendChild(fosterBtn);
    }
  }

  if (call.status === 'at_foster' || call.status === 'at_clinic') {
    const medBtn = document.createElement('button');
    medBtn.textContent = 'View Medical File';
    medBtn.className = 'med-view-btn';
    medBtn.onclick = () => openMedicalView(call.id);
    actions.appendChild(medBtn);
  }

  if (call.status === 'at_foster') {
    renderCheckinToggle(call.id, card.querySelector('.checkin-slot'));
    checkMissedCheckin(call.id).then(missed => {
      if (missed) {
        const alert = document.createElement('div');
        alert.className = 'missed-checkin-alert';
        alert.textContent = '⚠️ Missed Today\'s Check-in';
        card.querySelector('.checkin-slot').prepend(alert);
      }
    });
  }

  loadHandoffs(call.id, card.querySelector('.handoff-log'));
  return card;
}

async function openMedicalView(callId) {
  try {
    const [callRes, handoffRes, checkinRes] = await Promise.all([
      fetch(`/api/calls`).then(r => r.json()).then(calls => calls.find(c => c.id == callId)),
      fetch(`/api/calls/${callId}/handoffs`).then(r => r.json()),
      fetch(`/api/calls/${callId}/checkins`).then(r => r.json()),
    ]);

    if (!callRes) throw new Error('Call not found');

    const handoffHtml = handoffRes.map((h, i) => `
      <div class="timeline-entry">
        <div class="timeline-dot"></div>
        <div class="timeline-content">
          <div class="timeline-header">
            <strong class="stage-label">${h.stage.replace('_', ' ')}</strong>
            <span class="timeline-date">${new Date(h.recorded_at).toLocaleString()}</span>
          </div>
          <div class="timeline-body">
            ${h.medical_notes ? `<p>${escapeHtml(h.medical_notes)}</p>` : '<p>No notes provided.</p>'}
            <small>Recorded by ${escapeHtml(h.recorded_by || 'Unknown')} (${escapeHtml(h.recorded_by_phone || 'No phone')})</small>
          </div>
        </div>
      </div>
    `).join('') || '<p>No handoff logs yet.</p>';

    const recentCheckin = checkinRes[0];
    const checkinHtml = recentCheckin ? `
      <div class="recent-checkin">
        <strong>Latest Check-in (${recentCheckin.checkin_date}):</strong><br>
        Meds: ${recentCheckin.medication_given ? '✅' : '❌'} |
        Worsening: ${recentCheckin.condition_worsening ? '⚠️ Yes' : '✅ No'}<br>
        Notes: ${escapeHtml(recentCheckin.notes || 'None')}
      </div>
    ` : '<p>No check-ins recorded.</p>';

    await showModal({
      title: `Medical File: ${escapeHtml(callRes.location)}`,
      body: `
        <div class="medical-view">
          <div style="display:flex; gap:1rem; align-items:center; margin-bottom:1rem; background:#f3f4f6; padding:1rem; border-radius:10px;">
            ${callRes.photo ? `<img src="${callRes.photo}" style="width:60px; height:60px; border-radius:50%; object-fit:cover; border:2px solid #fff; box-shadow:0 2px 4px rgba(0,0,0,0.1);">` : '<div style="width:60px; height:60px; background:#ddd; border-radius:50%;"></div>'}
            <div>
              <div style="font-weight:800; font-size:1.1rem;">Animal #${callRes.id}</div>
              <div class="badge ${callRes.status}">${callRes.status.replace('_', ' ')}</div>
            </div>
          </div>
          <div class="medical-section">
            <strong>Dietary Needs:</strong><br> ${escapeHtml(callRes.dietary_needs || 'Not specified')}
          </div>
          <div class="medical-section">
            <strong>Medication Schedule:</strong><br> ${escapeHtml(callRes.medication_schedule || 'Not specified')}
          </div>
          <hr>
          <strong>Recent Health Check:</strong>
          ${checkinHtml}
          <hr>
          <strong>Care Journey Timeline:</strong>
          <div class="timeline-container">${handoffHtml}</div>
        </div>
      `,
      onConfirm: () => {},
    });
  } catch (err) {
    alert('Error loading medical view: ' + err.message);
  }
}

async function checkMissedCheckin(callId) {
  const res = await fetch(`/api/calls/${callId}/checkins`);
  const checkins = await res.json();
  if (checkins.length === 0) return true;
  const today = new Date().toISOString().slice(0, 10);
  return !checkins.find(c => c.checkin_date.slice(0, 10) === today);
}

function showModal({ title, body, onConfirm, onCancel }) {
  return new Promise((resolve) => {
    const overlay = document.getElementById('modalOverlay');
    const titleEl = document.getElementById('modalTitle');
    const bodyEl = document.getElementById('modalBody');
    const confirmBtn = document.getElementById('modalConfirm');
    const cancelBtn = document.getElementById('modalCancel');

    titleEl.textContent = title;
    bodyEl.innerHTML = body;
    overlay.style.display = 'flex';

    const cleanup = () => {
      overlay.style.display = 'none';
      confirmBtn.onclick = null;
      cancelBtn.onclick = null;
    };

    confirmBtn.onclick = () => {
      cleanup();
      onConfirm();
      resolve(true);
    };

    cancelBtn.onclick = () => {
      cleanup();
      if (onCancel) onCancel();
      resolve(false);
    };
  });
}

async function claimCall(callId, btn, statusMsg) {
  btn.disabled = true;
  btn.textContent = 'Locking...';
  const confirmed = await showModal({
    title: 'Claim Rescue',
    body: '<p>Are you sure you can handle this rescue? Please enter your details:</p><input type="text" id="modal-claim-name" placeholder="Your Name" style="width:100%; padding: 0.5rem; margin-bottom: 0.5rem;"><input type="tel" id="modal-claim-phone" placeholder="Your Phone Number" style="width:100%; padding: 0.5rem; margin-bottom: 1rem;">',
    onConfirm: () => {},
  });
  if (!confirmed) {
    btn.disabled = false;
    btn.textContent = 'Claim this call';
    return;
  }
  const claimed_by_name = document.getElementById('modal-claim-name').value;
  const claimed_by_phone = document.getElementById('modal-claim-phone').value;
  if (!claimed_by_name || !claimed_by_phone) {
    statusMsg.textContent = 'Both name and phone number are required.';
    statusMsg.className = 'status-msg error';
    btn.disabled = false;
    btn.textContent = 'Claim this call';
    return;
  }
  const res = await fetch(`/api/calls/${callId}/claim`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ claimed_by_name, claimed_by_phone }),
  });
  const data = await res.json();
  if (res.status === 409) {
    statusMsg.textContent = data.error === 'This call was cancelled'
      ? 'This call was cancelled.'
      : `Too late — already claimed by ${data.claimed_by}.`;
    statusMsg.className = 'status-msg error';
    loadCalls();
  } else if (!res.ok) {
    statusMsg.textContent = data.error || 'Something went wrong.';
    statusMsg.className = 'status-msg error';
    btn.disabled = false;
    btn.textContent = 'Claim this call';
  } else {
    statusMsg.textContent = 'Claimed successfully.';
    statusMsg.className = 'status-msg success';
    loadCalls();
  }
}

async function cancelCall(callId, btn, statusMsg) {
  const confirmed = await showModal({
    title: 'Cancel Rescue',
    body: '<p>Are you sure you want to cancel this rescue call? This cannot be undone.</p>',
    onConfirm: () => {},
  });
  if (!confirmed) return;
  btn.disabled = true;
  const res = await fetch(`/api/calls/${callId}/cancel`, { method: 'POST' });
  const data = await res.json();
  if (!res.ok) {
    statusMsg.textContent = data.error || 'Could not cancel.';
    statusMsg.className = 'status-msg error';
    btn.disabled = false;
  } else {
    loadCalls();
  }
}

async function logHandoff(callId, stage, btn, statusMsg) {
  btn.disabled = true;
  let modalTitle = `Handoff: ${stage.replace('_', ' ')}`;
  let modalBody = '';
  let needsInput = true;
  if (stage === 'picked_up') {
    modalTitle = 'Confirm Pickup';
    modalBody = '<p>Confirm you have picked up this animal?</p>';
    needsInput = false;
  } else if (stage === 'at_clinic') {
    modalTitle = 'Clinic Intake';
    modalBody = `
      <p>Enter clinic employee details:</p>
      <input type="text" id="handoff-name" placeholder="Employee Name" style="width:100%; padding: 0.5rem; margin-bottom: 0.5rem;" required>
      <input type="tel" id="handoff-phone" placeholder="Phone Number" style="width:100%; padding: 0.5rem; margin-bottom: 0.5rem;" required>
      <textarea id="handoff-notes" placeholder="Medical notes (optional)..." style="width:100%; padding: 0.5rem; height: 80px;"></textarea>
    `;
  } else if (stage === 'at_foster') {
    modalTitle = 'Foster Placement';
    modalBody = `
      <p>Enter foster parent details:</p>
      <input type="text" id="handoff-name" placeholder="Foster Parent Name" style="width:100%; padding: 0.5rem; margin-bottom: 0.5rem;" required>
      <input type="tel" id="handoff-phone" placeholder="Phone Number" style="width:100%; padding: 0.5rem; margin-bottom: 0.5rem;" required>
      <textarea id="handoff-notes" placeholder="Medical notes (REQUIRED)..." style="width:100%; padding: 0.5rem; height: 80px;"></textarea>
    `;
  } else if (stage === 'resolved') {
    modalTitle = 'Resolve Rescue';
    modalBody = '<p>Mark this rescue as resolved?</p>';
    needsInput = false;
  } else {
    modalBody = `
      <p>Record the handoff details:</p>
      <input type="text" id="handoff-name" placeholder="Your Name" style="width:100%; padding: 0.5rem; margin-bottom: 0.5rem;">
      <input type="tel" id="handoff-phone" placeholder="Your Phone Number" style="width:100%; padding: 0.5rem; margin-bottom: 0.5rem;">
      <textarea id="handoff-notes" placeholder="Medical notes (optional)..." style="width:100%; padding: 0.5rem; height: 80px;"></textarea>
    `;
  }
  const confirmed = await showModal({
    title: modalTitle,
    body: modalBody,
    onConfirm: () => {},
  });
  if (!confirmed) {
    btn.disabled = false;
    return;
  }
  let recorded_by_name = null;
  let recorded_by_phone = null;
  let notes = null;
  if (needsInput) {
    recorded_by_name = document.getElementById('handoff-name')?.value;
    recorded_by_phone = document.getElementById('handoff-phone')?.value;
    notes = document.getElementById('handoff-notes')?.value;
    if (!recorded_by_name || !recorded_by_phone) {
      statusMsg.textContent = 'Name and phone number are required.';
      statusMsg.className = 'status-msg error';
      btn.disabled = false;
      return;
    }
    if (stage === 'at_foster' && (!notes || notes.trim() === '')) {
      statusMsg.textContent = 'Medical notes are required for this stage.';
      statusMsg.className = 'status-msg error';
      btn.disabled = false;
      return;
    }
  }
  try {
    const res = await fetch(`/api/calls/${callId}/handoffs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage, medical_notes: notes || null, recorded_by_name, recorded_by_phone }),
    });
    const data = await res.json();
    if (!res.ok) {
      statusMsg.textContent = data.error || 'Something went wrong.';
      statusMsg.className = 'status-msg error';
      btn.disabled = false;
    } else {
      statusMsg.textContent = `Updated to ${stage.replace('_', ' ')}.`;
      statusMsg.className = 'status-msg success';
      loadCalls();
    }
  } catch (err) {
    statusMsg.textContent = 'Network error. Please try again.';
    statusMsg.className = 'status-msg error';
    btn.disabled = false;
  }
}

async function setFosterInfo(callId, btn, statusMsg) {
  const confirmed = await showModal({
    title: 'Foster Care Details',
    body: `
      <p>Set dietary and medical needs:</p>
      <input type="text" id="foster-diet" placeholder="Dietary needs" style="width:100%; padding: 0.5rem; margin-bottom: 0.5rem;">
      <textarea id="foster-meds" placeholder="Medication schedule" style="width:100%; padding: 0.5rem; height: 80px;"></textarea>
    `,
    onConfirm: () => {},
  });
  if (!confirmed) return;
  const dietary_needs = document.getElementById('foster-diet').value;
  const medication_schedule = document.getElementById('foster-meds').value;
  if (!dietary_needs && !medication_schedule) return;
  const res = await fetch(`/api/calls/${callId}/foster-info`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dietary_needs, medication_schedule }),
  });
  if (res.ok) {
    statusMsg.textContent = 'Foster info updated.';
    statusMsg.className = 'status-msg success';
    loadCalls();
  }
}

async function renderCheckinToggle(callId, container) {
  const res = await fetch(`/api/calls/${callId}/checkins`);
  const checkins = await res.json();
  const today = new Date().toISOString().slice(0, 10);
  const todayEntry = checkins.find(c => c.checkin_date.slice(0, 10) === today);
  container.innerHTML = `
    <div class="checkin-toggle">
      <label><input type="checkbox" class="med-check" ${todayEntry?.medication_given ? 'checked' : ''}> Medication given today</label>
      <label><input type="checkbox" class="worse-check" ${todayEntry?.condition_worsening ? 'checked' : ''}> Condition worsening</label>
      <textarea class="checkin-notes" placeholder="Daily health notes (optional)...">${todayEntry?.notes || ''}</textarea>
      <div class="checkin-inputs">
        <input type="text" id="checkin-name" placeholder="Your Name">
        <input type="tel" id="checkin-phone" placeholder="Phone">
      </div>
      <button class="save-checkin" style="margin-top:0.5rem; width:100%;">Save today's check-in</button>
    </div>
  `;
  container.querySelector('.save-checkin').onclick = async () => {
    const medication_given = container.querySelector('.med-check').checked;
    const condition_worsening = container.querySelector('.worse-check').checked;
    const notes = container.querySelector('.checkin-notes').value;
    const recorded_by_name = document.getElementById('checkin-name').value;
    const recorded_by_phone = document.getElementById('checkin-phone').value;
    await fetch(`/api/calls/${callId}/checkins`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ medication_given, condition_worsening, notes, recorded_by_name, recorded_by_phone }),
    });
    loadCalls();
  };
}

async function loadHandoffs(callId, container) {
  const res = await fetch(`/api/calls/${callId}/handoffs`);
  const handoffs = await res.json();
  if (handoffs.length === 0) return;
  container.innerHTML = handoffs.map(h => `
    <div class="handoff-entry">
      <span class="stage-label">${h.stage.replace('_', ' ')}</span>
      ${h.medical_notes ? ` — ${escapeHtml(h.medical_notes)}` : ''}
      ${h.recorded_by ? ` (by ${escapeHtml(h.recorded_by)} ${h.recorded_by_phone ? `| ${escapeHtml(h.recorded_by_phone)}` : ''})` : ''}
    </div>
  `).join('');
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

document.getElementById('reportForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  let location = document.getElementById('location').value;
  if (!location && currentLat && currentLon) {
    location = 'Current User Location';
  }
  const description = document.getElementById('description').value;
  const urgency = document.getElementById('urgency').value;
  const reported_by_name = document.getElementById('reportedByName').value;
  const reported_by_phone = document.getElementById('reportedByPhone').value;
  const statusEl = document.getElementById('reportStatus');
  if (!location) {
    statusEl.textContent = 'Please provide a location or allow GPS access.';
    statusEl.className = 'status-msg error';
    return;
  }
  const res = await fetch('/api/calls', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      location,
      description,
      urgency,
      photo: pendingPhoto,
      latitude: currentLat,
      longitude: currentLon,
      reported_by_name,
      reported_by_phone,
    }),
  });
  if (res.ok) {
    statusEl.textContent = 'Call reported.';
    statusEl.className = 'status-msg success';
    e.target.reset();
    pendingPhoto = null;
    currentLat = null;
    currentLon = null;
    document.getElementById('photoPreview').style.display = 'none';
    loadCalls();
  } else {
    const data = await res.json();
    statusEl.textContent = data.error || 'Something went wrong.';
    statusEl.className = 'status-msg error';
  }
});

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentTab = btn.dataset.filter;
    renderCalls();
  });
});

loadCalls();
setInterval(loadCalls, 30000);
