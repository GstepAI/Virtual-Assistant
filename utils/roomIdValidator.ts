/**
 * Room ID Validation Utility
 *
 * Validates room IDs against the format: BC-<AUD>-<MOD>-<FOC>
 * Total length: 14 characters (fixed)
 */

import type {
  AudienceCode,
  ModuleCode,
  FocusCode,
  RoomIdComponents,
  RoomIdValidationResult,
} from '../types/roomConfig';

// Valid codes
const VALID_AUDIENCE_CODES: AudienceCode[] = ['PTP', 'INT', 'USA', 'INS'];
const VALID_MODULE_CODES: ModuleCode[] = [
  'A00',
  'A10',
  'A20',
  'A30',
  'A40',
  'A50',
  'A60',
  'A70',
];
const VALID_FOCUS_CODES: FocusCode[] = ['NXT', 'OPE', 'AGB', 'FIN'];

// Room ID format regex: BC-XXX-XXX-XXX (exactly 14 chars)
const ROOM_ID_REGEX = /^BC-[A-Z0-9]{3}-[A-Z0-9]{3}-[A-Z0-9]{3}$/;

/**
 * Validates a room ID and returns detailed validation result
 */
export function validateRoomId(roomId: string): RoomIdValidationResult {
  const errors: string[] = [];

  // Check if room ID is provided
  if (!roomId || roomId.trim() === '') {
    return {
      isValid: false,
      errors: ['Room ID is required'],
    };
  }

  const trimmedId = roomId.trim().toUpperCase();

  // Check length (must be exactly 14 characters)
  if (trimmedId.length !== 14) {
    errors.push(
      `Room ID must be exactly 14 characters long. Got ${trimmedId.length} characters.`
    );
  }

  // Check format using regex
  if (!ROOM_ID_REGEX.test(trimmedId)) {
    errors.push(
      'Room ID format is invalid. Expected format: BC-XXX-XXX-XXX (e.g., BC-PTP-A20-NXT)'
    );
    return {
      isValid: false,
      roomId: trimmedId,
      errors,
    };
  }

  // Parse components
  const parts = trimmedId.split('-');
  const [prefix, audience, module, focus] = parts;

  // Validate prefix
  if (prefix !== 'BC') {
    errors.push(`Room ID Incorrect`);
  }

  // Validate audience code
  if (!VALID_AUDIENCE_CODES.includes(audience as AudienceCode)) {
    errors.push(
      `Room ID Incorrect`
    );
  }

  // Validate module code
  if (!VALID_MODULE_CODES.includes(module as ModuleCode)) {
    errors.push(
      `Room ID Incorrect`
    );
  }

  // Validate focus code
  if (!VALID_FOCUS_CODES.includes(focus as FocusCode)) {
    errors.push(
      `Room ID Incorrect`
    );
  }

  // If there are errors, return invalid
  if (errors.length > 0) {
    return {
      isValid: false,
      roomId: trimmedId,
      errors,
    };
  }

  // All validations passed
  const components: RoomIdComponents = {
    prefix: 'BC',
    audience: audience as AudienceCode,
    module: module as ModuleCode,
    focus: focus as FocusCode,
  };

  return {
    isValid: true,
    roomId: trimmedId,
    components,
  };
}

/**
 * Formats a room ID to uppercase and proper format
 */
export function formatRoomId(input: string): string {
  return input.trim().toUpperCase();
}