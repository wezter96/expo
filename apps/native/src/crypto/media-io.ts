/**
 * Media file encryption (photos / voice). Reads a local file, encrypts the
 * bytes with a fresh per-file key (the key travels inside the sealed message
 * payload), and writes ciphertext to a temp file for upload. On receive it
 * downloads the ciphertext blob and decrypts it back to a local file for
 * display. Native only (uses the filesystem); web isn't E2EE.
 *
 * ⚠️ Not audited. Not runtime-verified in this sandbox.
 */
import * as FileSystem from 'expo-file-system/legacy';
import { decryptMedia, encryptMedia, newMediaKey } from './messages';
import { fromB64, toB64 } from './primitives';

let counter = 0;
function tmpName(prefix: string, ext: string): string {
  counter += 1;
  return `${FileSystem.cacheDirectory}${prefix}_${counter}_${hash(prefix + counter)}.${ext}`;
}

function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(16);
}

/** Encrypt a local file → ciphertext temp file URI + base64 file key. */
export async function encryptFileToTemp(uri: string): Promise<{ encUri: string; keyB64: string }> {
  const b64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  const key = newMediaKey();
  const ct = encryptMedia(key, fromB64(b64));
  const encUri = tmpName('enc', 'bin');
  await FileSystem.writeAsStringAsync(encUri, toB64(ct), { encoding: FileSystem.EncodingType.Base64 });
  return { encUri, keyB64: toB64(key) };
}

/** Download an encrypted remote file and decrypt it → local plaintext file URI. */
export async function decryptRemoteToLocal(url: string, keyB64: string, ext: string): Promise<string> {
  const outUri = `${FileSystem.cacheDirectory}dec_${hash(url)}.${ext}`;
  const info = await FileSystem.getInfoAsync(outUri);
  if (info.exists) return outUri; // already decrypted this file
  const dl = tmpName('dl', 'bin');
  await FileSystem.downloadAsync(url, dl);
  const b64 = await FileSystem.readAsStringAsync(dl, { encoding: FileSystem.EncodingType.Base64 });
  const pt = decryptMedia(fromB64(keyB64), fromB64(b64));
  await FileSystem.writeAsStringAsync(outUri, toB64(pt), { encoding: FileSystem.EncodingType.Base64 });
  await FileSystem.deleteAsync(dl, { idempotent: true }).catch(() => {});
  return outUri;
}
