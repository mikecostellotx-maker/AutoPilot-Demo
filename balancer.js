// --------------------------------------------------------------
// balancer.js
// AutoPilot v3 · Monthly TAFB Fairness Engine (ES6 Module)
//
// This algorithm:
//  - Looks at all unassigned trips
//  - Pulls recommendations from engine.js
//  - Computes a “credit” for each trip based on TAFB
//  - Simulates every recommended pairing
//  - Picks the one that keeps workload closest to fair
//  - Penalizes safety alerts & overuse
// --------------------------------------------------------------

import { buildRecommendations } from "./engine.js";

// --------------------------------------------------------------
// balanceSchedule()
// --------------------------------------------------------------
export function balanceSchedule(trips, pilots, pairingHistory, dutyStats, options = {}) {
  const metric = options.metric ?? "TAFB";          // 'TAFB' | 'LEGS'
  const tafbUnit = options.tafbUnit ?? "hours";     // 'hours' | 'days'

  // Ledger of TAFB per pilot
  const credits = {};
  pilots.forEach(p => (credits[p.short] = 0));

  const target = options.targetCredit ??
    estimateTargetCredit(trips, pilots, { metric, tafbUnit });

  const assignments = {};

  for (const trip of trips) {
    if (trip.assignedPIC || trip.assignedSIC) continue;

    const recs = buildRecommendations(trip, pilots, pairingHistory, dutyStats);
    if (!recs?.length) continue;

    const c = tripCreditValue(trip, { metric, tafbUnit });

    let best = null;

    for (const rec of recs) {
      const picShort = extractShort(rec.pic);
      const sicShort = extractShort(rec.sic);

      // simulate
      const proj = { ...credits };
      proj[picShort] = (proj[picShort] ?? 0) + c;
      proj[sicShort] = (proj[sicShort] ?? 0) + c;

      const score =
        varianceFromTarget(proj, target) +
        penaltySafety(rec) +
        penaltyOveruse(proj, target);

      if (!best || score < best.score) {
        best = { rec, score, picShort, sicShort };
      }
    }

    if (best) {
      assignments[trip.id] = {
        picShort: best.picShort,
        sicShort: best.sicShort,
        rec: best.rec
      };

      credits[best.picShort] += c;
      credits[best.sicShort] += c;
    }
  }

  return {
    targetCredit: target,
    creditByPilot: credits,
    assignments
  };
}

// --------------------------------------------------------------
// tripCreditValue() – turns a trip into a numeric fairness credit
// --------------------------------------------------------------
function tripCreditValue(trip, { metric, tafbUnit }) {
  if (metric === "LEGS") return Math.max(1, (trip.legs?.length || 1));

  const hours = estimateTAFBHours(trip);
  return tafbUnit === "days" ? hours / 24 : hours;
}

// --------------------------------------------------------------
// Target fairness is “total credits / number of pilots”
// --------------------------------------------------------------
function estimateTargetCredit(trips, pilots, { metric, tafbUnit }) {
  let total = 0;
  for (const t of trips) {
    const credit = tripCreditValue(t, { metric, tafbUnit });
    total += credit * 2; // PIC + SIC both accrue TAFB
  }
  return total / pilots.length;
}

// --------------------------------------------------------------
// Estimate TAFB from:
//  - trip.tafbHours
//  - trip.tafbDays
//  - windowStartISO / windowEndISO
//  - fallback: legs × 6h
// --------------------------------------------------------------
function estimateTAFBHours(trip) {
  if (typeof trip.tafbHours === "number") return Math.max(0.5, trip.tafbHours);
  if (typeof trip.tafbDays === "number") return Math.max(0.5, trip.tafbDays * 24);

  if (trip.windowStartISO && trip.windowEndISO) {
    const a = Date.parse(trip.windowStartISO);
    const b = Date.parse(trip.windowEndISO);
    if (!Number.isNaN(a) && !Number.isNaN(b) && b > a) {
      return Math.max(0.5, (b - a) / 3_600_000);
    }
  }

  const legs = Math.max(1, (trip.legs?.length || 1));
  return legs * 6;
}

// --------------------------------------------------------------
// Variance from target – lower is better
// --------------------------------------------------------------
function varianceFromTarget(ledger, target) {
  const diffs = Object.values(ledger).map(v => (v - target) ** 2);
  return diffs.reduce((s, x) => s + x, 0) / diffs.length;
}

// --------------------------------------------------------------
// Safety Penalties – avoid unsafe pairings
// --------------------------------------------------------------
function penaltySafety(rec) {
  let p = 0;
  if (rec.safetyAlerts?.length) p += 6;
  if (rec.nightCurrencyOkay === false) p += 5;
  return p;
}

// --------------------------------------------------------------
// Overuse Penalty – push back on anyone going 50% above target
// --------------------------------------------------------------
function penaltyOveruse(ledger, target) {
  let p = 0;
  for (const k in ledger) {
    if (ledger[k] > target * 1.5) p += 3;
  }
  return p;
}

// --------------------------------------------------------------
// Extract pilot short code from "Name (SHORT)" label
// --------------------------------------------------------------
function extractShort(label) {
  const m = label.match(/\(([^)]+)\)/);
  return m ? m[1] : label;
}
