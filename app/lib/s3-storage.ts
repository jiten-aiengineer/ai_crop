import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';

// Vinext's server bundle must leave the AWS implementation to Node. Loading
// through Node's resolver avoids a bundled signer that fails at runtime on EC2.
const nodeRequire = createRequire(import.meta.url);
const s3 = nodeRequire('@aws-sdk/client-s3') as typeof import('@aws-sdk/client-s3');

/** Server-only private S3 storage for the exact image bytes submitted for an inspection. */
export const SUPPORTED_INSPECTION_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'] as const;
export type InspectionImageMimeType = typeof SUPPORTED_INSPECTION_IMAGE_TYPES[number];
export const SUPPORTED_PRODUCT_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type ProductImageMimeType = typeof SUPPORTED_PRODUCT_IMAGE_TYPES[number];
export type InspectionImageStorageStatus = 'not_configured' | 'stored' | 'partial_failure' | 'failed';

export type InspectionImageUpload = {
  bytes: Uint8Array;
  mimeType: string;
  imageOrder: number;
};

export type StoredInspectionImage = {
  bucket: string;
  key: string;
  mimeType: InspectionImageMimeType;
  fileSizeBytes: number;
  imageOrder: number;
};

export type InspectionImageStorageFailure = {
  imageOrder: number;
  code: 'upload_failed';
};

export type InspectionImageStorageResult = {
  status: InspectionImageStorageStatus;
  images: StoredInspectionImage[];
  failures: InspectionImageStorageFailure[];
};

type S3StorageConfig = { region: string; bucket: string; prefix: string; productPrefix: string };

const MAX_IMAGES_PER_INSPECTION = 5;
const MAX_INSPECTION_BYTES = 4 * 1024 * 1024;
const MAX_PRODUCT_IMAGE_BYTES = 5 * 1024 * 1024;
let client: import('@aws-sdk/client-s3').S3Client | undefined;

function trim(value: string | undefined) {
  return value?.trim() || '';
}

function configuredStorage(): S3StorageConfig | null {
  const region = trim(process.env.AWS_REGION);
  const bucket = trim(process.env.S3_BUCKET_NAME);
  if (!region || !bucket) return null;

  const prefix = (trim(process.env.S3_INSPECTIONS_PREFIX) || 'inspections').replace(/^\/+|\/+$/g, '');
  if (!/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(prefix)) throw new Error('S3 inspection prefix is invalid.');
  const productPrefix = (trim(process.env.S3_PRODUCT_IMAGES_PREFIX) || 'product-images').replace(/^\/+|\/+$/g, '');
  if (!/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(productPrefix)) throw new Error('S3 product image prefix is invalid.');
  return { region, bucket, prefix, productPrefix };
}

function extensionFor(mimeType: InspectionImageMimeType) {
  return ({
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/heic': 'heic',
    'image/heif': 'heif',
  } as const)[mimeType];
}

function productExtensionFor(mimeType: ProductImageMimeType) {
  return ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' } as const)[mimeType];
}

function assertInspectionId(value: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error('Inspection identifier is invalid.');
  }
}

function isSupportedMimeType(value: string): value is InspectionImageMimeType {
  return (SUPPORTED_INSPECTION_IMAGE_TYPES as readonly string[]).includes(value);
}

function isSupportedProductMimeType(value: string): value is ProductImageMimeType {
  return (SUPPORTED_PRODUCT_IMAGE_TYPES as readonly string[]).includes(value);
}

function assertProductId(value: string) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{1,98}$/.test(value)) throw new Error('Product identifier is invalid.');
}

function clientFor(config: S3StorageConfig) {
  // Do not pass credentials here. On EC2 the AWS SDK obtains temporary
  // credentials from CropLifeAIAppRole via its default credential provider chain.
  client ||= new s3.S3Client({ region: config.region });
  return client;
}

function inspectionImageKey(config: S3StorageConfig, inspectionId: string, imageOrder: number, now = new Date()) {
  const yyyy = String(now.getUTCFullYear());
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(now.getUTCDate()).padStart(2, '0');
  return `${config.prefix}/${yyyy}/${mm}/${dd}/${inspectionId}/image-${String(imageOrder).padStart(2, '0')}`;
}

/** Returns a private key reference only; it never creates a public or signed URL. */
export function getInspectionImageReference(image: Pick<StoredInspectionImage, 'bucket' | 'key'>) {
  return { bucket: image.bucket, key: image.key };
}

export async function uploadInspectionImage(inspectionId: string, image: InspectionImageUpload, now = new Date()): Promise<StoredInspectionImage> {
  const config = configuredStorage();
  if (!config) throw new Error('Private S3 inspection storage is not configured.');
  assertInspectionId(inspectionId);
  if (!isSupportedMimeType(image.mimeType) || !image.bytes.byteLength || image.imageOrder < 1 || image.imageOrder > MAX_IMAGES_PER_INSPECTION) {
    throw new Error('Inspection image is invalid.');
  }

  const key = `${inspectionImageKey(config, inspectionId, image.imageOrder, now)}.${extensionFor(image.mimeType)}`;
  await clientFor(config).send(new s3.PutObjectCommand({
    Bucket: config.bucket,
    Key: key,
    Body: image.bytes,
    ContentType: image.mimeType,
    // This reinforces the bucket's SSE-S3 default without making an ACL or URL public.
    ServerSideEncryption: 'AES256',
    Metadata: { 'inspection-id': inspectionId, 'image-order': String(image.imageOrder) },
  }));
  return { bucket: config.bucket, key, mimeType: image.mimeType, fileSizeBytes: image.bytes.byteLength, imageOrder: image.imageOrder };
}

