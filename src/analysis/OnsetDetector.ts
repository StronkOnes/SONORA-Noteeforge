/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface OnsetDetectionResult {
  onsetTimes: number[]; // timestamps in seconds
  envelope: Float32Array; // onset novelty curve
  timePerFrame: number;
}

/**
 * Detects musical onsets using spectral flux and energy envelope derivative.
 */
export function detectOnsets(
  channelData: Float32Array,
  sampleRate: number,
  frameSize: number = 1024,
  hopSize: number = 256,
  threshold: number = 0.25
): OnsetDetectionResult {
  const numFrames = Math.floor((channelData.length - frameSize) / hopSize);
  if (numFrames <= 0) {
    return { onsetTimes: [], envelope: new Float32Array(0), timePerFrame: 0 };
  }

  const timePerFrame = hopSize / sampleRate;
  const spectralFlux = new Float32Array(numFrames);
  const prevSpectrum = new Float32Array(frameSize / 2);

  // Hanning window
  const window = new Float32Array(frameSize);
  for (let i = 0; i < frameSize; i++) {
    window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (frameSize - 1)));
  }

  // Real FFT helper
  const cosTable = new Float32Array(frameSize);
  const sinTable = new Float32Array(frameSize);
  for (let i = 0; i < frameSize; i++) {
    cosTable[i] = Math.cos((2 * Math.PI * i) / frameSize);
    sinTable[i] = Math.sin((2 * Math.PI * i) / frameSize);
  }

  let maxFlux = 0;

  for (let f = 0; f < numFrames; f++) {
    const offset = f * hopSize;
    let flux = 0;

    // Estimate spectral energy in frequency bins
    // Using downsampled DFT bins for speed and efficiency
    const half = frameSize / 2;
    for (let k = 1; k < half; k += 2) {
      let real = 0;
      let imag = 0;
      const step = 2;
      for (let n = 0; n < frameSize; n += step) {
        const val = channelData[offset + n] * window[n];
        const angleIdx = (k * n) % frameSize;
        real += val * cosTable[angleIdx];
        imag -= val * sinTable[angleIdx];
      }
      const mag = Math.sqrt(real * real + imag * imag);
      const diff = mag - prevSpectrum[k];
      if (diff > 0) {
        flux += diff;
      }
      prevSpectrum[k] = mag;
    }

    spectralFlux[f] = flux;
    if (flux > maxFlux) maxFlux = flux;
  }

  // Normalize flux
  if (maxFlux > 0) {
    for (let f = 0; f < numFrames; f++) {
      spectralFlux[f] /= maxFlux;
    }
  }

  // Peak picking with moving average adaptive threshold
  const onsetTimes: number[] = [];
  const windowRadius = 4;
  const minInterOnsetInterval = 0.07; // 70ms minimum between notes
  let lastOnsetTime = -1;

  for (let f = windowRadius; f < numFrames - windowRadius; f++) {
    let localMean = 0;
    for (let w = -windowRadius; w <= windowRadius; w++) {
      localMean += spectralFlux[f + w];
    }
    localMean /= (2 * windowRadius + 1);

    const val = spectralFlux[f];
    const adaptiveThreshold = localMean + threshold * 0.4;

    if (
      val > adaptiveThreshold &&
      val > spectralFlux[f - 1] &&
      val >= spectralFlux[f + 1]
    ) {
      const time = f * timePerFrame;
      if (lastOnsetTime < 0 || time - lastOnsetTime >= minInterOnsetInterval) {
        onsetTimes.push(time);
        lastOnsetTime = time;
      }
    }
  }

  return {
    onsetTimes,
    envelope: spectralFlux,
    timePerFrame,
  };
}
