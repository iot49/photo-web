/*
    These interfaces match the models 
    in `photos/models.py`.
*/

export interface PhotoModel {
  uuid: string;
  date: string;
  public: boolean;
  mime_type: string;
  title?: string;
  description?: string;
  persons?: string[];
  keywords?: string[];
  width: number;
  height: number;
  place?: string;
  longitude?: number;
  latitude?: number;
  uti?: string;
}

export interface AlbumDateRange {
  start?: string;
  end?: string;
}

export interface AlbumLocation {
  longitude: number;
  latitude: number;
  radius: number;
}

export interface AlbumModel {
  uuid: string;
  title: string;
  path: string;
  public: boolean;
  realm?: number; // Added realm property
  date?: AlbumDateRange;
  location?: AlbumLocation | null; // Made location nullable
  persons: string[];
  keywords: string[];
  thumbnail?: string;
}

export type Albums = Record<string, AlbumModel>;

export interface Me {
  roles: string;
  name?: string;
  email?: string;
  picture?: string;
}

export type SrcsetInfo = ImageSize[];

export interface ImageSize {
  suffix: string;
  width: number;
  height: number;
  description: string;
}
