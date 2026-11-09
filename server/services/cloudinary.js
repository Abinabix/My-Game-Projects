import { v2 as cloudinary } from 'cloudinary';

let configured = false;
function configure() {
  if (configured) return;
  const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
    throw Object.assign(new Error('Cloudinary is not configured. Add the Cloudinary environment variables before uploading images.'), { status: 503 });
  }
  cloudinary.config({ cloud_name: CLOUDINARY_CLOUD_NAME, api_key: CLOUDINARY_API_KEY, api_secret: CLOUDINARY_API_SECRET, secure: true });
  configured = true;
}

export function uploadImage(buffer, { folder, publicId }) {
  configure();
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream({
      folder,
      public_id: publicId,
      resource_type: 'image',
      overwrite: false,
      allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    }, (error, result) => {
      if (error) return reject(Object.assign(new Error('Cloudinary could not store the uploaded image.'), { status: 502, cause: error }));
      resolve(result);
    });
    stream.end(buffer);
  });
}

export async function destroyImage(publicId) {
  if (!publicId) return;
  configure();
  await cloudinary.uploader.destroy(publicId, { resource_type: 'image', invalidate: true });
}
