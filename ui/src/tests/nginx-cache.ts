import { get_json } from '../app/api';
import { PwTests } from '../pw-tests';

// cmd to force-load -thumb image
// curl https://dev49.org/photos/api/photos/42338D98-AD75-42E6-A02C-B0F33DE226E0/img-thumb > thumb.jpg

// Configuration constants for selective reporting
const LOADING = true; // Enable/disable "Loading photos to populate cache..." section

async function testNginxHealth(msg: PwTests): Promise<void> {
  // First, let's check if we can access nginx health endpoint
  const healthResponse = await fetch('/nginx/health', {
    method: 'GET',
    credentials: 'include',
  });

  if (healthResponse.ok) {
    const healthText = await healthResponse.text();
    msg.out(`✓ Nginx health check: ${healthText.trim()}`);
  } else {
    msg.err(`✗ Nginx health check failed: ${healthResponse.status}`);
  }
}

async function loadPhotosToPopulateCache(msg: PwTests): Promise<number> {
  msg.out('## Loading photos to populate cache...');

  let photosAccessed = 0;

  try {
    const albums = await get_json('/photos/api/albums');

    if (!albums || Object.keys(albums).length === 0) {
      msg.out('No albums found to test caching with');
      return photosAccessed;
    }

    msg.out(`Found ${Object.keys(albums).length} albums`);

    // Try to access a few photo images with different sizes to populate the cache
    const maxPhotosToTest = 3;
    const sizesToTest = ['', '-thumb', '-sm', '-md']; // Test different image sizes

    for (const [albumUuid, _] of Object.entries(albums)) {
      if (photosAccessed >= maxPhotosToTest) break;

      try {
        // Get album details to find photos
        const albumDetails = await get_json(`/photos/api/albums/${albumUuid}`);

        if (albumDetails && albumDetails.length > 0) {
          const photoId = albumDetails[0].uuid;

          // Test each size suffix for this photo
          for (const suffix of sizesToTest) {
            const imageUrl = `/photos/api/photos/${photoId}/img${suffix}`;

            try {
              const imageResponse = await fetch(imageUrl, {
                method: 'GET',
                credentials: 'include',
              });

              if (imageResponse.ok) {
                const cacheStatus = imageResponse.headers.get('X-Cache-Status');
                const contentLength = imageResponse.headers.get('Content-Length');
                const suffixDisplay = suffix === '' ? '(original)' : suffix;

                msg.out(
                  `✓ Photo ${photoId}${suffixDisplay}: ${imageResponse.status} (Cache: ${cacheStatus || 'unknown'}, Size: ${
                    contentLength || 'unknown'
                  } bytes)`
                );
                msg.out(`Debug: Requested URL: ${imageUrl}`);
              } else {
                msg.err(`✗ Photo ${photoId}${suffix}: ${imageResponse.status}`);
              }
            } catch (error) {
              msg.err(`Error accessing photo ${photoId}${suffix}: ${error instanceof Error ? error.message : String(error)}`);
            }
          }

          photosAccessed++;
        }
      } catch (error) {
        msg.err(`Error accessing album ${albumUuid}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // Wait a moment for cache files to be written to disk
    msg.out('## Waiting for cache files to be written...');
    await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait 2 seconds
  } catch (error) {
    msg.err(`Error loading albums: ${error instanceof Error ? error.message : String(error)}`);
  }

  return photosAccessed;
}

async function analyzeCacheByImageSuffix(msg: PwTests): Promise<void> {
  msg.out('## Cache Summary Table');

  try {
    const cacheData = await get_json('/photos/api/nginx-cache');

    if (cacheData.error) {
      msg.err(`Cache analysis failed: ${cacheData.error}`);
      return;
    }

    if (!cacheData.files || cacheData.files.length === 0) {
      msg.out('No cached files found for analysis');
      return;
    }

    // Analyze files by img suffix and track non-image files
    const imgSuffixCounts: { [suffix: string]: number } = {};
    const imgSuffixSizes: { [suffix: string]: number } = {};
    const nonImageFiles: Array<{ url: string; size: number; size_human: string }> = [];
    let totalImageFiles = 0;

    msg.out(`Processing ${cacheData.files.length} total cache files...`);

    for (const file of cacheData.files) {
      const cleanUrl = file.original_url.replace(/^httpGET/, '');

      // Match URLs like /photos/api/photos/{uuid}/img{suffix}
      // Updated regex to capture text suffixes like -thumb, -sm, -md, etc.
      const imgMatch = cleanUrl.match(/\/photos\/api\/photos\/[^\/]+\/img([^?\s\/]*)/);
      if (imgMatch) {
        const suffix = imgMatch[1] || ''; // Empty string for just 'img', or the suffix like '-thumb'
        const suffixKey = suffix === '' ? 'img' : `img${suffix}`;

        // Only count files with valid sizes (skip files with size 0 or unknown)
        if (file.size && file.size > 0) {
          imgSuffixCounts[suffixKey] = (imgSuffixCounts[suffixKey] || 0) + 1;
          imgSuffixSizes[suffixKey] = (imgSuffixSizes[suffixKey] || 0) + file.size;
          totalImageFiles++;
        }
      } else {
        // This is a non-image file, add it to our list
        nonImageFiles.push({
          url: cleanUrl,
          size: file.size || 0,
          size_human: file.size_human || '0B',
        });
      }
    }

    // Display image files summary table
    if (Object.keys(imgSuffixCounts).length > 0) {
      msg.out('\n### Image Files by Size');
      let suffixTable = `
| Image Size | File Count | Total Size | Avg Size |
|------------|------------|------------|----------|
`;

      // Sort by suffix name for consistent display
      const sortedSuffixes = Object.keys(imgSuffixCounts).sort((a, b) => {
        // Sort 'img' (original) first, then alphabetically by suffix
        if (a === 'img') return -1;
        if (b === 'img') return 1;
        return a.localeCompare(b);
      });

      let totalImageCount = 0;
      let totalImageSize = 0;

      for (const suffix of sortedSuffixes) {
        const count = imgSuffixCounts[suffix];
        const totalSize = imgSuffixSizes[suffix];
        const avgSize = Math.round(totalSize / count);
        const totalSizeHuman = totalSize > 1024 * 1024 ? `${(totalSize / (1024 * 1024)).toFixed(1)}MB` : `${(totalSize / 1024).toFixed(1)}KB`;
        const avgSizeHuman = avgSize > 1024 * 1024 ? `${(avgSize / (1024 * 1024)).toFixed(1)}MB` : `${(avgSize / 1024).toFixed(1)}KB`;

        suffixTable += `| ${suffix} | ${count} | ${totalSizeHuman} | ${avgSizeHuman} |\n`;
        totalImageCount += count;
        totalImageSize += totalSize;
      }

      // Add totals row
      const totalSizeHuman =
        totalImageSize > 1024 * 1024 ? `${(totalImageSize / (1024 * 1024)).toFixed(1)}MB` : `${(totalImageSize / 1024).toFixed(1)}KB`;
      const avgTotalSize = totalImageCount > 0 ? Math.round(totalImageSize / totalImageCount) : 0;
      const avgTotalSizeHuman =
        avgTotalSize > 1024 * 1024 ? `${(avgTotalSize / (1024 * 1024)).toFixed(1)}MB` : `${(avgTotalSize / 1024).toFixed(1)}KB`;
      suffixTable += `|------------|------------|------------|----------|\n`;
      suffixTable += `| **TOTAL** | **${totalImageCount}** | **${totalSizeHuman}** | **${avgTotalSizeHuman}** |\n`;

      msg.out(suffixTable);
    } else {
      msg.out('No image files found in cache');
    }

    // Display non-image files
    if (nonImageFiles.length > 0) {
      msg.out('\n### Other Cached Files (Non-Image)');
      let nonImageTable = `
| # | URL | Size |
|---|-----|------|
`;

      // Sort by size (largest first) for better readability
      nonImageFiles.sort((a, b) => b.size - a.size);

      for (let i = 0; i < nonImageFiles.length; i++) {
        const file = nonImageFiles[i];
        nonImageTable += `| ${i + 1} | \`${file.url}\` | ${file.size_human} |\n`;
      }

      msg.out(nonImageTable);
    } else {
      msg.out('\n### Other Cached Files (Non-Image)');
      msg.out('No non-image files found in cache');
    }

    // Verification summary
    const totalProcessedFiles = totalImageFiles + nonImageFiles.length;
    msg.out('\n### Cache Summary Verification');
    let verificationTable = `
| Category | Count |
|----------|-------|
| Image files | ${totalImageFiles} |
| Non-image files | ${nonImageFiles.length} |
| **Total processed** | **${totalProcessedFiles}** |
| **Total in cache** | **${cacheData.files.length}** |
| **Match?** | **${totalProcessedFiles === cacheData.files.length ? '✓ YES' : '✗ NO'}** |
`;

    msg.out(verificationTable);

    if (totalProcessedFiles !== cacheData.files.length) {
      msg.err(`Warning: Processed ${totalProcessedFiles} files but cache contains ${cacheData.files.length} files. Some files may have been missed!`);
    }
  } catch (error) {
    msg.err(`Error analyzing cache by image suffix: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function showLargestAndSmallestFiles(msg: PwTests): Promise<void> {
  msg.out('## Largest and Smallest Cached Files');

  try {
    const cacheData = await get_json('/photos/api/nginx-cache');

    if (cacheData.error) {
      msg.err(`Cache inspection failed: ${cacheData.error}`);
      return;
    }

    if (cacheData.files && cacheData.files.length > 0) {
      // Show largest files
      msg.out(`\nLargest cached files (showing top ${Math.min(cacheData.files.length, 10)}):`);

      // Create markdown table for largest cached files
      let largestTable = `
| # | Size | URL | Modified | Accessed |
|---|------|-----|----------|----------|
`;

      for (let i = 0; i < Math.min(cacheData.files.length, 10); i++) {
        const file = cacheData.files[i];
        const modifiedDate = new Date(file.modified).toLocaleString();
        const accessedDate = new Date(file.accessed).toLocaleString();

        // Strip httpGET prefix from file.original_url
        const cleanUrl = file.original_url.replace(/^httpGET/, '');
        largestTable += `| ${i + 1} | ${file.size_human} | \`${cleanUrl}\` | ${modifiedDate} | ${accessedDate} |\n`;
      }

      msg.out(largestTable);

      // Show smallest files if we have more than 10 files
      if (cacheData.files.length > 10) {
        const smallestCount = Math.min(10, cacheData.files.length);
        const startIndex = Math.max(0, cacheData.files.length - smallestCount);

        msg.out(`\nSmallest cached files (showing bottom ${smallestCount}):`);

        // Create markdown table for smallest cached files
        let smallestTable = `
| # | Size | URL | Modified | Accessed |
|---|------|-----|----------|----------|
`;

        for (let i = startIndex; i < cacheData.files.length; i++) {
          const file = cacheData.files[i];
          const modifiedDate = new Date(file.modified).toLocaleString();
          const accessedDate = new Date(file.accessed).toLocaleString();

          // Strip httpGET prefix from file.original_url
          const cleanUrl = file.original_url.replace(/^httpGET/, '');
          const displayIndex = i - startIndex + 1;
          smallestTable += `| ${displayIndex} | ${file.size_human} | \`${cleanUrl}\` | ${modifiedDate} | ${accessedDate} |\n`;
        }

        if (cacheData.files.length > 20) {
          smallestTable += `\n*... and ${cacheData.files.length - 20} files in between*`;
        }
        msg.out(smallestTable);
      }
    } else {
      msg.out('No cached files found');
    }
  } catch (error) {
    msg.err(`Error showing largest and smallest files: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function analyzeCacheContents(msg: PwTests): Promise<void> {
  msg.out('## Nginx Cache Contents Analysis');

  try {
    const cacheData = await get_json('/photos/api/nginx-cache');

    if (cacheData.error) {
      msg.err(`Cache inspection failed: ${cacheData.error}`);
      msg.out(`Cache directory: ${cacheData.cache_dir}`);
    } else {
      msg.out(`Cache directory: ${cacheData.cache_dir}`);
      msg.out(`Total cached files: ${cacheData.total_files}`);
      msg.out(`Total cache size: ${cacheData.total_size_human} (${cacheData.total_size} bytes)`);
    }

    msg.out(`\nCache inspection completed at: ${new Date(cacheData.timestamp).toLocaleString()}`);
  } catch (error) {
    msg.err(`Error inspecting cache: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function nginx_cache(msg: PwTests) {
  msg.out('# Testing nginx photos cache');

  try {
    // Test nginx health endpoint
    await testNginxHealth(msg);

    // Load photos to populate cache (if enabled)
    let photosAccessed = 0;
    if (LOADING) {
      photosAccessed = await loadPhotosToPopulateCache(msg);
      console.log('photosAccessed', photosAccessed);
    }

    // Cache summary table (always show)
    await analyzeCacheByImageSuffix(msg);

    // Analyze cache contents
    await analyzeCacheContents(msg);

    // Show largest and smallest files at the end
    await showLargestAndSmallestFiles(msg);
  } catch (error) {
    msg.err(`Error in nginx cache test: ${error instanceof Error ? error.message : String(error)}`);
  }
}
