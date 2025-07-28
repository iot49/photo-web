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
  realm?: number;
  date?: AlbumDateRange;
  location?: AlbumLocation | null; // Made location nullable
  persons: string[];
  keywords: string[];
  thumbnail?: string;
}

export type Albums = Record<string, AlbumModel>;

export class AlbumFilter {
  title: string | undefined = undefined;
  path: string | undefined = undefined;

  /**
   * Filter albums based on the current filter criteria
   * @param albums The albums to filter
   * @returns Filtered albums that match the criteria
   */
  filter(albums: Albums): Albums {
    if (!this.title && !this.path) {
      return albums;
    }

    const filtered: Albums = {};
    
    for (const [uuid, album] of Object.entries(albums)) {
      let matches = true;
      
      // Filter by title if defined
      if (this.title !== undefined) {
        matches = matches && album.title.toLowerCase().includes(this.title.toLowerCase());
      }
      
      // Filter by path if defined
      if (this.path !== undefined) {
        matches = matches && album.path.toLowerCase().includes(this.path.toLowerCase());
      }
      
      if (matches) {
        filtered[uuid] = album;
      }
    }
    
    return filtered;
  }
}

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
