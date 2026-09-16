// app.js — talks to our API with fetch(), no framework needed.

const NEXT_STAGE = {
  claimed: 'picked_up',
  picked_up: 'at_clinic',
  at_clinic: 'at_foster',
  at_foster: 'resolved',
};

// Which stages belong to which dashboard tab.
const TAB_STAGES = {
  emergencies: ['reported', 'claimed'],
  transit: ['picked_up'],
  foster: ['at_clinic', 'at_foster'],
};

let currentTab = 'emergencies';
let allCalls = [];

// --- Photo handling: compress client-side before sending, so this stays usable
// on low-bandwidth mobile connections. We downscale to max 700px wide and
// re-encode as JPEG at 60% quality, which typically gets a phone photo under ~80KB.
function compressImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const maxW = 700;
        const scale = Math.min(1, maxW / img.width);
        const canvas = document.createElement('canvas');
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.6));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

let pendingPhoto = null;
document.getElementById('photoInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) { pendingPhoto = null; return; }
  pendingPhoto = await compressImage(file);
  const preview = document.getElementById('photoPreview');
  preview.src = pendingPhoto;
  preview.style.display = 'block';
});

// --- Dashboard tabs ---
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentTab = btn.dataset.filter;
    renderCalls();
  });
});

async function loadCalls() {
  const res = await fetch('/api/calls');
  allCalls = await res.json();
  renderCalls();
}

function renderCalls() {
  const listEl = document.getElementById('callList');
  const stages = TAB_STAGES[currentTab];
  const visible = allCalls.filter(c => stages.includes(c.status));

  if (visible.length === 0) {
    listEl.innerHTML = '<p>Nothing here right now.</p>';
    return;
  }

  // Urgent-first within a tab, so a driver's eye lands on the most critical case.
  visible.sort((a, b) => (a.urgency === 'urgent' ? -1 : 0) - (b.urgency === 'urgent' ? -1 : 0));

  listEl.innerHTML = '';
  for (const call of visible) {
    listEl.appendChild(renderCallCard(call));
  }
}

function renderCallCard(call) {
  const card = document.createElement('div');
  card.className = 'call-card';

  const urgentTag = call.urgency === 'urgent' ? '<span class="urgent-tag">URGENT</span> ' : '';
  const photoHtml = call.photo ? `<img class="call-photo" src="${call.photo}">` : '';

  card.innerHTML = `
    ${photoHtml}
    <div class="top-row">
      <span class="location">${urgentTag}${escapeHtml(call.location)}</span>
      <span class="badge ${call.status}">${call.status.replace('_', ' ')}</span>
    </div>
    <p class="desc">${escapeHtml(call.description)}</p>
    ${call.claimed_by ? `<p class="desc">Claimed by: <strong>${escapeHtml(call.claimed_by)}</strong></p>` : ''}
    <div class="foster-info-slot"></div>
    <div class="actions"></div>
    <div class="status-msg"></div>
    <div class="checkin-slot"></div>
    <div class="handoff-log"></div>
  `;

  const actions = card.querySelector('.actions');
  const statusMsg = card.querySelector('.status-msg');

  // Foster info: show if set, or a button to set it once the animal is in care.
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

  // Daily check-in toggle: only relevant once an animal is actually in foster care.
  if (call.status === 'at_foster') {
    renderCheckinToggle(call.id, card.querySelector('.checkin-slot'));
  }

  loadHandoffs(call.id, card.querySelector('.handoff-log'));

  return card;
}

async function claimCall(callId, btn, statusMsg) {
  btn.disabled = true;
  const claimedBy = prompt('Your name (for the claim record):');
  if (!claimedBy) { btn.disabled = false; return; }

  const res = await fetch(`/api/calls/${callId}/claim`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ claimed_by: claimedBy }),
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
  } else {
    statusMsg.textContent = 'Claimed successfully.';
    statusMsg.className = 'status-msg success';
    loadCalls();
  }
}

async function cancelCall(callId, btn, statusMsg) {
  if (!confirm('Cancel this rescue call? This cannot be undone.')) return;
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
  const recordedBy = prompt('Your name:');
  const notes = prompt(`Medical notes for stage "${stage}" (optional):`);

  const res = await fetch(`/api/calls/${callId}/handoffs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stage, medical_notes: notes || null, recorded_by: recordedBy || null }),
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
}

async function setFosterInfo(callId, btn, statusMsg) {
  const dietary_needs = prompt('Dietary needs:');
  const medication_schedule = prompt('Medication schedule:');
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
      <button class="save-checkin">Save today's check-in</button>
    </div>
  `;

  container.querySelector('.save-checkin').onclick = async () => {
    const medication_given = container.querySelector('.med-check').checked;
    const condition_worsening = container.querySelector('.worse-check').checked;
    const recorded_by = prompt('Your name (foster host):');

    await fetch(`/api/calls/${callId}/checkins`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ medication_given, condition_worsening, recorded_by }),
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
      ${h.recorded_by ? ` (by ${escapeHtml(h.recorded_by)})` : ''}
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
  const location = document.getElementById('location').value;
  const description = document.getElementById('description').value;
  const urgency = document.getElementById('urgency').value;
  const statusEl = document.getElementById('reportStatus');

  const res = await fetch('/api/calls', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ location, description, urgency, photo: pendingPhoto }),
  });

  if (res.ok) {
    statusEl.textContent = 'Call reported.';
    statusEl.className = 'status-msg success';
    e.target.reset();
    pendingPhoto = null;
    document.getElementById('photoPreview').style.display = 'none';
    loadCalls();
  } else {
    const data = await res.json();
    statusEl.textContent = data.error || 'Something went wrong.';
    statusEl.className = 'status-msg error';
  }
});

loadCalls();
// Simple polling refresh every 8s so drivers see new claims without a manual
// reload — a lightweight stand-in for full real-time sync (see TRADEOFFS.md).
setInterval(loadCalls, 8000);
