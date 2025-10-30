// autopilot.js
//
// Main UI controller for AutoPilot.
// - Renders trip list
// - Shows detail / recs / assign overlay
// - Confirms crew assignments and logs audit
//
// Now uses ES6 modules.

import { buildRecommendations } from './engine.js';
import { buildAssignmentRecord, saveAssignmentRecord } from './persistence.js';

// ----- Mock Data Stubs ------------------------------------------------------
// In production, your devs will replace these with real data
// from MySky ingest, quals db, and crew duty tracker.

// 1. Pilot roster sample
const pilots = [
  {
    name: "Sean Cannon",
    short: "SCC",
    role: "Standards",
    seat: "DUAL",
    aircraft: ["G500","G650"],
    specialCurrency: { "ASPEN": 52, "EAGLE": 14 },
    nightLandings90: 2,
    nightHours90: 14,
    totalDuty14: 8,
    totalWeekends30: 1,
    upgradeTrack: false
  },
  {
    name: "John Burden",
    short: "JCB",
    role: "Line",
    seat: "DUAL",
    aircraft: ["G500","G650"],
    specialCurrency: { "ASPEN": 80, "EAGLE": 40 },
    nightLandings90: 4,
    nightHours90: 9,
    totalDuty14: 7,
    totalWeekends30: 2,
    upgradeTrack: false
  },
  {
    name: "Carlton Chambers",
    short: "CBC",
    role: "Standards",
    seat: "DUAL",
    aircraft: ["G500","G650"],
    specialCurrency: { "ASPEN": 15, "EAGLE": 12 },
    nightLandings90: 5,
    nightHours90: 22,
    totalDuty14: 10,
    totalWeekends30: 4,
    upgradeTrack: false
  },
  {
    name: "Mike Costello",
    short: "MJC",
    role: "Upgrade",
    seat: "DUAL",
    aircraft: ["G500","G280"],
    specialCurrency: { "ASPEN": 60, "EAGLE": 9 },
    nightLandings90: 1,
    nightHours90: 6,
    totalDuty14: 6,
    totalWeekends30: 1,
    upgradeTrack: true
  }
  // ...add rest of department here
];

// 2. Pairing history sample
const pairingHistory = {
  "SCC|JCB": { lastPairedDaysAgo: 72, pairCountLast90: 1 },
  "CBC|MJC": { lastPairedDaysAgo: 14, pairCountLast90: 3 }
  // default assumed as: 90 days / 0 pairings if not found
};

// 3. Duty stats baseline (fleet norms)
const dutyStats = {
  avgDuty14: 6.5,
  avgWeekends30: 2.1
};

// 4. Trips (will eventually come from MySky sync)
const trips = [
  {
    id: "T-90115",
    airframe: "G500",
    tail: "N650RA",
    route: "KFTW → KASE",
    start: "Fri Nov 14",
    special: "ASPEN",
    assignedPIC: null,
    assignedSIC: null,
    legs: [
      { num: 1, dep: "KFTW", arr: "KASE", etd: "09:30", eta: "11:30" },
      { num: 2, dep: "KASE", arr: "KFTW", etd: "13:30", eta: "15:20" }
    ],
    window: "Fri Nov 14 → Sun Nov 16",
    recs: [] // will be filled by engine
  },
  {
    id: "T-90144",
    airframe: "G280",
    tail: "N280RA",
    route: "KABI → KHOU",
    start: "Sat Nov 15",
    special: null,
    assignedPIC: null,
    assignedSIC: "Assigned",
    legs: [
      { num: 1, dep: "KABI", arr: "KHOU", etd: "08:10", eta: "09:20" }
    ],
    window: "Sat Nov 15",
    recs: []
  },
  {
    id: "T-90152",
    airframe: "G500",
    tail: "N650RA",
    route: "KEGE → KDAL",
    start: "Tue Nov 18",
    special: "EAGLE",
    assignedPIC: "Assigned",
    assignedSIC: null,
    legs: [
      { num: 1, dep: "KEGE", arr: "KDAL", etd: "07:45", eta: "10:15" }
    ],
    window: "Tue Nov 18",
    recs: []
  }
];

// Precompute recs for each trip using the engine.
trips.forEach(trip => {
  trip.recs = buildRecommendations(trip, pilots, pairingHistory, dutyStats);
});

// ----- DOM lookups ----------------------------------------------------------
const tripListEl = document.getElementById("tripList");
const viewTripDetailEl = document.getElementById("viewTripDetail");
const viewRecommendationsEl = document.getElementById("viewRecommendations");
const assignOverlayEl = document.getElementById("assignOverlay");
const emptyStateEl = document.getElementById("emptyState");

