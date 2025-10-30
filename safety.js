// safety.js
//
// Currency / safety / policy checks for a proposed pairing.

export function runSafetyChecks(trip, pic, sic) {
  const alerts = [];

  // --- Night currency / landing currency check (PIC-focused) ---
  // Company policy (example):
  //   PIC must have either:
  //   - 3 night landings in last 90 days, OR
  //   - 15 hours of night in last 90 days
  //
  // NOTE: tune these thresholds to match dept SOP.
  const picNightOkay = meetsNightCurrency(pic);

  if (!picNightOkay) {
    alerts.push(
      "PIC does not currently meet night landing currency (3/90 or 15hr/90). Dispatcher verification required."
    );
  }

  // --- Special airport recency gate for special fields (Aspen, Eagle) ---
  let specialOkay = true;
  if (trip.special) {
    specialOkay = meetsSpecialCurrency(trip.special, pic, sic);
    if (!specialOkay) {
      alerts.push(
        `Special airport ${trip.special} currency needs review (one or both crew may be stale).`
      );
    }
  }

  // --- Fatigue sanity (soft flag, not legal rest logic) ---
  const fatigueFlag = fatigueRisk(pic) || fatigueRisk(sic);
  if (fatigueFlag) {
    alerts.push("One pilot is trending high on recent duty. Confirm fatigue / rest.");
  }

  return {
    nightCurrencyOkay: picNightOkay,
    specialAirportOkay: specialOkay,
    fatigueOkay: !fatigueFlag,
    alerts
  };
}

// --- Helpers ---

function meetsNightCurrency(pilot) {
  const landings = pilot.nightLandings90 ?? 0;
  const nightHrs = pilot.nightHours90 ?? 0;
  return landings >= 3 || nightHrs >= 15;
}

function meetsSpecialCurrency(fieldName, pic, sic) {
  // Example policy: at least one pilot <=60 days since last into that field.
  const picDays = pic.specialCurrency?.[fieldName];
  const sicDays = sic.specialCurrency?.[fieldName];

  const within60 = (days) => days !== undefined && days <= 60;

  return within60(picDays) || within60(sicDays);
}

function fatigueRisk(pilot) {
  // Simple heuristic for now:
  // If pilot has worked 10+ duty days in last 14, raise eyebrown.
  return (pilot.totalDuty14 ?? 0) >= 10;
}
