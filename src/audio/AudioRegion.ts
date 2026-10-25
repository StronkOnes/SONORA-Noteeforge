/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { getAudioContext } from './AudioDecoder.ts';

export interface ExtractedRegion {
  buffer: AudioBuffer;
  startSample: number;
  endSample: number;
  startSeconds: number;
  endSeconds: number;
  durationSeconds: number;
  sampleRate: number;
}

/**
 * Extracts a region from an AudioBuffer cleanly without modifying the original.
 */
export function extractAudioRegion(
  source: AudioBuffer,
  startSeconds: number,
  endSeconds: number
): ExtractedRegion {
  const sampleRate = source.sampleRate;
  const startClamped = Math.max(0, Math.min(startSeconds, source.duration));
  const endClamped = Math.max(startClamped + 0.05, Math.min(endSeconds, source.duration));

  const startSample = Math.floor(startClamped * sampleRate);
  const endSample = Math.min(source.length, Math.ceil(endClamped * sampleRate));
  const lengthSamples = Math.max(1, endSample - startSample);

  const ctx = getAudioContext();
  const regionBuffer = ctx.createBuffer(
    source.numberOfChannels,
    lengthSamples,
    sampleRate
  );

  for (let c = 0; c < source.numberOfChannels; c++) {
    const srcChannel = source.getChannelData(c);
    const destChannel = regionBuffer.getChannelData(c);
    destChannel.set(srcChannel.subarray(startSample, endSample));
  }

  return {
    buffer: regionBuffer,
    startSample,
    endSample,
    startSeconds: startClamped,
    endSeconds: endClamped,
    durationSeconds: endClamped - startClamped,
    sampleRate,
  };
}
