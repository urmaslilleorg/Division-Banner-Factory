export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";

interface BannerDownload {
  url: string;
  filename: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { banners } = body as { banners: BannerDownload[] };

    if (!banners || banners.length === 0) {
      return NextResponse.json(
        { error: "No banners to download" },
        { status: 400 }
      );
    }

    // For now, create a simple approach: fetch all images and bundle
    // Using a streaming ZIP approach with manual ZIP construction
    // (avoiding external dependencies)

    // Fetch all images in parallel
    const downloads = await Promise.allSettled(
      banners.map(async (banner) => {
        const res = await fetch(banner.url);
        if (!res.ok) throw new Error(`Failed to fetch ${banner.url}`);
        const buffer = await res.arrayBuffer();
        return {
          filename: banner.filename,
          data: new Uint8Array(buffer),
        };
      })
    );

    const successfulDownloads = downloads
      .filter((d) => d.status === "fulfilled")
      .map((d) => (d as PromiseFulfilledResult<{ filename: string; data: Uint8Array }>).value);

    if (successfulDownloads.length === 0) {
      return NextResponse.json(
        { error: "Failed to download any images" },
        { status: 500 }
      );
    }

    // Build a simple ZIP file (store method — no compression needed for images)
    const zipBuffer = buildZip(successfulDownloads);

    return new NextResponse(Buffer.from(zipBuffer), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="approved_banners.zip"`,
      },
    });
  } catch (error) {
    console.error("ZIP download failed:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * Build a minimal ZIP file (store method, no compression).
 * This avoids needing external zip libraries.
 */
function buildZip(
  files: { filename: string; data: Uint8Array }[]
): Uint8Array {
  const entries: {
    filename: Uint8Array;
    data: Uint8Array;
    crc32: number;
    offset: number;
  }[] = [];

  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [];
  let offset = 0;

  // Local file headers + data
  for (const file of files) {
    const filenameBytes = encoder.encode(file.filename);
    const crc = crc32(file.data);

    const localHeader = new Uint8Array(30 + filenameBytes.length);
    const view = new DataView(localHeader.buffer);

    // Local file header signature
    view.setUint32(0, 0x04034b50, true);
    // Version needed
    view.setUint16(4, 20, true);
    // General purpose bit flag
    view.setUint16(6, 0, true);
    // Compression method (0 = store)
    view.setUint16(8, 0, true);
    // Last mod time/date
    view.setUint16(10, 0, true);
    view.setUint16(12, 0, true);
    // CRC-32
    view.setUint32(14, crc, true);
    // Compressed size
    view.setUint32(18, file.data.length, true);
    // Uncompressed size
    view.setUint32(22, file.data.length, true);
    // Filename length
    view.setUint16(26, filenameBytes.length, true);
    // Extra field length
    view.setUint16(28, 0, true);
    // Filename
    localHeader.set(filenameBytes, 30);

    entries.push({
      filename: filenameBytes,
      data: file.data,
      crc32: crc,
      offset,
    });

    parts.push(localHeader);
    parts.push(file.data);
    offset += localHeader.length + file.data.length;
  }

  const centralDirOffset = offset;

  // Central directory
  for (const entry of entries) {
    const centralHeader = new Uint8Array(46 + entry.filename.length);
    const view = new DataView(centralHeader.buffer);

    // Central directory header signature
    view.setUint32(0, 0x02014b50, true);
    // Version made by
    view.setUint16(4, 20, true);
    // Version needed
    view.setUint16(6, 20, true);
    // General purpose bit flag
    view.setUint16(8, 0, true);
    // Compression method
    view.setUint16(10, 0, true);
    // Last mod time/date
    view.setUint16(12, 0, true);
    view.setUint16(14, 0, true);
    // CRC-32
    view.setUint32(16, entry.crc32, true);
    // Compressed size
    view.setUint32(20, entry.data.length, true);
    // Uncompressed size
    view.setUint32(24, entry.data.length, true);
    // Filename length
    view.setUint16(28, entry.filename.length, true);
    // Extra field length
    view.setUint16(30, 0, true);
    // File comment length
    view.setUint16(32, 0, true);
    // Disk number start
    view.setUint16(34, 0, true);
    // Internal file attributes
    view.setUint16(36, 0, true);
    // External file attributes
    view.setUint32(38, 0, true);
    // Relative offset of local header
    view.setUint32(42, entry.offset, true);
    // Filename
    centralHeader.set(entry.filename, 46);

    parts.push(centralHeader);
    offset += centralHeader.length;
  }

  const centralDirSize = offset - centralDirOffset;

  // End of central directory record
  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);
  eocdView.setUint32(0, 0x06054b50, true);
  eocdView.setUint16(4, 0, true); // Disk number
  eocdView.setUint16(6, 0, true); // Disk with central dir
  eocdView.setUint16(8, entries.length, true); // Entries on this disk
  eocdView.setUint16(10, entries.length, true); // Total entries
  eocdView.setUint32(12, centralDirSize, true); // Central dir size
  eocdView.setUint32(16, centralDirOffset, true); // Central dir offset
  eocdView.setUint16(20, 0, true); // Comment length

  parts.push(eocd);

  // Concatenate all parts
  const totalLength = parts.reduce((sum, p) => sum + p.length, 0);
  const result = new Uint8Array(totalLength);
  let pos = 0;
  for (const part of parts) {
    result.set(part, pos);
    pos += part.length;
  }

  return result;
}

/**
 * CRC-32 implementation for ZIP file integrity.
 */
function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
