const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildKnowledgeBaseBlobPath,
  decodeKnowledgeBaseDocumentId,
  encodeKnowledgeBaseDocumentId,
  isAllowedKnowledgeBaseFile,
  normalizeKnowledgeBaseTag,
  resolveKnowledgeBaseContentType,
} = require('../shared/knowledgeBase');

test('buildKnowledgeBaseBlobPath uses expected prefix and sanitized filename', () => {
  const path = buildKnowledgeBaseBlobPath(
    'golden-visa',
    'Offer Deck Final.PPTX',
    1735689600000
  );
  assert.equal(
    path,
    'knowledge-base/golden-visa/1735689600000_offer-deck-final.pptx'
  );
});

test('knowledge base document id encoding round-trip', () => {
  const originalPath =
    'knowledge-base/about/1735689600000_bluecrow-overview.pdf';
  const id = encodeKnowledgeBaseDocumentId(originalPath);
  assert.equal(decodeKnowledgeBaseDocumentId(id), originalPath);
});

test('isAllowedKnowledgeBaseFile validates extension/content type', () => {
  assert.equal(
    isAllowedKnowledgeBaseFile(
      'nexttech-summary.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ),
    true
  );
  assert.equal(isAllowedKnowledgeBaseFile('notes.txt', 'text/plain'), false);
});

test('normalizeKnowledgeBaseTag + content type resolver', () => {
  assert.equal(normalizeKnowledgeBaseTag('ABOUT'), 'about');
  assert.equal(normalizeKnowledgeBaseTag('invalid-tag'), null);
  assert.equal(
    resolveKnowledgeBaseContentType('presentation.ppt', 'application/octet-stream'),
    'application/vnd.ms-powerpoint'
  );
});
