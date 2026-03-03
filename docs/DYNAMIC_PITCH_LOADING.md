# Dynamic Pitch Loading

## Overview

The BlueCrow webapp now supports **dynamic pitch loading** based on room configurations. Each room ID automatically loads a customized slide sequence tailored to the specific audience and investment focus.

## How It Works

### 1. Room ID → Configuration Lookup

When a user enters a room ID (e.g., `BC-PTP-A20-NXT`):

1. The room ID is validated against the format
2. The configuration is loaded from [config/roomConfigurations.json](../config/roomConfigurations.json)
3. The `slideSequence` array is retrieved from the configuration

### 2. Slide Sequence → Slide Objects

The slide sequence contains an ordered array of slide IDs:

```json
"slideSequence": [
  "about_bluecrow_overview",
  "about_what_sets_us_apart",
  "next_tech_fund_vision",
  ...
]
```

The system then:
1. Maps each slide ID to its corresponding slide object from [constants.ts](../constants.ts)
2. Creates a custom pitch slide array in the specified order
3. Loads this array into the `activePitchSlides` state

### 3. Pitch Presentation

The pitch presentation uses the `activePitchSlides` array instead of the hardcoded `PITCH_SLIDES`:

- Slide navigation respects the custom sequence
- Progress bar reflects the custom slide count
- Auto-advance works with the custom sequence
- Language switching works with all slides in the sequence

## File Architecture

### Core Files

**[utils/slideMapper.ts](../utils/slideMapper.ts)**
- Maps slide IDs to slide objects
- Provides lookup and validation functions
- Fast Map-based lookups

**[config/roomConfigurations.json](../config/roomConfigurations.json)**
- Stores all room configurations
- Each configuration includes a `slideSequence` array
- Slide IDs must match those in constants.ts

**[App.tsx](../App.tsx)**
- State: `activePitchSlides` - holds the dynamic slide array
- `handleJoinCall()` - loads slides based on room configuration
- All pitch logic uses `activePitchSlides` instead of `PITCH_SLIDES`

## Flow Diagram

```
User enters room ID (BC-PTP-A20-NXT)
         ↓
Lobby validates format
         ↓
User clicks "Join Call"
         ↓
App.handleJoinCall() executes
         ↓
roomConfigService.getConfiguration(roomId)
         ↓
Gets slideSequence: ["about_bluecrow_overview", "next_tech_fund_vision", ...]
         ↓
getSlidesByIds(slideSequence)
         ↓
Maps IDs → Slide objects from ALL_SLIDES
         ↓
setActivePitchSlides(dynamicSlides)
         ↓
Pitch uses custom slide sequence
```

## Configuration Example

```json
{
  "roomId": "BC-PTP-A20-NXT",
  "name": "Portuguese Local - NextTech Focus",
  "slideSequence": [
    "about_bluecrow_overview",
    "about_what_sets_us_apart",
    "about_bluecrow_products_services",
    "next_tech_portugal_tech_ecosystem_1",
    "next_tech_fund_vision",
    "next_tech_investment_policy_target_sectors",
    "next_tech_hands_on_local_champion",
    "next_tech_portfolio_overview",
    "next_tech_sample_portfolio_companies",
    "next_tech_how_safe_is_my_money",
    "next_tech_fund_summary_fees",
    "about_leadership_team"
  ],
  "defaultLanguage": "pt-PT"
}
```

## Adding New Pitch Configurations

### Step 1: Choose Slides

Review available slides in [constants.ts](../constants.ts):

```bash
# View all available slide IDs
grep 'id: "' constants.ts
```

Key slide categories:
- **About**: `about_bluecrow_overview`, `about_what_sets_us_apart`, etc.
- **NextTech**: `next_tech_fund_vision`, `next_tech_portfolio_overview`, etc.
- **Golden Visa**: `golden_visa_overview`, `golden_visa_benefits`, etc.
- **Open-Ended Funds**: `open_ended_funds_overview`, `short_term_fund_*`, `select_fund_*`

### Step 2: Create Configuration

Add a new configuration to [config/roomConfigurations.json](../config/roomConfigurations.json):

```json
{
  "roomId": "BC-XXX-XXX-XXX",
  "name": "Descriptive Name",
  "description": "Who this is for and what it includes",
  "components": {
    "prefix": "BC",
    "audience": "PTP",
    "module": "A20",
    "focus": "NXT"
  },
  "slideSequence": [
    "slide_id_1",
    "slide_id_2",
    "slide_id_3"
  ],
  "defaultLanguage": "pt-PT",
  "metadata": {
    "targetAudience": "Description",
    "includesGoldenVisa": false,
    "includesNextTech": true,
    "includesOpenEnded": false
  }
}
```

### Step 3: Validate

The system automatically validates:
- ✅ Room ID format (via validation utility)
- ✅ Slide IDs exist (console warnings for missing slides)
- ✅ Configuration loads correctly

Check the browser console when joining with the new room ID:
```
[Dynamic Pitch] Loaded 12 slides for room BC-XXX-XXX-XXX: Descriptive Name
```

If you see warnings:
```
[SlideMapper] Slide with ID "invalid_id" not found in ALL_SLIDES
```

Fix the slide ID in the configuration.

## Pre-configured Room IDs

