/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface TempoEstimationResult {
  bpm: number;
  confidence: number;
  alternativeBpms: Array<{ bpm: number; score: number }>;
}

/**
 * Estimates tempo from onset novelty curve using autocorrelation.
 */
export function estimateTempo(
  onsetEnvelope: Float32Array,
  timePerFrame: number,
  minBpm: number = 65,
  maxBpm: number = 190
): TempoEstimationResult {
  if (onsetEnvelope.length < 30 || timePerFrame <= 0) {
    return { bpm: 120, confidence: 0.5, alternativeBpms: [] };
  }

  const fps = 1 / timePerFrame;
  const minLag = Math.floor((60 / maxBpm) * fps);
  const maxLag = Math.ceil((60 / minBpm) * fps);

  const N = onsetEnvelope.length;
  const corr = new Float32Array(maxLag + 1);

  let bestLag = Math.floor((60 / 120) * fps);
  let maxCorr = -1;

  for (let lag = minLag; lag <= maxLag; lag++) {
    let sum = 0;
    let count = 0;
    for (let i = 0; i < N - lag; i++) {
      sum += onsetEnvelope[i] * onsetEnvelope[i + lag];
      count++;
    }
    const val = count > 0 ? sum / count : 0;
    corr[lag] = val;

    if (val > maxCorr) {
      maxCorr = val;
      bestLag = lag;
    }
  }

  const rawBpm = (60 * fps) / bestLag;
  // Round to closest sensible musical BPM
  const roundedBpm = Math.round(rawBpm * 10) / 10;

  // Confidence based on peak distinctness
  let meanCorr = 0;
  for (let lag = minLag; lag <= maxLag; lag++) {
    meanCorr += corr[lag];
  }
  meanCorr /= (maxLag - minLag + 1);
  const peakRatio = meanCorr > 0 ? maxCorr / meanCorr : 1;
  const confidence = Math.min(0.95, Math.max(0.3, (peakRatio - 1) / 3));

  // Alternative tempos (half / double time)
  const alternatives: Array<{ bpm: number; score: number }> = [];
  const halfBpm = Math.round((roundedBpm / 2) * 10) / 10;
  const doubleBpm = Math.round((roundedBpm * 2) * 10) / 10;

  if (halfBpm >= 60) {
    alternatives.push({ bpm: halfBpm, score: confidence * 0.85 });
  }
  if (doubleBpm <= 200) {
    alternatives.push({ bpm: doubleBpm, score: confidence * 0.8 });
  }

  return {
    bpm: roundedBpm,
    confidence: Number(confidence.toFixed(2)),
    alternativeBpms: alternatives,
  };
}
