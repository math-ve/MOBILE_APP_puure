import { requireOptionalNativeModule } from 'expo-modules-core'
// Import de types uniquement : effacé à la compilation, ne charge pas le module natif.
import type * as ImagePickerModule from 'expo-image-picker'

// Prise de photo (« Mon filtre ne va pas »).
// Le module natif n'existe qu'à partir du build 1.0.2 : sur les versions
// précédentes, mises à jour à distance avec ce code, on ne l'importe pas
// (l'import lève une erreur) et l'écran propose l'envoi par e-mail à la place.

export const isPhotoPickerAvailable = requireOptionalNativeModule('ExponentImagePicker') != null

export type PickedPhoto = { uri: string; mimeType: string }

type Source = 'camera' | 'library'

/** Ouvre l'appareil photo ou la galerie. `null` si annulé ou refusé. */
export async function pickPhoto(source: Source): Promise<PickedPhoto | null | 'denied'> {
  if (!isPhotoPickerAvailable) return null
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const ImagePicker = require('expo-image-picker') as typeof ImagePickerModule

  const permission = source === 'camera'
    ? await ImagePicker.requestCameraPermissionsAsync()
    : await ImagePicker.requestMediaLibraryPermissionsAsync()
  if (!permission.granted) return 'denied'

  const options = { mediaTypes: ['images'] as ImagePickerModule.MediaType[], quality: 0.6, exif: false }
  const result = source === 'camera'
    ? await ImagePicker.launchCameraAsync(options)
    : await ImagePicker.launchImageLibraryAsync(options)
  if (result.canceled || !result.assets?.[0]) return null

  const asset = result.assets[0]
  return { uri: asset.uri, mimeType: asset.mimeType ?? 'image/jpeg' }
}
