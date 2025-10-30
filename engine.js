// engine.js
//
// Recommendation engine + scoring math
// This module generates ranked crew pairings for a trip.
// Output matches the shape expected by the UI (trip.recs[]).

import { runSafetyChecks } from './safety.js';

/**
 * Example pilot object (PIC or SIC candidate):
 * {
 *   name: "Sean Cannon",
 *   short: "SCC",
 *   role: "Standards",            // e.g. Standards, Line, Training, Upgrade
 *   seat: "PIC" | "SIC" | "DUAL", // qualified seats
 *   aircraft: ["G500","G650"],    // typed / released on
 *   specialCurrency: { "ASPEN": 52, "EAGLE": 10 }, // days since last into each special
 *   nightLandings90: 2,           // last 90 days
 *   nightHours90: 14,             // hrs/night last 90
 *   totalDuty14: 8,               // duty days last 14 days
 *   totalWeekends30: 2,           // weekend/holiday usage past 30 days
 *   upgradeTrack: true,           // is this pilot being groomed for upgrade?
 * }
 *
 * Example history (pairing history between two pilots):
 * {
 *   "SCC|JCB": {
 *      lastPairedDaysAgo: 72,
 *      pairCountLast90: 1
 *   },
 *   "CBC|MJC": {
 *      lastPairedDaysAgo: 14,
 *      pairCountLast90: 3
 *   }
 * }
 *
 * dutyStats (fleet-wide norms for fairness math):
 * {
 *   avgDuty14: 6.5,
 *   avgWeekends30: 2.1
 * }
 */


/**
 * Build all eligible PIC/SIC pairings for this trip.
 * This is where we enforce quals, seat, and airframe match.
 */
function buildEligiblePairs(trip, pilots) {
  const { airframe, special } = trip;

  // Who can act as PIC on this jet
  const picPool = pilots.filter(p =>
    (p.seat === 'PIC' || p.seat === 'DUAL') &&
    p.aircraft.includes(airframe)
  );

  // Who can act as SIC on this jet
  const sicPool = pilots.filter(p =>
    (p.seat === 'SIC' || p.seat === 'DUAL') &&
    p.aircraft.includes(airframe)
  );

  const pairs = [];

  for (const pic of picPool) {
    for (const sic of sicPool) {
      // skip same person twice
      if (pic.short === sic.short) continue;

      // OPTIONAL RULE: if special airport, require at least one pilot
      // with recent currency there. We'll still score it, but this
      // affects safety checks, not filtering, so Dispatch can override.
      pairs.push({ pic, sic });
    }
  }

  return pairs;
}


/**
 * Familiarity score:
 * - We WANT variety. So pairs that haven't flown recently score higher.
 * - lastPairedDaysAgo big => better.
 * - pairCountLast90 small => better.
 * Returns 0.0 - 1.0.
 */
function scoreFamiliarity(pic, sic, history) {
  const keyA = `${pic.short}|${sic.short}`;
  const keyB = `${sic.short}|${pic.short}`;
  const rec = history[keyA] || history[keyB] || {
    lastPairedDaysAgo: 90,
    pairCountLast90: 0
  };

  // Normalize "haven't flown together in X days"
  // cap at 90 days for scaling
  const daysFactor = Math.min(rec.lastPairedDaysAgo, 90) / 90; // 0..1

  // Fewer pairings in last 90 = better. If they've flown 0 or 1 time, great.
  // We'll invert count: 0 =>1.0, 3+ => ~0.3
  const pairFactor = rec.pairCountLast90 >= 3
    ? 0.3
    : rec.pairCountLast90 === 2
      ? 0.6
      : 1.0;

  // Blend
  return clamp01(0.6 * daysFactor + 0.4 * pairFactor);
}


/**
 * Rotation / Duty Balance score:
 * - We don't want to hammer someone who's already loaded.
 * - Higher score = more fair spread of workload.
 * We'll compare each pilot's duty vs fleet avg.
 */
