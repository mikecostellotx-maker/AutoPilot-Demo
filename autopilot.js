// Sample trip data (what would've come from MySky / scheduler)
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
    recs: [
      {
        score: 82,
        pic: "Sean Cannon (SCC) — Standards",
        sic: "John Burden (JCB)",
        bars: {
          familiarity: 0.75,
          rotation: 0.90,
          special: 0.80,
          upgrade: 0.85,
          duty: 0.70
        },
        bullets: [
          "72 days since last pairing",
          "Standards + Upgrade development",
          "KASE recency: 52 days"
        ],
        nightCurrencyOkay: false // triggers warning
      },
      {
        score: 79,
        pic: "Chambers (CBC) — Standards",
        sic: "Costello (MJC)",
        bars: {
          familiarity: 0.60,
          rotation: 1.00,
          special: 0.70,
          upgrade: 0.40,
          duty: 0.90
        },
        bullets: [
          "New pairing in last 90 days",
          "Balanced duty distribution",
          "Mountain / special airport recency adequate"
        ],
        nightCurrencyOkay: true
      }
    ]
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

// DOM elements
const tripListEl = document.getElementById("tripList");
const viewTripDetailEl = document.getElementById("viewTripDetail");
const viewRecommendationsEl = document.getElementById("viewRecommendations");
const assignOverlayEl = document.getElementById("assignOverlay");
const emptyStateEl = document.getElementById("emptyState");

// render trips in left column
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

// show trip detail in right column
function showTripDetail(tripId) {
  const trip = trips.find((t) => t.id === tripId);
  if (!trip) return;

  // hide other views
  emptyStateEl.classList.add("card-hidden");
  viewRecommendationsEl.classList.add("card-hidden");
  assignOverlayEl.classList.add("card-hidden");
  viewTripDetailEl.classList.remove("card-hidden");

  // build legs HTML
  const legsHtml = trip.legs
    .map(
      (leg) => `
    <div class="row-line">
      <div class="row-label">Leg #${leg.num}</div>
      <div class="row-value">${leg.dep} → ${leg.arr} &nbsp;&nbsp; ETD ${leg.etd} / ETA ${leg.eta}</div>
    </div>
  `
    )
    .join("");

  // special airport flag
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

// show recommended pairings
function showRecommendations(tripId) {
  const trip = trips.find((t) => t.id === tripId);
  if (!trip) return;

  // hide others
  emptyStateEl.classList.add("card-hidden");
  viewTripDetailEl.classList.add("card-hidden");
  assignOverlayEl.classList.add("card-hidden");
  viewRecommendationsEl.classList.remove("card-hidden");

  // build rec cards
  let recsHtml = trip.recs
    .map((rec, idx) => {
      const bulletsHtml = rec.bullets
        .map((b) => `<div>• ${b}</div>`)
        .join("");

      // warning for night currency
      const warnHtml = rec.nightCurrencyOkay
        ? ""
        : `<div class="rec-warning">⚠ PIC does not currently meet night landing currency (3/90 or 15hr/90). Dispatcher verification required.</div>`;

      // score bars
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
          ${bar("Rotation", rec.bars.rotation)}
          ${bar("Special Apt", rec.bars.special)}
          ${bar("Upgrade", rec.bars.upgrade)}
          ${bar("Duty", rec.bars.duty)}
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

// open assign "modal" inline on right side
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
    • ${rec.bullets.join("<br>• ")}<br>
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

// confirm assignment logic
function confirmAssign(tripId, recIdx) {
  const trip = trips.find((t) => t.id === tripId);
  if (!trip) return;
  const rec = trip.recs[recIdx];
  if (!rec) return;

  // set assigned crew on that trip
  trip.assignedPIC = rec.pic;
  trip.assignedSIC = rec.sic;

  // after confirming, go back to home list and refresh right panel
  renderTripList();
  showTripDetail(tripId);
}

// "Copy" pairing for dispatcher clipboard use
function copyPair(tripId, recIdx) {
  const trip = trips.find((t) => t.id === tripId);
  const rec = trip?.recs?.[recIdx];
  if (!trip || !rec) return;

  const text = `Trip ${trip.id} (${trip.airframe} ${trip.tail} ${trip.route})\nPIC: ${rec.pic}\nSIC: ${rec.sic}`;
  navigator.clipboard.writeText(text).then(() => {
    alert("Pairing copied to clipboard.");
  });
}

// init
renderTripList();

