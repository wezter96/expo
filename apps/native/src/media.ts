import { useEffect, useState } from 'react';
import { decryptRemoteToLocal } from './e2ee';

/**
 * Resolve a media URL for display. For encrypted messages (a per-file mediaKey
 * is present) it downloads + decrypts the blob to a local file; otherwise it
 * passes the URL through unchanged. Shared by the chat and the photo album.
 */
export function useDecryptedUri(url: string | undefined, mediaKey: string | undefined, ext: string): string | undefined {
  const [uri, setUri] = useState<string | undefined>(mediaKey ? undefined : url);
  useEffect(() => {
    let active = true;
    if (!url) {
      setUri(undefined);
      return;
    }
    if (!mediaKey) {
      setUri(url);
      return;
    }
    decryptRemoteToLocal(url, mediaKey, ext)
      .then((local) => active && setUri(local))
      .catch(() => active && setUri(undefined));
    return () => {
      active = false;
    };
  }, [url, mediaKey, ext]);
  return uri;
}