function scoreRotationDuty(pic, sic, dutyStats) {
  const { avgDuty14, avgWeekends30 } = dutyStats;

  const picDutyOver = (pic.totalDuty14 ?? 0) - avgDuty14;
  const sicDutyOver = (sic.totalDuty14 ?? 0) - avgDuty14;

  const picWkndOver = (pic.totalWeekends30 ?? 0) - avgWeekends30;
  const sicWkndOver = (sic.totalWeekends30 ?? 0) - avgWeekends30;

  // people who are under or near avg get higher score.
  // We'll map "overuse" to penalties.
  function pilotDutyScore(dutyOver, wkndOver) {
    // If you're <= avg, great (1.0). If you're +4 duty days and +2 weekends, not great.
    const dutyPenalty = dutyOver <= 0 ? 0 : dutyOver / 6;         // 6 days over avg = bad
    const wkndPenalty = wkndOver <= 0 ? 0 : wkndOver / 4;         // 4 wknds over avg = bad
    const raw = 1 - (0.6 * dutyPenalty + 0.4 * wkndPenalty);
    return clamp01(raw);
  }

  const picScore = pilotDutyScore(picDutyOver, picWkndOver);
  const sicScore = pilotDutyScore(sicDutyOver, sicWkndOver);

  // Team score is average
  return clamp01((picScore + sicScore) / 2);
}


/**
 * Special Airport Readiness:
 * - If trip.special is e.g. "ASPEN", check days since each pilot last flew there.
 * - Recent = good. Stale = lower.
 * If trip is not special, score = 1.0 by default.
 */
function scoreSpecialAirport(trip, pic, sic) {
  if (!trip.special) return 1.0;

  const apt = trip.special; // e.g. "ASPEN" or "EAGLE"
  const picDays = pic.specialCurrency?.[apt];
  const sicDays = sic.specialCurrency?.[apt];

  // If neither has data, treat as stale (0.3)
  if (picDays === undefined && sicDays === undefined) {
    return 0.3;
  }

  // We like <=60 days. After ~120 days it's stale.
  function pilotAptScore(days) {
    if (days === undefined) return 0.4;
    if (days <= 30) return 1.0;
    if (days <= 60) return 0.9;
    if (days <= 90) return 0.7;
    if (days <= 120) return 0.5;
    return 0.3;
  }

  const teamScore = average([
    pilotAptScore(picDays),
    pilotAptScore(sicDays)
  ]);

  return clamp01(teamScore);
}


/**
 * Upgrade Development Score:
 * - High if pairing supports mentorship (Standards Captain with upgrade-track FO).
 * - Low if it's two seniors or two juniors with no mentorship benefit.
 */
function scoreUpgrade(pic, sic) {
  // if PIC is Standards / Training and SIC is upgradeTrack => awesome
  const mentorship =
    (pic.role?.toLowerCase().includes('standards') ||
     pic.role?.toLowerCase().includes('training')) &&
    sic.upgradeTrack === true;

  // if SIC is Standards / Training and PIC is upgradeTrack (some depts groom SICs up)
  const reverseMentorship =
    (sic.role?.toLowerCase().includes('standards') ||
     sic.role?.toLowerCase().includes('training')) &&
    pic.upgradeTrack === true;

  if (mentorship || reverseMentorship) return 1.0;

  // if neither is Standards/training, but one is upgradeTrack with a seasoned opposite seat
  const oneUpgrade = (pic.upgradeTrack || sic.upgradeTrack) ? 0.6 : 0.3;
  return oneUpgrade;
}


/**
 * Duty / Fatigue Guard:
 * - A softer safety lens, not hard "legal rest" logic.
 * - If one pilot is way overworked (duty>avg+6 etc), we'll push this score down.
 * - This is similar to rotation but harsher if someone's redlining.
 */
function scoreDutyHealth(pic, sic, dutyStats) {
  const { avgDuty14 } = dutyStats;

  function fatigueScore(p) {
    const over = (p.totalDuty14 ?? 0) - avgDuty14;
    if (over <= 0) return 1.0;
    if (over >= 6) return 0.2;
    // linear drop between 0 and 6
    return clamp01(1.0 - (over / 6) * 0.8); // bottoms at ~0.2
  }

  return average([fatigueScore(pic), fatigueScore(sic)]);
}


