/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface WaveformPeaks {
  min: Float32Array;
  max: Float32Array;
  rms: Float32Array;
  durationSeconds: number;
  sampleRate: number;
  buckets: number;
}

/**
 * Computes peak and RMS data for rendering waveform efficiently.
 */
export function generateWaveformPeaks(audioBuffer: AudioBuffer, targetBuckets: number = 2000): WaveformPeaks {
  const numChannels = audioBuffer.numberOfChannels;
  const channelData: Float32Array[] = [];
  for (let c = 0; c < numChannels; c++) {
    channelData.push(audioBuffer.getChannelData(c));
  }

  const length = audioBuffer.length;
  const buckets = Math.min(targetBuckets, length);
  const samplesPerBucket = length / buckets;

  const min = new Float32Array(buckets);
  const max = new Float32Array(buckets);
  const rms = new Float32Array(buckets);

  for (let b = 0; b < buckets; b++) {
    const startSample = Math.floor(b * samplesPerBucket);
    const endSample = Math.min(length, Math.floor((b + 1) * samplesPerBucket));

    let bucketMin = 1.0;
    let bucketMax = -1.0;
    let sumSquares = 0;
    let count = 0;

    for (let i = startSample; i < endSample; i++) {
      let mixed = 0;
      for (let c = 0; c < numChannels; c++) {
        mixed += channelData[c][i];
      }
      mixed /= numChannels;

      if (mixed < bucketMin) bucketMin = mixed;
      if (mixed > bucketMax) bucketMax = mixed;
      sumSquares += mixed * mixed;
      count++;
    }

    min[b] = bucketMin === 1.0 ? 0 : bucketMin;
    max[b] = bucketMax === -1.0 ? 0 : bucketMax;
    rms[b] = count > 0 ? Math.sqrt(sumSquares / count) : 0;
  }

  return {
    min,
    max,
    rms,
    durationSeconds: audioBuffer.duration,
    sampleRate: audioBuffer.sampleRate,
    buckets,
  };
}
