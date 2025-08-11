/*
    These interfaces and classes are related to user (Me) functionality.
    Extracted from interfaces.ts to keep files focused and under 120 lines.
*/

import { put_json } from './api';

export interface SlideshowConfig {
  // 1 ... 10 seconds
  duration: number;      
  // 0 ... 3 seconds
  transition: number;   
  // 1 ... 6 
  panorama: number;    
  // 0.5 ... 2  
  scale_factor: number;  
}

export interface Config {
  dark_mode: boolean;
  slideshow: SlideshowConfig;
}

export interface Me {
  roles: string;
  name?: string;
  email?: string;
  picture?: string;
  terms_accepted: string;
  created_at: string;
  last_login: string;
  config: Config;
}

export class MeImple implements Me {
  private _updateTimeout: ReturnType<typeof setTimeout> | null = null;
  private _onUpdate: () => void = () => {};

  // Implement Me interface properties
  roles!: string;
  name?: string;
  email?: string;
  picture?: string;
  terms_accepted!: string;
  created_at!: string;
  last_login!: string;
  config!: Config;

  constructor(data: Me, onUpdate?: () => void) {
    this._setData(data);
    this._onUpdate = onUpdate || (() => {});
  }

  // Private method to set data properties with defaults
  private _setData(data: Me): void {
    // Copy all properties from data to this instance
    this.roles = data.roles;
    this.name = data.name;
    this.email = data.email;
    this.picture = data.picture;
    this.terms_accepted = data.terms_accepted;
    this.created_at = data.created_at;
    this.last_login = data.last_login;
    
    // Ensure config has valid defaults
    this.config = {
      dark_mode: data.config?.dark_mode ?? false,
      slideshow: {
        duration: data.config?.slideshow?.duration ?? 3.1,
        transition: data.config?.slideshow?.transition ?? 1.1,
        panorama: data.config?.slideshow?.panorama ?? 2.4,
        scale_factor: data.config?.slideshow?.scale_factor ?? 1.2
      }
    };
  }

  // Method to check if user has a specific role
  hasRole(role: string): boolean {
    return this.roles.split(',').map(r => r.trim()).includes(role);
  }

  // Method to update config with debounced database persistence
  async updateConfig(configUpdates: Partial<Config>): Promise<void> {
    // Update local config immediately for reactive UI
    this.config = { ...this.config, ...configUpdates };
    
    // Notify context consumers of the change
    this._onUpdate();

    // Clear any existing timeout
    if (this._updateTimeout !== null) {
      clearTimeout(this._updateTimeout);
    }
    
    // Schedule delayed database update
    this._updateTimeout = setTimeout(async () => {
      const result = await put_json(`/auth/users/${this.email}/put`, {
        config: JSON.stringify(this.config)
      });
      if (result) {
        console.log('Config updated in database');
      } else {
        console.warn('Failed to update config in database');
      }
      this._updateTimeout = null;
    }, 3000);
  }

  // Method to update profile information
  async updateProfile(profileUpdates: Partial<Omit<Me, 'config'>>): Promise<void> {
    // Update local data immediately
    Object.assign(this, profileUpdates);
    
    // Notify context consumers of the change
    this._onUpdate();

    // Update database immediately for profile changes
    const result = await put_json(`/auth/users/${this.email}/put`, profileUpdates);
    if (result) {
      console.log('Profile updated in database');
    } else {
      console.warn('Failed to update profile in database');
    }
  }

  // Method to update the internal data (used by context when refreshing from server)
  updateData(newData: Me): void {
    this._setData(newData);
    
    this._onUpdate();
  }
}