// --------------------------------------------------------------
// autopilot.js
// AutoPilot v3 · Main App & UI Wiring (ES6 Module)
// --------------------------------------------------------------

import { buildRecommendations } from "./engine.js";
import { balanceSchedule } from "./balancer.js";
import {
  buildAssignmentRecord,
  saveAssignmentRecord,
  getAssignmentHistory
} from "./persistence.js";

// --------------------------------------------------------------
// Mock Data (Pilots & Trips)
// In production, replace with MySky ingest.
// --------------------------------------------------------------

const pilots = [
  {
    short: "MJC",
    name: "Mike Costello",
    airframe: "G500",
    seniority: 5,
    upgradeTrack: false,
    specialAirports: ["ASPEN", "EAGLE"],
    specialRecency: {
      ASPEN: { lastLanding: Date.parse("2025-03-01T18:00:00Z") }
    },
    lastNightLanding: Date.parse("2025-10-15T04:00:00Z"),
    maxedOut: false
  },
  {
    short: "SCC",
    name: "Sean Cannon",
    airframe: "G500",
    seniority: 7,
    upgradeTrack: true,
    specialAirports: ["ASPEN"],
    specialRecency: {
      ASPEN: { lastLanding: Date.parse("2025-06-10T05:00:00Z") }
    },
    lastNightLanding: Date.parse("2025-09-25T03:30:00Z"),
    maxedOut: false
  },
  {
    short: "EJH",
    name: "Eric Holland",
    airframe: "G500",
    seniority: 4,
    upgradeTrack: false,
    specialAirports: ["EAGLE"],
    specialRecency: {
      EAGLE: { lastLanding: Date.parse("2025-04-20T17:00:00Z") }
    },
    lastNightLanding: Date.parse("2025-11-01T02:15:00Z"),
    maxedOut: false
  },
  {
    short: "PBZ",
    name: "Phillip Zimmerman",
    airframe: "G500",
    seniority: 9,
    upgradeTrack: true,
    specialAirports: [],
    specialRecency: {},
    lastNightLanding: Date.parse("2025-07-01T01:00:00Z"),
    maxedOut: false
  }
];

// Pairing history: how many times each combination has flown together
// key = "PIC-SIC" (short codes)
const pairingHistory = {
  "MJC-SCC": 3,
  "MJC-EJH": 1,
  "SCC-PBZ": 0
};

// Duty stats stub (for future expansion)
const dutyStats = {};

// Sample trips with realistic ISO windows + TAFB
const trips = [
  {
    id: "T-90115",
    airframe: "G500",
    tail: "N650RA",
    route: "KFTW → KASE → KFTW",
    start: "Fri Nov 14",
    special: "ASPEN",
    window: "Fri Nov 14 → Sun Nov 16",
    windowStartISO: "2025-11-14T08:00:00-06:00",
    windowEndISO: "2025-11-16T18:00:00-06:00",
    tafbHours: 58, // ~2.4 days
    legs: [
      { num: 1, dep: "KFTW", arr: "KASE", etd: "09:30", eta: "11:30" },
      { num: 2, dep: "KASE", arr: "KFTW", etd: "15:00", eta: "17:00" }
    ],
    assignedPIC: null,
    assignedSIC: null,
    recs: []
  },
  {
    id: "T-90122",
    airframe: "G500",
    tail: "N650RA",
    route: "KFTW → KEGE → KFTW",
    start: "Sat Nov 22",
    special: "EAGLE",
    window: "Sat Nov 22 → Sun Nov 23",
    windowStartISO: "2025-11-22T06:30:00-06:00",
    windowEndISO: "2025-11-23T21:00:00-06:00",
    tafbHours: 38.5,
    legs: [
      { num: 1, dep: "KFTW", arr: "KEGE", etd: "08:00", eta: "10:30" },
      { num: 2, dep: "KEGE", arr: "KFTW", etd: "18:30", eta: "21:00" }
    ],
    assignedPIC: null,
    assignedSIC: null,
    recs: []
  },
  {
    id: "T-90125",
    airframe: "G500",
    tail: "N650RA",
    route: "KFTW → KLAX → KFTW",
    start: "Tue Nov 25",
    special: null,
    window: "Tue Nov 25",
    windowStartISO: "2025-11-25T07:00:00-06:00",
    windowEndISO: "2025-11-25T22:00:00-06:00",
    tafbHours: 15,
    legs: [
      { num: 1, dep: "KFTW", arr: "KLAX", etd: "08:00", eta: "10:30" },
      { num: 2, dep: "KLAX", arr: "KFTW", etd: "18:00", eta: "21:00" }
    ],
    assignedPIC: null,
    assignedSIC: null,
    recs: []
  }
];

// Expose for quick console testing if desired
window.trips = trips;
window.pilots = pilots;
window.pairingHistory = pairingHistory;

// --------------------------------------------------------------
// DOM References
// --------------------------------------------------------------

