import { z } from "zod";
import type { EnduranceMetrics, Split } from "./metrics.js";

export const GpsPointSchema = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  /** Horodatage en millisecondes (epoch). */
  t: z.number().int().nonnegative(),
  altitudeM: z.number().optional(),
  /** Précision horizontale annoncée par le capteur (mètres). */
  accuracyM: z.number().nonnegative().optional(),
});
export type GpsPoint = z.infer<typeof GpsPointSchema>;

export interface GpsOptions {
  /** Points moins précis que ce seuil ignorés (m). */
  maxAccuracyM: number;
  /** Vitesse au-delà de laquelle un saut est considéré comme une erreur GPS (km/h). */
  maxSpeedKmh: number;
  /** Écart de temps au-delà duquel le segment est considéré comme une pause (s). */
  pauseGapSec: number;
  /** Vitesse en dessous de laquelle on considère l'athlète à l'arrêt (km/h). */
  stoppedSpeedKmh: number;
  /** Hystérésis pour le dénivelé : ignore le bruit d'altitude inférieur à ce seuil (m). */
  elevationThresholdM: number;
}

export const GPS_PRESETS: Record<"running" | "walking" | "cycling" | "hiking", GpsOptions> = {
  running: { maxAccuracyM: 25, maxSpeedKmh: 30, pauseGapSec: 20, stoppedSpeedKmh: 2, elevationThresholdM: 3 },
  walking: { maxAccuracyM: 25, maxSpeedKmh: 12, pauseGapSec: 30, stoppedSpeedKmh: 1, elevationThresholdM: 3 },
  hiking: { maxAccuracyM: 30, maxSpeedKmh: 12, pauseGapSec: 60, stoppedSpeedKmh: 0.8, elevationThresholdM: 4 },
  cycling: { maxAccuracyM: 25, maxSpeedKmh: 90, pauseGapSec: 15, stoppedSpeedKmh: 3, elevationThresholdM: 3 },
};

const R = 6_371_000;
const rad = (d: number) => (d * Math.PI) / 180;

/** Distance orthodromique (formule de haversine), en mètres. */
export function haversineM(a: Pick<GpsPoint, "lat" | "lon">, b: Pick<GpsPoint, "lat" | "lon">): number {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export interface GpsSummary {
  metrics: EnduranceMetrics;
  pointsUsed: number;
  pointsRejected: number;
}

/**
 * Convertit une trace GPS en métriques d'endurance.
 * - Points imprécis et sauts aberrants écartés (jamais « lissés » par invention de points).
 * - Le dénivelé n'est calculé que si les points portent une altitude.
 * - Les splits au km sont bornés par interpolation linéaire ENTRE deux points mesurés
 *   consécutifs ; aucun split n'est produit au-delà du dernier point réel.
 */
export function summarizeTrack(raw: GpsPoint[], opts: GpsOptions = GPS_PRESETS.running): GpsSummary | null {
  const sorted = raw.map((p) => GpsPointSchema.parse(p)).sort((a, b) => a.t - b.t);
  const accurate = sorted.filter((p) => p.accuracyM === undefined || p.accuracyM <= opts.maxAccuracyM);
  const pts: GpsPoint[] = [];
  for (const p of accurate) {
    const prev = pts[pts.length - 1];
    if (prev) {
      const dt = (p.t - prev.t) / 1000;
      if (dt <= 0) continue;
      const kmh = (haversineM(prev, p) / dt) * 3.6;
      if (kmh > opts.maxSpeedKmh) continue; // saut GPS
    }
    pts.push(p);
  }
  if (pts.length < 2) return null;

  let distance = 0;
  let moving = 0;
  let maxKmh = 0;
  let gain = 0;
  let loss = 0;
  let refAlt = pts[0]!.altitudeM;
  const hasAltitude = pts.every((p) => p.altitudeM !== undefined);

  const splits: Split[] = [];
  let splitStartT = pts[0]!.t;
  let splitDist = 0;
  let splitGain = 0;
  let splitLoss = 0;

  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const dt = (b.t - a.t) / 1000;
    const d = haversineM(a, b);
    const kmh = (d / dt) * 3.6;
    const isPause = dt > opts.pauseGapSec || kmh < opts.stoppedSpeedKmh;
    if (!isPause) {
      moving += dt;
      // Vitesse max sur des segments d'au moins 3 s pour limiter le bruit instantané.
      if (dt >= 3) maxKmh = Math.max(maxKmh, kmh);
    }
    if (hasAltitude && refAlt !== undefined) {
      const delta = b.altitudeM! - refAlt;
      if (Math.abs(delta) >= opts.elevationThresholdM) {
        if (delta > 0) {
          gain += delta;
          splitGain += delta;
        } else {
          loss -= delta;
          splitLoss -= delta;
        }
        refAlt = b.altitudeM!;
      }
    }
    // Découpage au km, bornes interpolées sur le segment [a, b].
    let remaining = d;
    let segStartT = a.t;
    while (splitDist + remaining >= 1000) {
      const need = 1000 - splitDist;
      const frac = need / remaining;
      const boundaryT = segStartT + frac * (b.t - segStartT);
      splits.push({
        index: splits.length + 1,
        distanceM: 1000,
        durationSec: Math.round((boundaryT - splitStartT) / 100) / 10,
        ...(hasAltitude ? { elevationGainM: Math.round(splitGain), elevationLossM: Math.round(splitLoss) } : {}),
      });
      remaining -= need;
      segStartT = boundaryT;
      splitStartT = boundaryT;
      splitDist = 0;
      splitGain = 0;
      splitLoss = 0;
    }
    splitDist += remaining;
    distance += d;
  }

  const last = pts[pts.length - 1]!;
  if (splitDist >= 50) {
    splits.push({
      index: splits.length + 1,
      distanceM: Math.round(splitDist),
      durationSec: Math.round((last.t - splitStartT) / 100) / 10,
      ...(hasAltitude ? { elevationGainM: Math.round(splitGain), elevationLossM: Math.round(splitLoss) } : {}),
    });
  }

  const durationSec = Math.max(1, Math.round((last.t - pts[0]!.t) / 1000));
  const movingTimeSec = Math.max(1, Math.min(durationSec, Math.round(moving)));
  const metrics: EnduranceMetrics = {
    model: "endurance",
    durationSec,
    movingTimeSec,
    distanceM: Math.round(distance),
    avgSpeedKmh: Math.round((distance / 1000 / (movingTimeSec / 3600)) * 10) / 10,
    ...(maxKmh > 0 ? { maxSpeedKmh: Math.round(maxKmh * 10) / 10 } : {}),
    ...(hasAltitude ? { elevationGainM: Math.round(gain), elevationLossM: Math.round(loss) } : {}),
    splits,
    source: "gps",
  };
  if (metrics.maxSpeedKmh !== undefined && metrics.avgSpeedKmh !== undefined && metrics.maxSpeedKmh < metrics.avgSpeedKmh) delete metrics.maxSpeedKmh;
  return { metrics, pointsUsed: pts.length, pointsRejected: raw.length - pts.length };
}
