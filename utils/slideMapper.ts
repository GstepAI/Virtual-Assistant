/**
 * Slide Mapping Utility
 *
 * Maps slide IDs to actual slide objects from the slides.json file.
 * Used for dynamic pitch loading based on room configurations.
 */

import type { Slide } from '../types';
import slidesData from '../config/slides.json';

// Extract ALL_SLIDES from JSON data
const ALL_SLIDES = slidesData.ALL_SLIDES as Slide[];

/**
 * Creates a Map of slide ID -> Slide object for fast lookups
 */
const slideMap = new Map<string, Slide>();

// Build the slide map on module load
ALL_SLIDES.forEach((slide) => {
  slideMap.set(slide.id, slide);
});

function buildSlideMap(slides: Slide[]): Map<string, Slide> {
  const map = new Map<string, Slide>();
  for (const slide of slides) {
    map.set(slide.id, slide);
  }
  return map;
}


/**
 * Gets multiple slides by their IDs in the specified order
 * @param slideIds Array of slide IDs in the desired order
 * @param sourceSlides Optional custom slide source (used by API-backed content mode)
 * @returns Array of slide objects (skips any IDs that don't exist)
 */
export function getSlidesByIds(
  slideIds: string[],
  sourceSlides?: Slide[]
): Slide[] {
  const slides: Slide[] = [];
  const targetMap = sourceSlides ? buildSlideMap(sourceSlides) : slideMap;

  for (const id of slideIds) {
    const slide = targetMap.get(id);
    if (slide) {
      slides.push(slide);
    } else {
      console.warn(`[SlideMapper] Slide with ID "${id}" not found in ALL_SLIDES`);
    }
  }

  return slides;
}



// Log slide map initialization
console.log(`[SlideMapper] Initialized with ${slideMap.size} slides`);
