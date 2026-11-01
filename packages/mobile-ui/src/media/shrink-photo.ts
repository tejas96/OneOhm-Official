import { Platform } from 'react-native';
import type { UploadableFile } from '../api/upload';
import { jpegName, PHOTO_QUALITY, type PhotoSize, photoTargetSize } from './photo-size';

/**
 * The photo at upload size (long edge 2000 px, JPEG 0.7). Read any EXIF (the geotag)
 * from the picker's result before calling this: the resized file carries none. Small
 * photos, non-images, and any failure (for example a build without the image
 * manipulator) leave the photo as it was; a photo is never lost to resizing.
 */
export async function shrinkPhoto(
  file: UploadableFile,
  size: Partial<PhotoSize>,
): Promise<UploadableFile> {
  if (!file.type.startsWith('image/')) return file;
  const target = photoTargetSize({ width: size.width ?? 0, height: size.height ?? 0 });
  if (!target) return file;
  try {
    // Loaded on first use, so a build without the native module still starts.
    const { ImageManipulator, SaveFormat } = await import('expo-image-manipulator');
    // Decode at no more than twice the target (memory on low-end phones), then resize.
    const context = ImageManipulator.manipulate(file.uri, {
      maxWidth: target.width * 2,
      maxHeight: target.height * 2,
    });
    context.resize(target);
    const image = await context.renderAsync();
    const saved = await image.saveAsync({ compress: PHOTO_QUALITY, format: SaveFormat.JPEG });
    image.release();
    context.release();
    const resized = { uri: saved.uri, name: jpegName(file.name), type: 'image/jpeg' };
    if (Platform.OS !== 'web') return resized;
    // The browser preview uploads a Blob, not a path.
    return { ...resized, file: await (await fetch(saved.uri)).blob() };
  } catch {
    return file;
  }
}
