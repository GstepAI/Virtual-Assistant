# Room ID Configuration System

## Overview

The Room ID system provides a structured, validated way to identify presentation rooms and automatically configure pitch presentations based on audience type, content modules, and focus areas.

## Room ID Format

**Format**: `BC-<AUD>-<MOD>-<FOC>`

- **Fixed Length**: Exactly 14 characters
- **Components**: 4 segments separated by hyphens
- **Case**: Uppercase (automatically formatted)

### Components

#### 1. Prefix (BC)
- **Length**: 2 characters
- **Value**: Always "BC" (BlueCrow)
- **Purpose**: Brand identifier

#### 2. Audience Code (AUD)
- **Length**: 3 characters
- **Valid Values**:
  - `PTP` - Portuguese resident / local investor (no Golden Visa needed)
  - `INT` - International investor (Golden Visa likely relevant)
  - `USA` - US investor (includes IRA/401k notes)
  - `INS` - Institutional / professional investor

#### 3. Module Code (MOD)
- **Length**: 3 characters
- **Valid Values** (bitmask style):
  - `A00` - About only (baseline)
  - `A10` - About + Open-Ended Funds
  - `A20` - About + NextTech
  - `A30` - About + Open-Ended + NextTech
  - `A40` - About + Golden Visa
  - `A50` - About + Golden Visa + NextTech
  - `A60` - About + Golden Visa + Open-Ended
  - `A70` - About + Golden Visa + Open-Ended + NextTech

#### 4. Focus Code (FOC)
- **Length**: 3 characters
- **Valid Values**:
  - `NXT` - Next Tech Fund I focus
  - `OEF` - Open-Ended Funds focus
  - `MIX` - Balanced / overview
  - `GV0` - Golden Visa focus

## Examples

```
BC-PTP-A20-NXT  → Portuguese investor, NextTech pitch, no Golden Visa
BC-INT-A50-NXT  → International, Golden Visa + NextTech
BC-USA-A50-NXT  → US investor, Golden Visa + NextTech + IRA mention
BC-INS-A30-MIX  → Institutional, About + both fund families, no Golden Visa
BC-INT-A40-GV0  → International, Golden Visa focus (process heavy)
BC-PTP-A10-OEF  → Portuguese, Open-Ended Funds only
```

## Configuration File

Room configurations are stored in: `/config/roomConfigurations.json`

### Configuration Structure

```json
{
  "version": "1.0.0",
  "lastUpdated": "2025-12-22",
  "configurations": [
    {
      "roomId": "BC-PTP-A20-NXT",
      "name": "Portuguese Local - NextTech Focus",
      "description": "Portuguese investor, NextTech pitch, no Golden Visa",
      "components": {
        "prefix": "BC",
        "audience": "PTP",
        "module": "A20",
        "focus": "NXT"
      },
      "slideSequence": [
        "about_bluecrow_overview",
        "what_sets_bluecrow_apart",
        "..."
      ],
      "defaultLanguage": "pt-PT",
      "metadata": {
        "targetAudience": "Portuguese resident / local investor",
        "includesGoldenVisa": false,
        "includesNextTech": true,
        "includesOpenEnded": false
      }
    }
  ]
}
```

### Adding New Configurations

1. Open `/config/roomConfigurations.json`
2. Add a new configuration object to the `configurations` array
3. Ensure the `roomId` follows the correct format
4. Define the `slideSequence` with slide IDs from your constants
5. Set the appropriate `defaultLanguage`
6. Update `metadata` to reflect the configuration's features
7. Save the file - changes take effect on next application reload

## Files in the System

### Core Files

1. **[types/roomConfig.ts](../types/roomConfig.ts)**
   - TypeScript type definitions
   - `RoomConfiguration`, `RoomIdComponents`, etc.

2. **[config/roomConfigurations.json](../config/roomConfigurations.json)**
   - JSON configuration data
   - All room ID → pitch mappings

3. **[utils/roomIdValidator.ts](../utils/roomIdValidator.ts)**
   - Room ID validation logic
   - Format checking and error messages

4. **[services/roomConfigService.ts](../services/roomConfigService.ts)**
   - Configuration loading and lookup
   - Service API for accessing room data

### Integration Files

5. **[services/sessionDataService.ts](../services/sessionDataService.ts)**
   - Updated `SessionData` interface
   - Includes room configuration metadata

6. **[components/Lobby.tsx](../components/Lobby.tsx)**
   - Room ID input with real-time validation
   - Auto-suggests language based on configuration

7. **[App.tsx](../App.tsx)**
   - Uses room configuration service
   - Stores configuration data in session

## Validation

### Client-Side Validation

The system performs multi-level validation:

1. **Format Validation** (via `roomIdValidator.ts`)
   - Checks length (must be 14 characters)
   - Validates pattern: `BC-XXX-XXX-XXX`
   - Verifies each component against allowed values

2. **Configuration Validation** (via `roomConfigService.ts`)
   - Checks if a configuration exists for the room ID
   - Returns detailed error messages

### User Experience