/**
 * Final Weighted Score for display ("⭐ Score 82").
 * Returns { totalScore0to100, bars }
 * bars = { familiarity, rotation, special, upgrade, duty }
 */
function buildScoreBundle(trip, pic, sic, history, dutyStats) {
  const familiarity = scoreFamiliarity(pic, sic, history);           // promote cross-pollination
  const rotation    = scoreRotationDuty(pic, sic, dutyStats);        // fairness / utilization
  const special     = scoreSpecialAirport(trip, pic, sic);           // special airport recency
  const upgrade     = scoreUpgrade(pic, sic);                        // mentorship / upgrade dev
  const duty        = scoreDutyHealth(pic, sic, dutyStats);          // fatigue sanity

  // Weighting for final numeric
  // tweakable by Standards / Chief Pilot later
  const total0to1 =
    0.30 * familiarity +
    0.20 * rotation +
    0.20 * special +
    0.20 * upgrade +
    0.10 * duty;

  return {
    totalScore0to100: Math.round(total0to1 * 100),
    bars: {
      familiarity,
      rotation,
      special,
      upgrade,
      duty
    }
  };
}


/**
 * Build bullet rationale for dispatcher / chief pilot.
 */
function buildBullets(pic, sic, trip, history) {
  const keyA = `${pic.short}|${sic.short}`;
  const keyB = `${sic.short}|${pic.short}`;
  const rec = history[keyA] || history[keyB];

  const bullets = [];

  // Pairing recency
  if (rec?.lastPairedDaysAgo !== undefined) {
    bullets.push(`${rec.lastPairedDaysAgo} days since last pairing`);
  } else {
    bullets.push(`No recent pairing on record (90+ days)`);
  }

  // Standards / upgrade note
  if (pic.role?.toLowerCase().includes('standards') && sic.upgradeTrack) {
    bullets.push(`Standards + Upgrade development`);
  }
  if (sic.role?.toLowerCase().includes('standards') && pic.upgradeTrack) {
    bullets.push(`Standards + Upgrade development`);
  }

  // Special airport note
  if (trip.special) {
    const daysPic = pic.specialCurrency?.[trip.special];
    if (daysPic !== undefined) {
      bullets.push(`${trip.special} recency (PIC): ${daysPic} days`);
    }
    const daysSic = sic.specialCurrency?.[trip.special];
    if (daysSic !== undefined) {
      bullets.push(`${trip.special} recency (SIC): ${daysSic} days`);
    }
  }

  return bullets;
}


/**
 * Public: buildRecommendations(trip, pilots, history, dutyStats)
 * Returns an array of `rec` objects matching what UI expects.
 */
export function buildRecommendations(trip, pilots, history, dutyStats) {
  const rawPairs = buildEligiblePairs(trip, pilots);

  const recs = rawPairs.map(pair => {
    const { pic, sic } = pair;

    // Scores
    const { totalScore0to100, bars } = buildScoreBundle(
      trip,
      pic,
      sic,
      history,
      dutyStats
    );

    // Safety (night currency, fatigue alerts, etc.)
    const safety = runSafetyChecks(trip, pic, sic);

    // Dispatcher-facing bullets
    const bullets = buildBullets(pic, sic, trip, history);

    return {
      score: totalScore0to100,
      pic: `${pic.name} (${pic.short})${pic.role ? ` — ${pic.role}` : ""}`,
      sic: `${sic.name} (${sic.short})${sic.role ? ` — ${sic.role}` : ""}`,
      bars,
      bullets,
      // flags for UI
      nightCurrencyOkay: safety.nightCurrencyOkay,
      safetyAlerts: safety.alerts // <-- we'll surface these with bullets
    };
  });

  // Sort high score first
  recs.sort((a, b) => b.score - a.score);

  // Optionally limit to top N
  return recs.slice(0, 5);
}


/** helpers */
function clamp01(v) {
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}
function average(arr) {
  const valid = arr.filter(v => typeof v === 'number' && !Number.isNaN(v));
  if (!valid.length) return 0;
  return valid.reduce((s, v) => s + v, 0) / valid.length;
}
