// --------------------------------------------------------------
// engine.js
// AutoPilot v3 Recommendation Engine (ES6 Module)
// --------------------------------------------------------------

import { runSafetyChecks } from "./safety.js";

// --------------------------------------------------------------
// buildRecommendations(trip, pilots, pairingHistory, dutyStats)
// --------------------------------------------------------------
// Returns an array of recommended PIC/SIC pairings with scoring,
// safety alerts, and rationale fields.
//
// IMPORTANT:
// - This engine does NOT assign crews. It only produces ranked options.
// - The balancer.js module will consume this list to pick the most
//   workload-balanced crew when Auto-Balance is used.
// --------------------------------------------------------------

export function buildRecommendations(trip, pilots, pairingHistory, dutyStats) {
  if (!trip || !pilots) return [];

  const recs = [];

  for (let pic of pilots) {
    for (let sic of pilots) {
      if (pic.short === sic.short) continue;
      if (pic.airframe !== trip.airframe || sic.airframe !== trip.airframe)
        continue;

      const safety = runSafetyChecks(trip, pic, sic);

      const score = computeScore({
        trip,
        pic,
        sic,
        safety,
        pairingHistory
      });

      recs.push({
        pic: `${pic.name} (${pic.short})`,
        sic: `${sic.name} (${sic.short})`,
        picShort: pic.short,
        sicShort: sic.short,
        safetyAlerts: safety.alerts,
        nightCurrencyOkay: safety.nightCurrencyOkay,
        familiarityScore: score.familiarityScore,
        rotationScore: score.rotationScore,
        airportScore: score.airportScore,
        upgradeScore: score.upgradeScore,
        dutyScore: score.dutyScore,
        totalScore: score.totalScore
      });
    }
  }

  // Highest score first
  recs.sort((a, b) => b.totalScore - a.totalScore);
  return recs;
}

// --------------------------------------------------------------
// computeScore(details)
// --------------------------------------------------------------

function computeScore({ trip, pic, sic, safety, pairingHistory }) {
  const familiarity = calcFamiliarity(pic, sic, pairingHistory);
  const rotation = calcRotationBalance(pic, sic);
  const airport = calcSpecialAirportBoost(trip, pic, sic);
  const upgrade = calcUpgradePairing(pic, sic);
  const duty = calcDutyDistribution(pic, sic);

  // Safety penalties
  let safetyPenalty = 0;
  if (safety.alerts.length > 0) safetyPenalty -= 6;
  if (!safety.nightCurrencyOkay) safetyPenalty -= 3;

  const total =
    familiarity +
    rotation +
    airport +
    upgrade +
    duty +
    safetyPenalty;

  return {
    familiarityScore: familiarity,
    rotationScore: rotation,
    airportScore: airport,
    upgradeScore: upgrade,
    dutyScore: duty,
    totalScore: total
  };
}

// --------------------------------------------------------------
// Familiarity scoring
// --------------------------------------------------------------

function calcFamiliarity(pic, sic, pairingHistory) {
  const key = `${pic.short}-${sic.short}`;
  const past = pairingHistory[key] || 0;

  if (past === 0) return 10;
  if (past === 1) return 6;
  if (past <= 3) return 2;
  return -3;
}

// --------------------------------------------------------------
// Rotation scoring (simple even-rotation bonus)
// --------------------------------------------------------------

function calcRotationBalance(pic, sic) {
  return 5;
}

// --------------------------------------------------------------
// Special Airport scoring (e.g., KASE / KEGE)
// --------------------------------------------------------------

function calcSpecialAirportBoost(trip, pic, sic) {
  if (!trip.special) return 0;

  const experiencedPIC = pic.specialAirports?.includes(trip.special);
  const experiencedSIC = sic.specialAirports?.includes(trip.special);

  if (experiencedPIC && experiencedSIC) return 10;
  if (experiencedPIC || experiencedSIC) return 5;
  return -10;
}

// --------------------------------------------------------------
// Upgrade scoring (pair senior PIC with upgrade-track SIC)
// --------------------------------------------------------------

function calcUpgradePairing(pic, sic) {
  if (sic.upgradeTrack === true && pic.seniority > sic.seniority)
    return 6;
  return 0;
}

// --------------------------------------------------------------
// Duty distribution scoring (optional simple placeholder)
// --------------------------------------------------------------

function calcDutyDistribution(pic, sic) {
  return 2; // stub, later replaced with real duty stats
}