- **Real-time feedback**: Validation happens as user types
- **Visual indicators**:
  - Red border + error message for invalid IDs
  - Green "Valid room ID" message for valid IDs
- **Auto-formatting**: Input is converted to uppercase
- **Language auto-select**: Default language is set based on configuration

## Using the Service

### Basic Usage

```typescript
import { roomConfigService } from './services/roomConfigService';
import { validateRoomId } from './utils/roomIdValidator';

// Validate a room ID
const validation = validateRoomId('BC-PTP-A20-NXT');
if (validation.isValid) {
  console.log('Valid!', validation.components);
}

// Get configuration
const config = roomConfigService.getConfiguration('BC-PTP-A20-NXT');
if (config) {
  console.log('Slides:', config.slideSequence);
  console.log('Language:', config.defaultLanguage);
}

// Validate and get config in one step
const result = roomConfigService.validateAndGetConfig('BC-INT-A50-NXT');
if (result.isValid) {
  console.log('Config:', result.configuration);
}
```

### Service Methods

```typescript
// Get a specific configuration
roomConfigService.getConfiguration(roomId: string): RoomConfiguration | null

// Check if configuration exists
roomConfigService.hasConfiguration(roomId: string): boolean

// Get all configurations
roomConfigService.getAllConfigurations(): RoomConfiguration[]

// Validate and get configuration
roomConfigService.validateAndGetConfig(roomId: string): {
  isValid: boolean;
  configuration?: RoomConfiguration;
  errors?: string[];
}

// Get slide sequence for a room
roomConfigService.getSlideSequence(roomId: string): string[] | null

// Get default language
roomConfigService.getDefaultLanguage(roomId: string): Language | null

// Filter by audience/module/focus
roomConfigService.getConfigurationsByAudience(code: string): RoomConfiguration[]
roomConfigService.getConfigurationsByModule(code: string): RoomConfiguration[]
roomConfigService.getConfigurationsByFocus(code: string): RoomConfiguration[]

// Get feature flags
roomConfigService.checkFeatures(roomId: string): {
  includesGoldenVisa: boolean;
  includesNextTech: boolean;
  includesOpenEnded: boolean;
} | null

// Get room summaries for display
roomConfigService.getRoomIdSummaries(): Array<{
  roomId: string;
  name: string;
  description: string;
}>
```

## Future Enhancements

### Phase 1: Format & Validation ✅ (Current)
- Room ID format specification
- Validation utilities
- JSON configuration storage
- Client-side validation in Lobby

### Phase 2: Dynamic Pitch Loading (Future)
When you're ready to make pitch presentations dynamic:

1. Update pitch loading logic in `App.tsx`
2. Load slides based on `config.slideSequence`
3. Map slide IDs to actual slide objects from constants
4. Consider moving slide data to JSON for full dynamic control

### Phase 3: Enhanced Features (Future)
- Admin interface for managing configurations
- Configuration versioning and A/B testing
- Analytics by room configuration type
- Dynamic slide content based on configuration metadata

## Session Data

When a user joins a call, the following room data is captured:

```typescript
interface SessionData {
  userName: string;
  userEmail: string;
  roomId: string;                    // e.g., "BC-PTP-A20-NXT"
  roomIdComponents?: RoomIdComponents; // Parsed components
  roomConfigName?: string;            // e.g., "Portuguese Local - NextTech Focus"
  language: Language;
  callDuration: number;
  chatHistory: ChatMessage[];
  timestamp: string;
}
```

This data is sent to your Azure Function App for analytics and tracking.

## Troubleshooting

### "Room ID format is invalid"
- Ensure ID is exactly 14 characters
- Format must be: `BC-XXX-XXX-XXX`
- All letters must be uppercase

### "Invalid audience code"
- Valid codes: PTP, INT, USA, INS
- Check for typos

### "Invalid module code"
- Valid codes: A00, A10, A20, A30, A40, A50, A60, A70
- Must start with 'A' followed by two digits

### "Invalid focus code"
- Valid codes: NXT, OEF, MIX, GV0
- Check for typos

### "Configuration not found"
- The room ID is valid but no configuration exists in the JSON
- Add the configuration to `/config/roomConfigurations.json`

## Best Practices

1. **Use descriptive names**: Make configuration names clear and informative
2. **Keep metadata updated**: Ensure metadata accurately reflects slide content
3. **Version control**: Track changes to `roomConfigurations.json` in git
4. **Test configurations**: Verify each new configuration works correctly
5. **Document custom configs**: Add comments explaining special configurations
6. **Backup before changes**: Keep a backup of working configurations

## Migration Notes

### From Old System
The old system used freeform room IDs (e.g., "Q3-Earnings"). These are no longer valid.

**To migrate**:
1. Identify your common room/pitch combinations
2. Map them to the new structured format
3. Create configurations in the JSON file
4. Communicate new room IDs to users

### Backward Compatibility
If you need to support legacy room IDs temporarily, you could:
1. Add a fallback in the validation logic
2. Map old IDs to new configurations
3. Show a deprecation warning to users

---

**Version**: 1.0.0
**Last Updated**: 2025-12-22
**Author**: BlueCrow Development Team
