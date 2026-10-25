/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { getAudioContext } from './AudioDecoder.ts';
import { sharedMidiSynth } from './MidiSynth.ts';
import { NoteEvent } from '../music/NoteEvent.ts';

export type PlaybackMonitorMode = 'both' | 'audio' | 'midi';

export class AudioPlaybackEngine {
  private audioBuffer: AudioBuffer | null = null;
  private sourceNode: AudioBufferSourceNode | null = null;
  private audioGainNode: GainNode;

  private isPlaying = false;
  private isLooping = false;
  private loopStart = 0;
  private loopEnd = 0;

  private startCtxTime = 0;
  private startOffsetSeconds = 0;
  private lastPlayheadTime = 0;

  private notes: NoteEvent[] = [];
  private monitorMode: PlaybackMonitorMode = 'both';

  private audioVolume = 0.8;
  private midiVolume = 0.85;
  private isAudioMuted = false;
  private isMidiMuted = false;

  // Set of scheduled note IDs for current loop cycle
  private scheduledInCurrentCycle = new Set<string>();
  private lastLoopCycleIndex = 0;

  private onTimeUpdateCallback?: (time: number) => void;
  private onStateChangeCallback?: (isPlaying: boolean) => void;
  private rafId: number | null = null;
  private schedulerIntervalId: number | null = null;

  constructor() {
    const ctx = getAudioContext();
    this.audioGainNode = ctx.createGain();
    this.audioGainNode.gain.setValueAtTime(this.audioVolume, ctx.currentTime);
    this.audioGainNode.connect(ctx.destination);
    sharedMidiSynth.setVolume(this.midiVolume);
  }

  public setAudioBuffer(buffer: AudioBuffer | null): void {
    this.stop();
    this.audioBuffer = buffer;
  }

  public setNotes(notes: NoteEvent[]): void {
    this.notes = notes;
    // Allow newly added or modified notes to be scheduled
    this.scheduledInCurrentCycle.clear();
  }

  public setLoop(loop: boolean, start: number, end: number): void {
    const prevLoop = this.isLooping;
    this.isLooping = loop;
    this.loopStart = Math.max(0, start);
    this.loopEnd = Math.max(this.loopStart + 0.1, end);

    if (this.sourceNode && this.isPlaying) {
      this.sourceNode.loop = loop;
      this.sourceNode.loopStart = this.loopStart;
      this.sourceNode.loopEnd = this.loopEnd;
    }

    if (prevLoop !== loop) {
      this.scheduledInCurrentCycle.clear();
    }
  }

  public setMonitorMode(mode: PlaybackMonitorMode): void {
    this.monitorMode = mode;
    this.updateGains();
  }

  public setAudioMuted(muted: boolean): void {
    this.isAudioMuted = muted;
    this.updateGains();
  }

  public setMidiMuted(muted: boolean): void {
    this.isMidiMuted = muted;
    if (muted) {
      sharedMidiSynth.stopAll();
    }
    this.updateGains();
  }

  public getAudioMuted(): boolean {
    return this.isAudioMuted || this.monitorMode === 'midi';
  }

  public getMidiMuted(): boolean {
    return this.isMidiMuted || this.monitorMode === 'audio';
  }

  public setVolumes(audioVol: number, midiVol: number): void {
    this.audioVolume = Math.max(0, Math.min(1, audioVol));
    this.midiVolume = Math.max(0, Math.min(1, midiVol));
    this.updateGains();
  }

  private updateGains(): void {
    const ctx = getAudioContext();
    const effectiveAudio =
      this.isAudioMuted || this.monitorMode === 'midi' ? 0 : this.audioVolume;
    const effectiveMidi =
      this.isMidiMuted || this.monitorMode === 'audio' ? 0 : this.midiVolume;

    this.audioGainNode.gain.setTargetAtTime(effectiveAudio, ctx.currentTime, 0.015);
    sharedMidiSynth.setVolume(effectiveMidi);
  }

  public onTimeUpdate(cb: (time: number) => void): void {
    this.onTimeUpdateCallback = cb;
  }

  public onStateChange(cb: (isPlaying: boolean) => void): void {
    this.onStateChangeCallback = cb;
  }

  public getCurrentPlayheadTime(): number {
    if (!this.isPlaying) return this.startOffsetSeconds;
    const ctx = getAudioContext();
    const elapsed = ctx.currentTime - this.startCtxTime;
    let pos = this.startOffsetSeconds + elapsed;

    if (this.isLooping && this.loopEnd > this.loopStart) {
      const loopLen = this.loopEnd - this.loopStart;
      if (pos >= this.loopEnd) {
        const over = (pos - this.loopStart) % loopLen;
        pos = this.loopStart + over;
      }
    } else if (this.audioBuffer && pos >= this.audioBuffer.duration) {
      return this.audioBuffer.duration;
    }

    return pos;
  }

  public play(startOffset?: number): void {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') {
      ctx.resume().catch(console.error);
    }

    this.stopAudioNodes();

    let offset = startOffset !== undefined ? startOffset : this.startOffsetSeconds;
    if (this.isLooping && (offset < this.loopStart || offset >= this.loopEnd)) {
      offset = this.loopStart;
    }
    if (this.audioBuffer && offset >= this.audioBuffer.duration) {
      offset = 0;
    }

    this.startOffsetSeconds = offset;
    this.lastPlayheadTime = offset;
    this.startCtxTime = ctx.currentTime;
    this.isPlaying = true;
    this.scheduledInCurrentCycle.clear();
    this.lastLoopCycleIndex = 0;

