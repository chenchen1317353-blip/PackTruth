import sharp from 'sharp';

/**
 * 图片预处理：只在「明显过大」时才压缩，其余情况原样保留。
 *
 * 为什么谨慎：这个项目的核心是读包装上的小字，过度压缩会直接毁掉识别率。
 * 手机照片 1440×1920 这种尺寸完全不需要压缩，压了反而亏。
 */

const MAX_EDGE = 2048; // 超过这个长边才缩
const JPEG_QUALITY = 88;
const SKIP_IF_SMALLER_THAN = 1.5 * 1024 * 1024; // 1.5MB 以下且尺寸不大就不动

export const ACCEPTED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp'];

/**
 * @param {{ base64: string, mimeType: string }} input
 * @returns {Promise<{base64:string, mimeType:string, width:number|null, height:number|null,
 *   originalBytes:number, processedBytes:number, compressed:boolean, note:string|null}>}
 */
export async function prepareImage({ base64, mimeType }) {
  if (!base64 || typeof base64 !== 'string') {
    const err = new Error('图片内容为空');
    err.code = 'EMPTY_IMAGE';
    throw err;
  }

  const buf = Buffer.from(base64, 'base64');
  if (buf.length < 1024) {
    const err = new Error('图片内容过小，可能不是有效图片');
    err.code = 'EMPTY_IMAGE';
    throw err;
  }

  let meta;
  try {
    meta = await sharp(buf, { animated: false }).metadata();
  } catch {
    const err = new Error('无法解析图片，请确认是 JPG 或 PNG');
    err.code = 'UNREADABLE_IMAGE';
    throw err;
  }

  const { width = null, height = null, format } = meta;
  const longEdge = Math.max(width || 0, height || 0);

  const isJpeg = format === 'jpeg' || format === 'jpg';
  const smallEnough = longEdge <= MAX_EDGE && buf.length <= SKIP_IF_SMALLER_THAN;

  if (smallEnough) {
    return {
      base64,
      mimeType: isJpeg ? 'image/jpeg' : `image/${format}`,
      width,
      height,
      originalBytes: buf.length,
      processedBytes: buf.length,
      compressed: false,
      note: null,
    };
  }

  // 需要压缩：等比缩到长边 MAX_EDGE 以内，统一转 JPEG
  const out = await sharp(buf, { animated: false })
    .rotate() // 按 EXIF 方向摆正，手机竖拍照片很关键
    .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
    .toBuffer({ resolveWithObject: true });

  return {
    base64: out.data.toString('base64'),
    mimeType: 'image/jpeg',
    width: out.info.width,
    height: out.info.height,
    originalBytes: buf.length,
    processedBytes: out.data.length,
    compressed: true,
    note: `原图 ${width}×${height} / ${(buf.length / 1024).toFixed(0)}KB，已压缩到 ${out.info.width}×${out.info.height} / ${(out.data.length / 1024).toFixed(0)}KB`,
  };
}

/** 从本地文件读图并预处理（命令行对比脚本用） */
export async function prepareImageFromFile(filePath) {
  const { readFile } = await import('node:fs/promises');
  const buf = await readFile(filePath);
  const meta = await sharp(buf).metadata();
  const mime = meta.format === 'png' ? 'image/png' : meta.format === 'webp' ? 'image/webp' : 'image/jpeg';
  const prepared = await prepareImage({ base64: buf.toString('base64'), mimeType: mime });
  return { ...prepared, filePath };
}
