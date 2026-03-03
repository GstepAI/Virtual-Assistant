const test = require('node:test');
const assert = require('node:assert/strict');

const { validateRoomSequences } = require('../shared/contentStore');

test('validateRoomSequences returns missing references', () => {
  const rooms = [
    { roomId: 'ROOM-A', slideSequence: ['slide-1', 'slide-2'] },
    { roomId: 'ROOM-B', slideSequence: ['slide-2', 'slide-3'] },
  ];
  const slides = [{ id: 'slide-1' }, { id: 'slide-2' }];

  const result = validateRoomSequences(rooms, slides);
  assert.deepEqual(result, ['ROOM-B:slide-3']);
});

test('validateRoomSequences passes when all slide ids exist', () => {
  const rooms = [{ roomId: 'ROOM-A', slideSequence: ['slide-1'] }];
  const slides = [{ id: 'slide-1' }];

  const result = validateRoomSequences(rooms, slides);
  assert.deepEqual(result, []);
});
