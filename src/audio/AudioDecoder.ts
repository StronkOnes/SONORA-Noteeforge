/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

let sharedAudioContext: AudioContext | null = null;

export function getAudioContext(): AudioContext {
  if (!sharedAudioContext) {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    sharedAudioContext = new AudioContextClass();
  }
  if (sharedAudioContext.state === 'suspended') {
    sharedAudioContext.resume().catch(console.error);
  }
  return sharedAudioContext;
}

export async function decodeAudioFile(file: File): Promise<AudioBuffer> {
  const ctx = getAudioContext();
  const arrayBuffer = await file.arrayBuffer();
  try {
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    return audioBuffer;
  } catch (err) {
    throw new Error(`Failed to decode audio "${file.name}": ${(err as Error).message || 'Unsupported format'}`);
  }
}

export async function decodeAudioArrayBuffer(arrayBuffer: ArrayBuffer): Promise<AudioBuffer> {
  const ctx = getAudioContext();
  // Slice buffer because decodeAudioData detaches original ArrayBuffer in some browsers
  const bufferCopy = arrayBuffer.slice(0);
  return await ctx.decodeAudioData(bufferCopy);
}
