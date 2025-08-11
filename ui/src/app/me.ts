/*
    These interfaces and classes are related to user (Me) functionality.
    Extracted from interfaces.ts to keep files focused and under 120 lines.
*/

export interface SlideshowConfig {
  // 1 ... 10 seconds
  duration: number;
  // 0 ... 3 seconds
  transition: number;
  // 1 ... 6
  panorama: number;
  // 0.5 ... 2
  scale_factor: number;
  // carousel or ken-burns
  theme: 'carousel' | 'ken-burns';
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
  config: Config; // Always parsed object now
}

// Helper function to check if user has a specific role
export function hasRole(me: Me, role: string): boolean {
  return me.roles.split(',').map(r => r.trim()).includes(role);
}