/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface HistoryState<T> {
  past: T[];
  present: T;
  future: T[];
}

export class UndoRedoManager<T> {
  private past: T[] = [];
  private present: T;
  private future: T[] = [];
  private maxHistory: number;

  constructor(initialState: T, maxHistory: number = 40) {
    this.present = initialState;
    this.maxHistory = maxHistory;
  }

  public get current(): T {
    return this.present;
  }

  public pushState(newState: T): void {
    this.past.push(this.present);
    if (this.past.length > this.maxHistory) {
      this.past.shift();
    }
    this.present = newState;
    this.future = []; // Clear redo stack on new action
  }

  public canUndo(): boolean {
    return this.past.length > 0;
  }

  public canRedo(): boolean {
    return this.future.length > 0;
  }

  public undo(): T | null {
    if (!this.canUndo()) return null;
    const previous = this.past.pop()!;
    this.future.unshift(this.present);
    this.present = previous;
    return this.present;
  }

  public redo(): T | null {
    if (!this.canRedo()) return null;
    const next = this.future.shift()!;
    this.past.push(this.present);
    this.present = next;
    return this.present;
  }

  public reset(newState: T): void {
    this.present = newState;
    this.past = [];
    this.future = [];
  }
}
