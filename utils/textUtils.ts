/**
 * Converts Roman numerals to Arabic numbers
 * @param roman - Roman numeral string (I, II, III, IV, V, etc.)
 * @returns The number representation
 */
function romanToNumber(roman: string): number {
  const romanMap: Record<string, number> = {
    'I': 1, 'V': 5, 'X': 10, 'L': 50, 'C': 100, 'D': 500, 'M': 1000
  };

  let result = 0;
  for (let i = 0; i < roman.length; i++) {
    const current = romanMap[roman[i]];
    const next = romanMap[roman[i + 1]];

    if (next && current < next) {
      result -= current;
    } else {
      result += current;
    }
  }

  return result;
}

/**
 * Removes Roman numerals from text for cleaner TTS output
 * Handles common patterns like "Fund I", "Part II", "Chapter III", etc.
 * @param text - Text that may contain Roman numerals
 * @returns Text with Roman numerals removed
 */
function normalizeRomanNumerals(text: string): string {
  // Match Roman numerals that appear after a space or at word boundaries
  // This regex matches I, II, III, IV, V, VI, VII, VIII, IX, X, etc.
  // It looks for Roman numerals that are:
  // 1. At the end of a word (e.g., "Fund I")
  // 2. Followed by a space, comma, period, or end of string
  const romanPattern = /\b([IVXLCDM]+)\b(?=\s|,|\.|$)/g;

  return text.replace(romanPattern, (match) => {
    // Only remove if it's a valid Roman numeral (1-3999)
    // Check if all characters are valid Roman numeral characters
    if (!/^[IVXLCDM]+$/.test(match)) {
      return match;
    }

    // Check if it looks like a Roman numeral by trying to convert it
    const number = romanToNumber(match);

    // Only remove if result is reasonable (1-3999) and the original was uppercase
    // This avoids removing words that happen to match (like "I" as pronoun)
    if (number > 0 && number <= 3999 && match === match.toUpperCase()) {
      // For single "I" at the end of a phrase, check context
      // If preceded by a capital letter word (like a name), remove it
      const beforeMatch = text.substring(0, text.indexOf(match));
      if (match === 'I' && beforeMatch.length > 0) {
        // Check if the word before ends with a capital letter
        const wordsBeforeMatch = beforeMatch.trim().split(/\s+/);
        const lastWord = wordsBeforeMatch[wordsBeforeMatch.length - 1];
        if (lastWord && /^[A-Z][a-zA-Z]*$/.test(lastWord)) {
          return ''; // Remove the Roman numeral
        }
        // Don't remove standalone "I"
        return match;
      }

      return ''; // Remove the Roman numeral
    }

    return match;
  });
}

/**
 * Strips markdown formatting from text for use with TTS
 * @param text - The text with markdown formatting
 * @returns Plain text without markdown symbols
 */
export function stripMarkdownForTTS(text: string): string {
  let cleanText = text;

  // Remove **bold** markers (both paired and unpaired)
  cleanText = cleanText.replace(/\*\*(.*?)\*\*/g, '$1'); // Remove paired **bold**
  cleanText = cleanText.replace(/\*\*/g, ''); // Remove any remaining unpaired **

  // Remove markdown headers (##, ###, etc.)
  cleanText = cleanText.replace(/^#+\s*/gm, ''); // Remove headers at start of lines

  // Remove numbered list markers (1. , 2. , etc.)
  cleanText = cleanText.replace(/^\d+\.\s+/gm, '');

  // Remove bullet point markers (-, •)
  cleanText = cleanText.replace(/^[-•]\s+/gm, '');

  // Remove other common markdown
  cleanText = cleanText.replace(/\*([^*]+)\*/g, '$1'); // Remove *italic*
  cleanText = cleanText.replace(/_([^_]+)_/g, '$1'); // Remove _italic_
  cleanText = cleanText.replace(/`([^`]+)`/g, '$1'); // Remove `code`
  cleanText = cleanText.replace(/~~([^~]+)~~/g, '$1'); // Remove ~~strikethrough~~

  // Normalize Roman numerals to numbers for better TTS pronunciation
  cleanText = normalizeRomanNumerals(cleanText);

  return cleanText.trim();
}
