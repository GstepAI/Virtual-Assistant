const test = require('node:test');
const assert = require('node:assert/strict');

const { issueUploadToken, verifyUploadToken } = require('../shared/uploadToken');

test('issueUploadToken + verifyUploadToken round-trip', () => {
  const issued = issueUploadToken('uploads/images/2026/sample.png', 'image/png', 60);
  const verified = verifyUploadToken(issued.token);

  assert.equal(verified.valid, true);
  assert.equal(verified.payload.relativePath, 'uploads/images/2026/sample.png');
  assert.equal(verified.payload.contentType, 'image/png');
});

test('issueUploadToken carries optional constraints', () => {
  const issued = issueUploadToken(
    'NextTech-Fund/videos/slide_1_1735689600000_intro.mp4',
    'video/mp4',
    60,
    { maxBytes: 209715200, mediaType: 'videos' }
  );
  const verified = verifyUploadToken(issued.token);

  assert.equal(verified.valid, true);
  assert.equal(verified.payload.maxBytes, 209715200);
  assert.equal(verified.payload.mediaType, 'videos');
});

test('verifyUploadToken rejects malformed token', () => {
  const verified = verifyUploadToken('invalid-token');
  assert.equal(verified.valid, false);
});