// RENDER: left side trip list
function renderTripList() {
  tripListEl.innerHTML = "";
  trips.forEach((trip) => {
    const card = document.createElement("div");
    card.className = "trip-card";
    card.onclick = () => showTripDetail(trip.id);

    const specialBadge = trip.special
      ? `<span class="badge special">✦ ${trip.special}</span>`
      : "";

    const picBadge = trip.assignedPIC ? `<span class="badge assigned">PIC ✓</span>` : "";
    const sicBadge = trip.assignedSIC ? `<span class="badge assigned">SIC ✓</span>` : "";

    card.innerHTML = `
      <div class="trip-mainline">
        <div class="trip-route">${trip.id} · ${trip.airframe} · ${trip.route}</div>
        <div class="trip-tail">${trip.tail}</div>
      </div>
      <div class="trip-subline">
        <div>Start: ${trip.start}</div>
        ${specialBadge}
        ${picBadge}
        ${sicBadge}
      </div>
    `;

    tripListEl.appendChild(card);
  });
}

// VIEW: Trip detail (right panel)
function showTripDetail(tripId) {
  const trip = trips.find((t) => t.id === tripId);
  if (!trip) return;

  emptyStateEl.classList.add("card-hidden");
  viewRecommendationsEl.classList.add("card-hidden");
  assignOverlayEl.classList.add("card-hidden");
  viewTripDetailEl.classList.remove("card-hidden");

  const legsHtml = trip.legs
    .map(
      (leg) => `
        <div class="row-line">
          <div class="row-label">Leg #${leg.num}</div>
          <div class="row-value">${leg.dep} → ${leg.arr} &nbsp;&nbsp; ETD ${leg.etd} / ETA ${leg.eta}</div>
        </div>`
    )
    .join("");

  const specialFlagHtml = trip.special
    ? `<div class="row-line">
         <div class="row-label">Special</div>
         <div class="row-value special-apt-flag">✦ ${trip.special}</div>
       </div>`
    : "";

  viewTripDetailEl.innerHTML = `
    <div class="card-section-title">
      <span>Trip ${trip.id}</span>
      <button class="assign-btn" onclick="showRecommendations('${trip.id}')">
        View Recommendations
      </button>
    </div>
    <div class="row-line">
      <div class="row-label">Airframe</div>
      <div class="row-value">${trip.airframe} · ${trip.tail}</div>
    </div>
    <div class="row-line">
      <div class="row-label">Window</div>
      <div class="row-value">${trip.window}</div>
    </div>
    ${specialFlagHtml}
    ${legsHtml}
    <div class="row-line">
      <div class="row-label">Assigned</div>
      <div class="row-value">PIC: ${trip.assignedPIC || "—"} / SIC: ${trip.assignedSIC || "—"}</div>
    </div>
  `;
}

// VIEW: Recommended pairings
function showRecommendations(tripId) {
  const trip = trips.find((t) => t.id === tripId);
  if (!trip) return;

  emptyStateEl.classList.add("card-hidden");
  viewTripDetailEl.classList.add("card-hidden");
  assignOverlayEl.classList.add("card-hidden");
  viewRecommendationsEl.classList.remove("card-hidden");

  let recsHtml = trip.recs
    .map((rec, idx) => {
      const bulletsHtml = [...rec.bullets, ...(rec.safetyAlerts || [])]
        .map((b) => `<div>• ${b}</div>`)
        .join("");

      // warn block for night currency (PIC)
      const warnHtml = rec.nightCurrencyOkay
        ? ""
        : `<div class="rec-warning">⚠ PIC does not currently meet night landing currency (3/90 or 15hr/90). Dispatcher verification required.</div>`;

      const bar = (label, pct) => `
        <div class="bar-group">
          <div class="score-bar-bg">
            <div class="score-bar-fill" style="width:${Math.round(pct * 100)}%"></div>
          </div>
          <div>${label}</div>
        </div>
      `;

      const barsHtml = `
        <div class="rec-bars">
          ${bar("Familiarity", rec.bars.familiarity)}
          ${bar("Rotation",    rec.bars.rotation)}
          ${bar("Special Apt", rec.bars.special)}
          ${bar("Upgrade",     rec.bars.upgrade)}
          ${bar("Duty",        rec.bars.duty)}
        </div>
      `;

      return `
        <div class="rec-card">
          <div class="rec-headline">
            <div class="rec-score">⭐ Score ${rec.score} — ${rec.pic} / ${rec.sic}</div>
            <div class="rec-actions">
              <button class="assign-btn" onclick="openAssign('${trip.id}', ${idx})">Assign Crew</button>
              <button class="copy-btn" onclick="copyPair('${trip.id}', ${idx})">Copy</button>
            </div>
          </div>
          ${barsHtml}
          <div class="rec-flags">
            ${bulletsHtml}
            ${warnHtml}
          </div>
        </div>
      `;
    })
    .join("");

  if (!recsHtml) {
    recsHtml = `
      <div class="rec-card">
        <div class="rec-headline">
          <div class="rec-score">No recommendations generated</div>
        </div>
        <div class="rec-flags">
          This trip may already be partially assigned or missing eligible crew data.
        </div>
      </div>
    `;
  }

  viewRecommendationsEl.innerHTML = `
    <div class="card-section-title">
      <span>Recommended Pairings for Trip ${trip.id}</span>
      <button class="copy-btn" onclick="showTripDetail('${trip.id}')">Back to Trip</button>
    </div>
    ${recsHtml}
  `;
}