export async function deleteInspectionImage(image: Pick<StoredInspectionImage, 'bucket' | 'key'>) {
  const config = configuredStorage();
  if (!config || image.bucket !== config.bucket || !image.key?.startsWith(`${config.prefix}/`)) throw new Error('Private S3 inspection storage is not configured.');
  await clientFor(config).send(new s3.DeleteObjectCommand({ Bucket: image.bucket, Key: image.key }));
}

/** Upload a product package image privately. It is served through an approved
 * product route only after that product has completed the release workflow. */
export async function storeProductImage(productId: string, image: { bytes: Uint8Array; mimeType: string }) {
  const config = configuredStorage();
  if (!config) throw new Error('Private S3 product image storage is not configured.');
  assertProductId(productId);
  if (!isSupportedProductMimeType(image.mimeType) || !image.bytes.byteLength || image.bytes.byteLength > MAX_PRODUCT_IMAGE_BYTES) {
    throw new Error('Use a JPG, PNG or WebP product image up to 5 MB.');
  }
  const key = `${config.productPrefix}/${productId}/${randomUUID()}.${productExtensionFor(image.mimeType)}`;
  await clientFor(config).send(new s3.PutObjectCommand({
    Bucket: config.bucket, Key: key, Body: image.bytes, ContentType: image.mimeType,
    ServerSideEncryption: 'AES256', Metadata: { 'product-id': productId },
  }));
  return { imagePath: `s3:${key}`, key, mimeType: image.mimeType, fileSizeBytes: image.bytes.byteLength };
}

/** Read an authorised product image without issuing a public S3 link. */
export async function readPrivateProductImage(imagePath: string) {
  const config = configuredStorage();
  const key = imagePath.startsWith('s3:') ? imagePath.slice(3) : '';
  if (!config || !key || !key.startsWith(`${config.productPrefix}/`) || !/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(key)) {
    throw new Error('Private product image storage is not configured.');
  }
  const object = await clientFor(config).send(new s3.GetObjectCommand({ Bucket: config.bucket, Key: key }));
  if (!object.Body) throw new Error('The private product image could not be read.');
  const bytes = await object.Body.transformToByteArray();
  const mimeType = object.ContentType || '';
  if (!bytes.byteLength || bytes.byteLength > MAX_PRODUCT_IMAGE_BYTES || !isSupportedProductMimeType(mimeType)) {
    throw new Error('The stored product image is invalid.');
  }
  return { bytes, mimeType };
}

/**
 * Reads one retained inspection image for an already-authorised admin request.
 * It deliberately returns bytes, not a public or pre-signed S3 URL.
 */
export async function readPrivateInspectionImage(image: Pick<StoredInspectionImage, 'bucket' | 'key' | 'mimeType'>) {
  const config = configuredStorage();
  if (!config || image.bucket !== config.bucket || !image.key.startsWith(`${config.prefix}/`)) {
    throw new Error('Private inspection image storage is not configured.');
  }
  if (!isSupportedMimeType(image.mimeType)) throw new Error('The stored inspection image type is not supported.');
  const object = await clientFor(config).send(new s3.GetObjectCommand({ Bucket: image.bucket, Key: image.key }));
  if (!object.Body) throw new Error('The private inspection image could not be read.');
  const bytes = await object.Body.transformToByteArray();
  if (!bytes.byteLength || bytes.byteLength > MAX_INSPECTION_BYTES) throw new Error('The stored inspection image is invalid.');
  return { bytes, mimeType: image.mimeType };
}

/**
 * Upload each submitted image under the inspection UUID. Successful images are
 * retained during a partial failure so a retry can reuse the deterministic key.
 */
export async function storeInspectionImages(inspectionId: string, images: InspectionImageUpload[]): Promise<InspectionImageStorageResult> {
  if (!configuredStorage()) return { status: 'not_configured', images: [], failures: [] };
  assertInspectionId(inspectionId);
  if (!images.length || images.length > MAX_IMAGES_PER_INSPECTION || images.reduce((total, image) => total + image.bytes.byteLength, 0) > MAX_INSPECTION_BYTES) {
    throw new Error('Inspection image upload limits were exceeded.');
  }

  const outcomes = await Promise.all(images.map(async (image) => {
    try {
      return { image: await uploadInspectionImage(inspectionId, image), failure: undefined };
    } catch (error) {
      // Keep detailed storage diagnostics on the server only. Farmers receive
      // the safe archive warning, while operators can resolve a failed upload.
      const detail = error instanceof Error ? { name: error.name, message: error.message } : { name: 'UnknownError', message: 'No error details were available.' };
      console.error('Private S3 inspection image upload failed.', { inspectionId, imageOrder: image.imageOrder, ...detail });
      return { image: undefined, failure: { imageOrder: image.imageOrder, code: 'upload_failed' as const } };
    }
  }));
  const stored = outcomes.flatMap((outcome) => outcome.image ? [outcome.image] : []);
  const failures = outcomes.flatMap((outcome) => outcome.failure ? [outcome.failure] : []);
  return { status: failures.length ? (stored.length ? 'partial_failure' : 'failed') : 'stored', images: stored, failures };
}
