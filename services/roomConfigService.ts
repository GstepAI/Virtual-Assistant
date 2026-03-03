/**
 * Room Configuration Service
 *
 * Loads and manages room configurations from JSON
 * Provides lookup and validation services
 */

import type {
  RoomConfiguration,
  RoomConfigurationSet,
  RoomIdComponents,
} from '../types/roomConfig';
import { validateRoomId } from '../utils/roomIdValidator';
import roomConfigData from '../config/roomConfigurations.json';

class RoomConfigService {
  private configurations: Map<string, RoomConfiguration> = new Map();
  private configSet: RoomConfigurationSet;

  constructor() {
    this.configSet = roomConfigData as RoomConfigurationSet;
    this.loadConfigurations();
  }

  /**
   * Loads all configurations into memory
   */
  private loadConfigurations(): void {
    this.configurations.clear();
    for (const config of this.configSet.configurations) {
      this.configurations.set(config.roomId, config);
    }
    console.log(
      `[RoomConfigService] Loaded ${this.configurations.size} room configurations`
    );
  }

  /**
   * Gets configuration for a specific room ID
   */
  getConfiguration(roomId: string): RoomConfiguration | null {
    const formattedId = roomId.trim().toUpperCase();
    return this.configurations.get(formattedId) || null;
  }

  /**
   * Checks if a room ID has a configuration
   */
  hasConfiguration(roomId: string): boolean {
    const formattedId = roomId.trim().toUpperCase();
    return this.configurations.has(formattedId);
  }

  /**
   * Gets all available room configurations
   */
  getAllConfigurations(): RoomConfiguration[] {
    return Array.from(this.configurations.values());
  }

  /**
   * Gets configuration metadata
   */
  getConfigurationMetadata(): {
    version: string;
    lastUpdated: string;
    count: number;
  } {
    return {
      version: this.configSet.version,
      lastUpdated: this.configSet.lastUpdated,
      count: this.configurations.size,
    };
  }

  /**
   * Validates a room ID and returns configuration if valid
   */
  validateAndGetConfig(roomId: string): {
    isValid: boolean;
    configuration?: RoomConfiguration;
    errors?: string[];
  } {
    // First validate the format
    const validation = validateRoomId(roomId);

    if (!validation.isValid) {
      return {
        isValid: false,
        errors: validation.errors,
      };
    }

    // Check if configuration exists
    const config = this.getConfiguration(roomId);

    if (!config) {
      return {
        isValid: false,
        errors: [
          `Room ID "${validation.roomId}" is valid but no configuration exists for it.`,
        ],
      };
    }

    return {
      isValid: true,
      configuration: config,
    };
  }

  /**
   * Finds configurations by audience code
   */
  getConfigurationsByAudience(
    audienceCode: string
  ): RoomConfiguration[] {
    return this.getAllConfigurations().filter(
      (config) => config.components.audience === audienceCode
    );
  }

  /**
   * Finds configurations by module code
   */
  getConfigurationsByModule(moduleCode: string): RoomConfiguration[] {
    return this.getAllConfigurations().filter(
      (config) => config.components.module === moduleCode
    );
  }

  /**
   * Finds configurations by focus code
   */
  getConfigurationsByFocus(focusCode: string): RoomConfiguration[] {
    return this.getAllConfigurations().filter(
      (config) => config.components.focus === focusCode
    );
  }

  /**
   * Gets slide sequence for a room ID
   */
  getSlideSequence(roomId: string): string[] | null {
    const config = this.getConfiguration(roomId);
    return config ? config.slideSequence : null;
  }

  /**
   * Gets default language for a room ID
   */
  getDefaultLanguage(
    roomId: string
  ): 'en-US' | 'pt-BR' | 'en-UK' | null {
    const config = this.getConfiguration(roomId);
    return config?.defaultLanguage || null;
  }

  /**
   * Checks if a room configuration includes specific features
   */
  checkFeatures(roomId: string): {
    includesGoldenVisa: boolean;
    includesNextTech: boolean;
    includesOpenEnded: boolean;
  } | null {
    const config = this.getConfiguration(roomId);
    if (!config || !config.metadata) {
      return null;
    }

    return {
      includesGoldenVisa: config.metadata.includesGoldenVisa || false,
      includesNextTech: config.metadata.includesNextTech || false,
      includesOpenEnded: config.metadata.includesOpenEnded || false,
    };
  }

  /**
   * Gets a summary of all room IDs for display/selection
   */
  getRoomIdSummaries(): Array<{
    roomId: string;
    name: string;
    description: string;
  }> {
    return this.getAllConfigurations().map((config) => ({
      roomId: config.roomId,
      name: config.name,
      description: config.description,
    }));
  }
}

// Export singleton instance
export const roomConfigService = new RoomConfigService();

// Also export the class for testing
export { RoomConfigService };