const tripListEl = document.getElementById("tripList");
const viewTripDetailEl = document.getElementById("viewTripDetail");
const viewRecommendationsEl = document.getElementById("viewRecommendations");
const assignOverlayEl = document.getElementById("assignOverlay");
const emptyStateEl = document.getElementById("emptyState");

const syncBtn = document.getElementById("syncBtn");
const balanceBtn = document.getElementById("balanceBtn");

// Current selection
let selectedTrip = null;
let selectedRec = null;

// --------------------------------------------------------------
// Initialization
// --------------------------------------------------------------

function init() {
  wireButtons();
  renderTripList();
  showEmptyState();
}

function wireButtons() {
  if (syncBtn) {
    syncBtn.addEventListener("click", () => {
      alert("MySky sync is stubbed in this demo. Devs: wire API → trips[] / pilots[].");
    });
  }

  if (balanceBtn) {
    balanceBtn.addEventListener("click", runAutoBalance);
  }
}

// --------------------------------------------------------------
// Trip List Rendering
// --------------------------------------------------------------

function renderTripList() {
  tripListEl.innerHTML = "";

  trips.forEach(trip => {
    const card = document.createElement("div");
    card.className = "trip-card";
    card.addEventListener("click", () => selectTrip(trip.id));

    const status = trip.assignedPIC
      ? `<div class="trip-meta">Assigned: ${trip.assignedPIC} / ${trip.assignedSIC}</div>`
      : `<div class="trip-meta">Unassigned · ${trip.window}</div>`;

    card.innerHTML = `
      <div class="trip-title">${trip.route}</div>
      <div class="trip-meta">Tail: ${trip.tail} · Airframe: ${trip.airframe}</div>
      ${status}
    `;

    tripListEl.appendChild(card);
  });
}

// --------------------------------------------------------------
// Trip Selection & Detail View
// --------------------------------------------------------------

function selectTrip(tripId) {
  const trip = trips.find(t => t.id === tripId);
  if (!trip) return;

  selectedTrip = trip;
  selectedRec = null;

  emptyStateEl.classList.add("card-hidden");
  viewTripDetailEl.classList.remove("card-hidden");
  viewRecommendationsEl.classList.remove("card-hidden");
  assignOverlayEl.classList.add("card-hidden");

  renderTripDetail(trip);
  renderRecommendations(trip);
}

function renderTripDetail(trip) {
  viewTripDetailEl.innerHTML = `
    <h2>Trip Detail</h2>
    <p><strong>Route:</strong> ${trip.route}</p>
    <p><strong>Tail:</strong> ${trip.tail}</p>
    <p><strong>Window:</strong> ${trip.window}</p>
    <p><strong>TAFB (hrs):</strong> ${trip.tafbHours ?? "N/A"}</p>
    <p><strong>Special:</strong> ${trip.special || "None"}</p>
    <p><strong>Legs:</strong></p>
    <ul>
      ${trip.legs
        .map(
          leg =>
            `<li>Leg ${leg.num}: ${leg.dep} → ${leg.arr} (${leg.etd}–${leg.eta})</li>`
        )
        .join("")}
    </ul>
    <p><strong>Assigned Crew:</strong> ${
      trip.assignedPIC ? `${trip.assignedPIC} / ${trip.assignedSIC}` : "None"
    }</p>
  `;
}

// --------------------------------------------------------------
// Recommendations View
// --------------------------------------------------------------

function renderRecommendations(trip) {
  const recs = buildRecommendations(trip, pilots, pairingHistory, dutyStats);
  trip.recs = recs; // store for reuse (e.g., balancer)

  if (!recs.length) {
    viewRecommendationsEl.innerHTML = "<p>No valid recommendations.</p>";
    return;
  }

  // Limit to top 5 for UI readability
  const top = recs.slice(0, 5);

  let html = `<h2>Recommended Pairings</h2>`;

  top.forEach((rec, idx) => {
    html += `
      <div class="card" style="margin-bottom: 12px;">
        <div><strong>Option ${idx + 1}</strong></div>
        <div style="margin-top:4px;">PIC: ${rec.pic}</div>
        <div>SIC: ${rec.sic}</div>
        <div style="margin-top:6px;font-size:0.9rem;color:#c8d1dc;">
          Total Score: ${rec.totalScore.toFixed(1)}
        </div>

        <div style="margin-top:10px;">
          <div style="font-size:0.8rem;">Familiarity</div>
          ${renderScoreBar(rec.familiarityScore)}
          <div style="font-size:0.8rem;">Rotation/Duty</div>
          ${renderScoreBar(rec.dutyScore)}
          <div style="font-size:0.8rem;">Special Airport</div>
          ${renderScoreBar(rec.airportScore)}
          <div style="font-size:0.8rem;">Upgrade</div>
          ${renderScoreBar(rec.upgradeScore)}
        </div>

        ${
          rec.safetyAlerts?.length
            ? `<div style="margin-top:8px;color:#ff6262;font-size:0.8rem;">
                 Safety alerts:<br>${rec.safetyAlerts
                   .map(a => `• ${a}`)
                   .join("<br>")}
               </div>`
            : ""
        }

        <button
          class="sync-btn"
          style="margin-top:10px;"
          data-rec-index="${idx}"
        >
          Assign This Pair
        </button>
      </div>
    `;
  });

  viewRecommendationsEl.innerHTML = html;

  // Wire assign buttons
  const buttons = viewRecommendationsEl.querySelectorAll("button[data-rec-index]");
  buttons.forEach(btn => {
    btn.addEventListener("click", () => {
      const idx = parseInt(btn.getAttribute("data-rec-index"), 10);
      const rec = top[idx];
      openAssignOverlay(selectedTrip, rec);
    });
  });
}

