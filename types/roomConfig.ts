/**
 * Room ID Configuration Types
 *
 * Room ID Format: BC-<AUD>-<MOD>-<FOC>
 * Total length: 14 characters (fixed)
 */

// Audience/Persona codes (3 chars)
export type AudienceCode = 'PTP' | 'INT' | 'USA' | 'INS';

// Module codes (3 chars) - bitmask style
export type ModuleCode =
  | 'A00'  // About only
  | 'A10'  // About + Open-Ended Funds
  | 'A20'  // About + NextTech
  | 'A30'  // About + Open-Ended + NextTech
  | 'A40'  // About + Golden Visa
  | 'A50'  // About + Golden Visa + NextTech
  | 'A60'  // About + Golden Visa + Open-Ended
  | 'A70'; // About + Golden Visa + Open-Ended + NextTech

// Focus codes (3 chars)
export type FocusCode =
  | 'NXT'  // Next Tech Fund I focus
  | 'OPE'  // Open-Ended Funds focus
  | 'AGB'  // Balanced / overview
  | 'FIN'; // Golden Visa focus

export interface RoomIdComponents {
  prefix: 'BC';
  audience: AudienceCode;
  module: ModuleCode;
  focus: FocusCode;
}

export interface RoomConfiguration {
  roomId: string;              // e.g., "BC-PTP-A20-NXT"
  name: string;                // Human-readable name
  description: string;         // What this configuration is for
  components: RoomIdComponents;
  slideSequence: string[];     // Array of slide IDs in order
  defaultLanguage?: 'en-US' | 'pt-BR' | 'en-UK';
  metadata?: {
    targetAudience?: string;
    includesGoldenVisa?: boolean;
    includesNextTech?: boolean;
    includesOpenEnded?: boolean;
    [key: string]: any;
  };
}

export interface RoomConfigurationSet {
  version: string;
  lastUpdated: string;
  configurations: RoomConfiguration[];
}

export interface RoomIdValidationResult {
  isValid: boolean;
  roomId?: string;
  components?: RoomIdComponents;
  errors?: string[];
}
