// persistence.js
//
// Builds an assignment record and persists it (demo = localStorage).
// Your backend team should replace `saveAssignmentRecord()` with
// a real POST to an internal API.

export function buildAssignmentRecord({
  trip,
  rec,
  dispatcherNotes,
  dispatcherName
}) {
  return {
    tripId: trip.id,
    tail: trip.tail,
    airframe: trip.airframe,
    route: trip.route,
    window: trip.window,
    assignedPIC: rec.pic,
    assignedSIC: rec.sic,
    dispatcherNotes,
    dispatcherName,
    timestampUTC: new Date().toISOString(),
    safetySnapshot: {
      nightCurrencyOkay: rec.nightCurrencyOkay,
      safetyAlerts: rec.safetyAlerts || []
    },
    rationaleBullets: rec.bullets || []
  };
}

// Temporary local persistence so you can demo traceability.
export function saveAssignmentRecord(record) {
  const key = "autopilot_assignments";
  const raw = window.localStorage.getItem(key);
  const arr = raw ? JSON.parse(raw) : [];
  arr.push(record);
  window.localStorage.setItem(key, JSON.stringify(arr));
}