| Room ID | Name | Slides | Target Audience |
|---------|------|--------|-----------------|
| BC-PTP-A20-NXT | Portuguese Local - NextTech Focus | 12 | Portuguese resident, NextTech focus |
| BC-INT-A50-NXT | International - Golden Visa + NextTech | 14 | International, GV + NextTech |
| BC-INT-A40-GV0 | International - Golden Visa Focus | 9 | International, GV process heavy |
| BC-PTP-A10-OEF | Portuguese Local - Open-Ended Funds | 8 | Portuguese, conservative investor |
| BC-INS-A30-MIX | Institutional - Balanced Overview | 13 | Institutional, all products |
| BC-USA-A50-NXT | US Investor - Golden Visa + NextTech | 11 | US investor with IRA mention |

## Fallback Behavior

If a room ID is invalid or has no configuration:

1. **Validation fails** → User cannot join (error shown in Lobby)
2. **Configuration missing** → Falls back to default `PITCH_SLIDES`
3. **Invalid slide IDs** → Skipped (console warning shown)

Console logs help debug:
```
[Dynamic Pitch] No configuration found for room BC-XXX-XXX-XXX, using default PITCH_SLIDES
[SlideMapper] Slide with ID "xyz" not found in ALL_SLIDES
```

## Implementation Details

### App.tsx Changes

**State Management:**
```typescript
const [activePitchSlides, setActivePitchSlides] = useState<Slide[]>(PITCH_SLIDES);
```

**Loading Logic (handleJoinCall):**
```typescript
const roomConfig = roomConfigService.getConfiguration(room);
if (roomConfig && roomConfig.slideSequence && roomConfig.slideSequence.length > 0) {
  const dynamicSlides = getSlidesByIds(roomConfig.slideSequence);
  if (dynamicSlides.length > 0) {
    setActivePitchSlides(dynamicSlides);
    console.log(`[Dynamic Pitch] Loaded ${dynamicSlides.length} slides`);
  } else {
    setActivePitchSlides(PITCH_SLIDES);
  }
} else {
  setActivePitchSlides(PITCH_SLIDES);
}
```

**All References Updated:**
- `PITCH_SLIDES[pitchSlideIndex]` → `activePitchSlides[pitchSlideIndex]`
- `PITCH_SLIDES.length` → `activePitchSlides.length`
- Progress calculation, navigation, language switching all use `activePitchSlides`

### slideMapper.ts Functions

```typescript
// Get single slide
getSlideById(slideId: string): Slide | null

// Get multiple slides (main function for dynamic loading)
getSlidesByIds(slideIds: string[]): Slide[]

// Validate slide IDs exist
validateSlideIds(slideIds: string[]): {
  isValid: boolean;
  missingIds: string[];
  foundIds: string[];
}

// Check if slide exists
slideExists(slideId: string): boolean

// Get all available slide IDs
getAllSlideIds(): string[]
```

## Testing

### Manual Testing

1. **Test valid room ID:**
   - Enter `BC-PTP-A20-NXT`
   - Check console: Should see "Loaded 12 slides"
   - Start pitch and verify slides match configuration

2. **Test different configurations:**
   - Try each pre-configured room ID
   - Verify slide count and content
   - Ensure language defaults work

3. **Test invalid room ID:**
   - Enter `BC-XXX-XXX-XXX`
   - Should show validation error in Lobby

### Console Verification

```javascript
// In browser console after joining:
// Check loaded slides
console.log(activePitchSlides);

// Verify slide count
console.log(activePitchSlides.length);

// Check specific slide
console.log(activePitchSlides[0].id);
```

## Best Practices

### 1. Slide Ordering

- Start with overview slides (`about_bluecrow_overview`)
- Group related content together
- End with team/leadership slides
- Consider narrative flow

### 2. Slide Count

- **Short pitch**: 7-10 slides (15-20 minutes)
- **Standard pitch**: 10-14 slides (20-30 minutes)
- **Comprehensive**: 15-20 slides (30-45 minutes)

### 3. Naming Conventions

- Keep room IDs consistent with the format
- Use descriptive configuration names
- Document target audience clearly

### 4. Testing

- Always test new configurations
- Verify all slide IDs exist
- Check language support for all slides
- Test navigation (next/prev) works correctly

## Troubleshooting

### "Configuration not found"

**Cause**: Room ID exists but has no configuration in JSON

**Solution**: Add configuration to `roomConfigurations.json`

### "Slide with ID not found"

**Cause**: Slide ID in configuration doesn't exist in constants.ts

**Solution**:
1. Check spelling of slide ID
2. Run `grep 'id: "slide_name"' constants.ts` to find correct ID
3. Update configuration with correct ID

### Slides not loading dynamically

**Cause**: Code still using `PITCH_SLIDES` instead of `activePitchSlides`

**Solution**: Check all references in App.tsx have been updated

### Wrong slide count

**Cause**: Configuration has duplicate or invalid slide IDs

**Solution**:
1. Check browser console for warnings
2. Verify slideSequence in configuration
3. Remove duplicates or fix invalid IDs

## Future Enhancements

### Planned Features

1. **Slide Variants**: Multiple versions of same slide for different audiences
2. **Conditional Slides**: Include/exclude based on metadata
3. **Dynamic Content**: Slide content personalization based on user data
4. **A/B Testing**: Test different slide sequences
5. **Analytics**: Track which sequences perform best
6. **Admin Interface**: UI for managing configurations without editing JSON

### Extensibility

The architecture supports future enhancements:

- **Slide metadata**: Add tags, categories, difficulty levels
- **Audience profiling**: Auto-select best pitch based on user profile
- **Real-time updates**: Hot-reload configurations without restart
- **Multi-language content**: Store slide content in JSON instead of constants

---

**Version**: 1.0.0
**Last Updated**: 2025-12-22
**Related Docs**: [ROOM_ID_SYSTEM.md](ROOM_ID_SYSTEM.md)
