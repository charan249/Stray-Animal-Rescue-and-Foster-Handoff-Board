// app.js — talks to our API with fetch(), no framework needed.

const STAGE_ORDER = ['reported', 'claimed', 'picked_up', 'at_clinic', 'at_foster', 'resolved'];
const NEXT_STAGE = {
  claimed: 'picked_up',
  picked_up: 'at_clinic',
  at_clinic: 'at_foster',
  at_foster: 'resolved',
};

async function loadCalls() {
  const res = await fetch('/api/calls');
  const calls = await res.json();
  const listEl = document.getElementById('callList');

  if (calls.length === 0) {
    listEl.innerHTML = '<p>No calls yet. Report one above.</p>';
    return;
  }

  listEl.innerHTML = '';
  for (const call of calls) {
    listEl.appendChild(renderCallCard(call));
  }
}

function renderCallCard(call) {
  const card = document.createElement('div');
  card.className = 'call-card';

  const urgentTag = call.urgency === 'urgent' ? '<span class="urgent-tag">URGENT</span> ' : '';

  card.innerHTML = `
    <div class="top-row">
      <span class="location">${urgentTag}${escapeHtml(call.location)}</span>
      <span class="badge ${call.status}">${call.status.replace('_', ' ')}</span>
    </div>
    <p class="desc">${escapeHtml(call.description)}</p>
    ${call.claimed_by ? `<p class="desc">Claimed by: <strong>${escapeHtml(call.claimed_by)}</strong></p>` : ''}
    <div class="actions"></div>
    <div class="status-msg"></div>
    <div class="handoff-log"></div>
  `;

  const actions = card.querySelector('.actions');
  const statusMsg = card.querySelector('.status-msg');

  if (call.status === 'reported') {
    const claimBtn = document.createElement('button');
    claimBtn.textContent = 'Claim this call';
    claimBtn.onclick = () => claimCall(call.id, claimBtn, statusMsg);
    actions.appendChild(claimBtn);
  } else if (NEXT_STAGE[call.status]) {
    const advanceBtn = document.createElement('button');
    advanceBtn.textContent = `Mark as: ${NEXT_STAGE[call.status].replace('_', ' ')}`;
    advanceBtn.onclick = () => logHandoff(call.id, NEXT_STAGE[call.status], advanceBtn, statusMsg, card);
    actions.appendChild(advanceBtn);
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
    statusMsg.textContent = `Too late — already claimed by ${data.claimed_by}.`;
    statusMsg.className = 'status-msg error';
    btn.remove();
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

async function logHandoff(callId, stage, btn, statusMsg, card) {
  btn.disabled = true;
  const recordedBy = prompt('Your name:');
  const notes = prompt(`Medical notes for stage "${stage}" (optional, leave blank for none):`);

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
    body: JSON.stringify({ location, description, urgency }),
  });

  if (res.ok) {
    statusEl.textContent = 'Call reported.';
    statusEl.className = 'status-msg success';
    e.target.reset();
    loadCalls();
  } else {
    const data = await res.json();
    statusEl.textContent = data.error || 'Something went wrong.';
    statusEl.className = 'status-msg error';
  }
});

loadCalls();
