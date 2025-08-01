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
  thumbnail?: PhotoModel;
  created: string;  // Creation date in ISO 8601 format
}

export type Albums = Record<string, AlbumModel>;


export interface Me {
  roles: string;
  name?: string;
  email?: string;
  picture?: string;
}

export class SrcsetInfo {
  private sizes!: ImageSizes;

  constructor(sizes: ImageSizes) {
    this.sizes = sizes;
  }

  srcsetFor(photo: PhotoModel): string {
    /* Return <img> srcset attribute for photo */
    const srcsetEntries: string[] = [];

    // Add sized versions (skip sizes larger than photo width)
    Object.entries(this.sizes).forEach(([suffix, sz]) => {
      if (sz.width < photo.width) {
        srcsetEntries.push(`/photos/api/photos/${photo.uuid}/img${suffix} ${sz.width}w`);
      }
    });
    // Add original image (no suffix) with photo's unscaled width
    srcsetEntries.push(`/photos/api/photos/${photo.uuid}/img ${photo.width}w`);

    return srcsetEntries.join(', ');
  }
}

export interface ImageSizes {
  [suffix: string]: {
    width: number;
    description: string;
  };
}
