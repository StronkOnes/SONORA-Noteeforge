/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { UndoRedoManager } from '../state/UndoRedo.ts';

describe('UndoRedoManager', () => {
  test('handles pushState, undo, and redo correctly', () => {
    const manager = new UndoRedoManager<number[]>([1]);

    expect(manager.canUndo()).toBe(false);
    expect(manager.canRedo()).toBe(false);

    manager.pushState([1, 2]);
    expect(manager.canUndo()).toBe(true);
    expect(manager.current).toEqual([1, 2]);

    manager.pushState([1, 2, 3]);
    expect(manager.current).toEqual([1, 2, 3]);

    const undone1 = manager.undo();
    expect(undone1).toEqual([1, 2]);
    expect(manager.canRedo()).toBe(true);

    const undone2 = manager.undo();
    expect(undone2).toEqual([1]);
    expect(manager.canUndo()).toBe(false);

    const redone = manager.redo();
    expect(redone).toEqual([1, 2]);
  });
});
