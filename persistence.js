// --------------------------------------------------------------
// persistence.js
// AutoPilot v3 · Assignment Audit Trail (ES6 Module)
//
// This module provides:
//   • buildAssignmentRecord()
//   • saveAssignmentRecord()
//   • getAssignmentHistory()
//
// The current implementation stores records in localStorage to
// make the demo run without a backend. Your dev team can easily
// swap saveAssignmentRecord() to POST to an API.
// --------------------------------------------------------------

// --------------------------------------------------------------
// Build audit record
// --------------------------------------------------------------
export function buildAssignmentRecord({ trip, rec, dispatcherNotes, dispatcherName }) {
  return {
    recordId: crypto.randomUUID(),
    tripId: trip.id,
    route: trip.route,
    startWindow: trip.window,
    timestamp: new Date().toISOString(),
    assignedPIC: rec.pic,
    assignedSIC: rec.sic,
    pairingScore: rec.totalScore ?? null,
    safetyAlerts: rec.safetyAlerts || [],
    dispatcherNotes: dispatcherNotes || "",
    dispatcherName: dispatcherName || "Unknown",
  };
}

// --------------------------------------------------------------
// Save to local storage
// --------------------------------------------------------------
export function saveAssignmentRecord(record) {
  try {
    const key = "autopilot_assignment_history";
    const existing = JSON.parse(localStorage.getItem(key)) || [];
    existing.push(record);
    localStorage.setItem(key, JSON.stringify(existing));
  } catch (err) {
    console.error("Failed to save audit record:", err);
  }
}

// --------------------------------------------------------------
// Retrieve saved records
// --------------------------------------------------------------
export function getAssignmentHistory() {
  try {
    const key = "autopilot_assignment_history";
    return JSON.parse(localStorage.getItem(key)) || [];
  } catch (err) {
    console.error("Failed to load audit history:", err);
    return [];
  }
}