// VIEW: Assignment overlay
function openAssign(tripId, recIdx) {
  const trip = trips.find((t) => t.id === tripId);
  if (!trip) return;
  const rec = trip.recs[recIdx];
  if (!rec) return;

  emptyStateEl.classList.add("card-hidden");
  viewTripDetailEl.classList.add("card-hidden");
  viewRecommendationsEl.classList.add("card-hidden");
  assignOverlayEl.classList.remove("card-hidden");

  const rationaleHtml = `
    • ${[...rec.bullets, ...(rec.safetyAlerts || [])].join("<br>• ")}<br>
    ${!rec.nightCurrencyOkay
      ? "<br>⚠ PIC does not currently meet night landing currency (3/90 or 15hr/90). Dispatcher verification required."
      : ""
    }
  `;

  assignOverlayEl.innerHTML = `
    <div class="card-section-title">
      <span>Assign Crew — ${trip.id}</span>
      <button class="copy-btn" onclick="showRecommendations('${trip.id}')">Back to Recs</button>
    </div>

    <div class="overlay-inner">
      <div class="form-row">
        <div class="form-label">PIC</div>
        <select class="select-input" id="picSelect">
          <option>${rec.pic}</option>
        </select>
      </div>

      <div class="form-row">
        <div class="form-label">SIC</div>
        <select class="select-input" id="sicSelect">
          <option>${rec.sic}</option>
        </select>
      </div>

      <div class="form-row">
        <div class="form-label">Why this pairing</div>
        <div class="pair-rationale">${rationaleHtml}</div>
      </div>

      <div class="form-row">
        <div class="form-label">Dispatcher Notes (required if overriding)</div>
        <textarea class="notes-input" id="notesBox" placeholder="Example: Pairing adjusted for upgrade observation / fatigue / maintenance reposition, etc."></textarea>
      </div>

      <div class="overlay-actions">
        <button class="cancel-btn" onclick="showRecommendations('${trip.id}')">Cancel</button>
        <button class="confirm-btn" onclick="confirmAssign('${trip.id}', ${recIdx})">Confirm</button>
      </div>
    </div>
  `;
}

// ACTION: Confirm assignment
function confirmAssign(tripId, recIdx) {
  const trip = trips.find((t) => t.id === tripId);
  if (!trip) return;
  const rec = trip.recs[recIdx];
  if (!rec) return;

  // read dispatcher notes from overlay textarea
  const notesBox = document.getElementById("notesBox");
  const dispatcherNotes = notesBox ? notesBox.value.trim() : "";

  // TODO: replace with real dispatcher identity (e.g. from login session)
  const dispatcherName = "Dispatcher / Demo";

  // update in-memory assignment for UI
  trip.assignedPIC = rec.pic;
  trip.assignedSIC = rec.sic;

  // build + persist audit trail
  const record = buildAssignmentRecord({
    trip,
    rec,
    dispatcherNotes,
    dispatcherName
  });
  saveAssignmentRecord(record);

  // re-render sidebar + trip detail view
  renderTripList();
  showTripDetail(tripId);
}

// COPY HELPERS
function copyPair(tripId, recIdx) {
  const trip = trips.find((t) => t.id === tripId);
  const rec = trip?.recs?.[recIdx];
  if (!trip || !rec) return;

  const text = `Trip ${trip.id} (${trip.airframe} ${trip.tail} ${trip.route})
PIC: ${rec.pic}
SIC: ${rec.sic}`;
  navigator.clipboard.writeText(text).then(() => {
    alert("Pairing copied to clipboard.");
  });
}

// Attach functions to window so inline onclick="" works
window.showTripDetail = showTripDetail;
window.showRecommendations = showRecommendations;
window.openAssign = openAssign;
window.confirmAssign = confirmAssign;
window.copyPair = copyPair;

// Init
renderTripList();