    // Start AudioBuffer playback if available
    if (this.audioBuffer) {
      const src = ctx.createBufferSource();
      src.buffer = this.audioBuffer;
      src.connect(this.audioGainNode);

      if (this.isLooping) {
        src.loop = true;
        src.loopStart = this.loopStart;
        src.loopEnd = this.loopEnd;
      }

      src.onended = () => {
        if (!this.isLooping && this.isPlaying) {
          this.stop();
        }
      };

      src.start(0, offset);
      this.sourceNode = src;
    }

    this.updateGains();

    // Start lookahead scheduling and animation loop
    this.startScheduler();
    this.startRaf();
    this.onStateChangeCallback?.(true);
  }

  public pause(): void {
    const current = this.getCurrentPlayheadTime();
    this.stopAudioNodes();
    this.startOffsetSeconds = current;
    this.isPlaying = false;
    this.stopScheduler();
    this.stopRaf();
    this.onStateChangeCallback?.(false);
  }

  public stop(): void {
    this.stopAudioNodes();
    this.isPlaying = false;
    this.startOffsetSeconds = this.isLooping ? this.loopStart : 0;
    this.stopScheduler();
    this.stopRaf();
    this.onTimeUpdateCallback?.(this.startOffsetSeconds);
    this.onStateChangeCallback?.(false);
  }

  public seek(timeSeconds: number): void {
    const wasPlaying = this.isPlaying;
    this.pause();
    this.startOffsetSeconds = Math.max(0, timeSeconds);
    this.onTimeUpdateCallback?.(this.startOffsetSeconds);
    if (wasPlaying) {
      this.play(this.startOffsetSeconds);
    }
  }

  /**
   * Lookahead scheduler: schedules upcoming notes in the next 0.15s window
   */
  private scheduleUpcomingMidi(): void {
    if (!this.isPlaying || this.getMidiMuted() || this.notes.length === 0) {
      return;
    }

    const ctx = getAudioContext();
    const currentPlayhead = this.getCurrentPlayheadTime();
    const lookaheadSec = 0.18; // 180ms lookahead

    // Check if loop has wrapped around
    if (this.isLooping) {
      const loopLen = this.loopEnd - this.loopStart;
      if (loopLen > 0) {
        const elapsed = ctx.currentTime - this.startCtxTime;
        const totalPos = this.startOffsetSeconds + elapsed;
        const cycleIndex = Math.floor((totalPos - this.loopStart) / loopLen);
        if (cycleIndex !== this.lastLoopCycleIndex) {
          // New cycle started: clear cycle note cache
          this.lastLoopCycleIndex = cycleIndex;
          this.scheduledInCurrentCycle.clear();
        }
      }
    }

    // Schedule any notes that begin within [currentPlayhead, currentPlayhead + lookaheadSec]
    for (const note of this.notes) {
      const noteStart = note.startSeconds;
      const noteEnd = note.startSeconds + note.durationSeconds;

      // Check if note is upcoming
      const deltaToStart = noteStart - currentPlayhead;

      if (deltaToStart >= -0.02 && deltaToStart <= lookaheadSec) {
        const cycleKey = `${note.id}_${this.lastLoopCycleIndex}`;
        if (!this.scheduledInCurrentCycle.has(cycleKey)) {
          this.scheduledInCurrentCycle.add(cycleKey);

          const triggerCtxTime = ctx.currentTime + Math.max(0, deltaToStart);
          const duration = Math.max(0.04, note.durationSeconds);

          sharedMidiSynth.triggerNote(
            note.pitch,
            note.velocity,
            duration,
            triggerCtxTime,
            `seq_${note.id}`
          );
        }
      } else if (
        // Playhead jumped right into the middle of a sounding note
        currentPlayhead >= noteStart &&
        currentPlayhead < noteEnd &&
        !this.scheduledInCurrentCycle.has(`${note.id}_${this.lastLoopCycleIndex}`)
      ) {
        const cycleKey = `${note.id}_${this.lastLoopCycleIndex}`;
        this.scheduledInCurrentCycle.add(cycleKey);
        const remainingDur = noteEnd - currentPlayhead;
        sharedMidiSynth.triggerNote(
          note.pitch,
          note.velocity,
          remainingDur,
          ctx.currentTime,
          `seq_${note.id}`
        );
      }
    }

    this.lastPlayheadTime = currentPlayhead;
  }

  private startScheduler(): void {
    this.stopScheduler();
    // Run lookahead check every 25ms
    this.schedulerIntervalId = window.setInterval(() => {
      this.scheduleUpcomingMidi();
    }, 25);
  }

  private stopScheduler(): void {
    if (this.schedulerIntervalId !== null) {
      clearInterval(this.schedulerIntervalId);
      this.schedulerIntervalId = null;
    }
  }

  private stopAudioNodes(): void {
    sharedMidiSynth.stopAll();
    this.scheduledInCurrentCycle.clear();
    if (this.sourceNode) {
      try {
        this.sourceNode.stop();
        this.sourceNode.disconnect();
      } catch {
        // already stopped
      }
      this.sourceNode = null;
    }
  }

  private startRaf(): void {
    this.stopRaf();
    const tick = () => {
      if (!this.isPlaying) return;
      const current = this.getCurrentPlayheadTime();
      this.onTimeUpdateCallback?.(current);
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  private stopRaf(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }
}

export const sharedAudioPlayback = new AudioPlaybackEngine();
