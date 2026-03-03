const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildGeneralMediaPath,
  buildSlideMediaPath,
} = require('../shared/mediaUploadPath');

test('buildSlideMediaPath follows category/mediaType/slideId_timestamp_name format', () => {
  const path = buildSlideMediaPath({
    category: 'About BlueCrow',
    mediaType: 'images',
    slideId: 'bluecrow start',
    fileName: 'Hero Image.PNG',
    timestamp: 1735689600000,
  });

  assert.equal(
    path,
    'About-BlueCrow/images/bluecrow-start_1735689600000_hero-image.png'
  );
});

test('buildGeneralMediaPath keeps legacy uploads prefix for non-slide uploads', () => {
  const path = buildGeneralMediaPath({
    mediaType: 'videos',
    fileName: 'Intro Clip.MP4',
    timestamp: 1735689600000,
    randomSuffix: 'A B',
  });

  assert.equal(
    path,
    'uploads/videos/2025/01/1735689600000-a-b-intro-clip.mp4'
  );
});