function renderScoreBar(score) {
  const max = 10; // scoring is roughly on -10..+10; clamp visually
  const value = Math.max(0, Math.min(max, score + max / 2)); // shift for positive width
  const pct = (value / max) * 100;

  return `
    <div class="score-bar">
      <div class="score-fill" style="width:${pct}%;"></div>
    </div>
  `;
}

// --------------------------------------------------------------
// Assign Overlay & Apply Assignment
// --------------------------------------------------------------

function openAssignOverlay(trip, rec) {
  selectedRec = rec;

  assignOverlayEl.classList.remove("card-hidden");
  assignOverlayEl.innerHTML = `
    <div class="card">
      <h2>Confirm Assignment</h2>
      <p><strong>Trip:</strong> ${trip.route}</p>
      <p><strong>Window:</strong> ${trip.window}</p>
      <p><strong>Assign:</strong> ${rec.pic} / ${rec.sic}</p>
      <p style="font-size:0.9rem;margin-top:8px;">
        Total Score: ${rec.totalScore.toFixed(1)}
      </p>
      <label style="display:block;margin-top:10px;font-size:0.9rem;">
        Dispatcher Notes:<br/>
        <textarea id="dispatcherNotes" style="width:100%;height:70px;border-radius:8px;border:1px solid #2f363f;background:#111418;color:#fff;padding:6px;"></textarea>
      </label>
      <div style="margin-top:14px;display:flex;gap:8px;justify-content:flex-end;">
        <button id="cancelAssignBtn" class="sync-btn" style="background:#444;">Cancel</button>
        <button id="confirmAssignBtn" class="sync-btn">Confirm Assign</button>
      </div>
    </div>
  `;

  document.getElementById("cancelAssignBtn").addEventListener("click", () => {
    assignOverlayEl.classList.add("card-hidden");
  });

  document.getElementById("confirmAssignBtn").addEventListener("click", () => {
    const notes = document.getElementById("dispatcherNotes").value || "";
    applyAssignment(trip, rec, notes);
  });
}

function applyAssignment(trip, rec, dispatcherNotes) {
  trip.assignedPIC = rec.pic;
  trip.assignedSIC = rec.sic;

  const record = buildAssignmentRecord({
    trip,
    rec,
    dispatcherNotes,
    dispatcherName: "Dispatcher (Manual)"
  });
  saveAssignmentRecord(record);

  assignOverlayEl.classList.add("card-hidden");
  renderTripList();
  renderTripDetail(trip);
}

// --------------------------------------------------------------
// Auto-Balance: TAFB-based fairness
// --------------------------------------------------------------

function runAutoBalance() {
  const plan = balanceSchedule(trips, pilots, pairingHistory, dutyStats, {
    metric: "TAFB",
    tafbUnit: "hours"
  });

  Object.entries(plan.assignments).forEach(([tripId, assignment]) => {
    const trip = trips.find(t => t.id === tripId);
    if (!trip) return;

    // Ensure we have recs for this trip
    if (!trip.recs || !trip.recs.length) {
      trip.recs = buildRecommendations(trip, pilots, pairingHistory, dutyStats);
    }

    let rec =
      trip.recs.find(
        r =>
          r.pic.includes(`(${assignment.picShort})`) &&
          r.sic.includes(`(${assignment.sicShort})`)
      ) || trip.recs[0];

    trip.assignedPIC = rec.pic;
    trip.assignedSIC = rec.sic;

    const record = buildAssignmentRecord({
      trip,
      rec,
      dispatcherNotes: "[Auto-Balance TAFB] Scheduled to reduce monthly TAFB variance.",
      dispatcherName: "AutoPilot Balancer"
    });
    saveAssignmentRecord(record);
  });

  renderTripList();
  showEmptyState();
  alert("Auto-Balance complete (TAFB). Assignments applied and logged.");
}

// --------------------------------------------------------------
// Empty State helper
// --------------------------------------------------------------

function showEmptyState() {
  emptyStateEl.classList.remove("card-hidden");
  viewTripDetailEl.classList.add("card-hidden");
  viewRecommendationsEl.classList.add("card-hidden");
  assignOverlayEl.classList.add("card-hidden");
}

// --------------------------------------------------------------
// Quick dev helper: view history in console if needed
// --------------------------------------------------------------
window.viewAutoPilotHistory = function () {
  console.table(getAssignmentHistory());
};

// --------------------------------------------------------------
// Boot
// --------------------------------------------------------------

init();
