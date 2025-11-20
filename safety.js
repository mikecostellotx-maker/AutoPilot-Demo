// --------------------------------------------------------------
// safety.js
// AutoPilot v3 · Safety, Currency & Special-Airport Checks
// --------------------------------------------------------------
//
// This module returns a structured object with:
//  - alerts[]  → red-flag issues for UI
//  - nightCurrencyOkay (boolean)
//
// The engine.js module consumes this to apply safety penalties.
// The balancer.js module uses safety alerts to avoid unsafe picks.
// --------------------------------------------------------------

export function runSafetyChecks(trip, pic, sic) {
  const alerts = [];

  // --------------------------
  // 1) Special airport recency
  // --------------------------
  if (trip.special) {
    const pOK = hasRecentSpecial(pic, trip.special);
    const sOK = hasRecentSpecial(sic, trip.special);

    if (!pOK || !sOK) {
      alerts.push(
        `Special airport ${trip.special}: missing recency`
      );
    }
  }

  // --------------------------
  // 2) Night landing currency
  // --------------------------
  const picNightOK = checkNightLandingCurrency(pic);
  const sicNightOK = checkNightLandingCurrency(sic);

  const nightCurrencyOkay = picNightOK && sicNightOK;

  if (!picNightOK) alerts.push(`${pic.short}: PIC night currency expired`);
  if (!sicNightOK) alerts.push(`${sic.short}: SIC night currency expired`);

  // --------------------------
  // 3) Fatigue constraints
  // --------------------------
  if (pic.maxedOut) {
    alerts.push(`${pic.short}: fatigue/limit threshold`);
  }
  if (sic.maxedOut) {
    alerts.push(`${sic.short}: fatigue/limit threshold`);
  }

  // Additional logic can be added here: duty limits,
  // runway contamination, time-of-day constraints, etc.

  return {
    alerts,
    nightCurrencyOkay
  };
}

// --------------------------------------------------------------
// Special Airport Recency
// --------------------------------------------------------------

function hasRecentSpecial(pilot, airport) {
  if (!pilot.specialRecency) return false;
  const rec = pilot.specialRecency[airport];
  if (!rec) return false;

  // Recency threshold: 365 days (can be adjusted)
  const now = Date.now();
  const diffDays = Math.floor((now - rec.lastLanding) / 86_400_000);

  return diffDays <= 365;
}

// --------------------------------------------------------------
// Night Landing Currency
// --------------------------------------------------------------

function checkNightLandingCurrency(pilot) {
  if (!pilot.lastNightLanding) return false;
  const now = Date.now();

  // 90-day night landing rule
  const diffDays = Math.floor((now - pilot.lastNightLanding) / 86_400_000);

  return diffDays <= 90;
}
