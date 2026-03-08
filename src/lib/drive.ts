/**
 * Google Drive URL conversion utilities.
 * Converts any Google Drive share URL to a direct image display URL.
 * Server-side and client-side safe — no API calls, pure string transformation.
 */

/**
 * Converts any Google Drive share URL to a direct image URL.
 * Returns the original URL unchanged if it is not a Drive URL.
 *
 * Supported input formats:
 *   https://drive.google.com/file/d/FILE_ID/view?usp=sharing
 *   https://drive.google.com/file/d/FILE_ID/view
 *   https://drive.google.com/open?id=FILE_ID
 *   https://drive.google.com/uc?id=FILE_ID  (already direct — returned as-is)
 *
 * Output format:
 *   https://drive.google.com/uc?export=view&id=FILE_ID
 */
export function driveToDirectUrl(url: string): string {
  if (!url || typeof url !== "string") return "";

  // Already a direct uc?export=view URL — return as-is
  if (url.includes("drive.google.com/uc?") && url.includes("export=view")) {
    return url;
  }

  // Already a uc?id= URL (without export=view) — add export param
  const ucMatch = url.match(/drive\.google\.com\/uc\?(?:.*&)?id=([a-zA-Z0-9_-]+)/);
  if (ucMatch) {
    return `https://drive.google.com/uc?export=view&id=${ucMatch[1]}`;
  }

  // /file/d/FILE_ID/view pattern
  const fileMatch = url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (fileMatch) {
    return `https://drive.google.com/uc?export=view&id=${fileMatch[1]}`;
  }

  // /open?id=FILE_ID pattern
  const openMatch = url.match(/drive\.google\.com\/open\?(?:.*&)?id=([a-zA-Z0-9_-]+)/);
  if (openMatch) {
    return `https://drive.google.com/uc?export=view&id=${openMatch[1]}`;
  }

  // Not a Drive URL — return unchanged
  return url;
}

/**
 * Returns true if the URL is any Google Drive URL pattern.
 */
export function isDriveUrl(url: string): boolean {
  if (!url || typeof url !== "string") return false;
  return url.includes("drive.google.com");
}
