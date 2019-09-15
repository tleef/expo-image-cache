import * as FileSystem from "expo-file-system";
import * as Crypto from "expo-crypto";
import { CryptoDigestAlgorithm, CryptoEncoding } from "expo-crypto";

import Cache from "./Cache";

export type DownloadSuccessCallback = (fileUri: string) => void;
export type DownloadErrorCallback = (error: Error) => void;

export interface DownloadCompleteCallbacks {
  onSuccess: DownloadSuccessCallback;
  onError: DownloadErrorCallback;
}

export default class Entry {
  private readonly _cache: Cache;
  private readonly _uri: string;
  private readonly _options?: FileSystem.DownloadOptions;
  private _completeCallbacks: DownloadCompleteCallbacks[] = [];
  private _progressCallbacks: FileSystem.DownloadProgressCallback[] = [];

  constructor(cache: Cache, uri: string, options?: FileSystem.DownloadOptions) {
    this._cache = cache;
    this._uri = uri;
    this._options = options;

    this._onProgress = this._onProgress.bind(this);
  }

  getLocalUri(
    onSuccess: DownloadSuccessCallback,
    onError: DownloadErrorCallback,
    onProgress?: FileSystem.DownloadProgressCallback
  ) {
    this._completeCallbacks.push({
      onSuccess,
      onError
    });

    if (onProgress) {
      this._progressCallbacks.push(onProgress);
    }

    // There is already a request in progress
    if (this._completeCallbacks.length > 1) {
      return;
    }

    // Kick off request
    return this._getLocalUriAsync();
  }

  private async _getLocalUriAsync() {
    try {
      // We use SHA1 for its combination of speed and portability, iOS, Android, and Web
      // Additionally, we use Expo's implementation because it's async which won't block the main thread
      // even if the app is trying to load many images at once.
      const digest = await Crypto.digestStringAsync(
        CryptoDigestAlgorithm.SHA1,
        this._uri,
        {
          encoding: CryptoEncoding.HEX
        }
      );

      const fileUri = `${this._cache.cacheDir}${digest}`;

      await this._cache.ensureDirectoryAsync();
      const { exists } = await FileSystem.getInfoAsync(fileUri);

      if (exists) {
        this._onSuccess(fileUri);
        return;
      }

      await this._downloadAsync(fileUri);
    } catch (e) {
      this._onError(e);
    }
  }

  private async _downloadAsync(fileUri: string) {
    try {
      // We download to a temp uri in case of failure
      // If successful, we move the file from the temp uri to the final one
      const tmpFileUri = `${fileUri}-${randomString(hexAlphabet, 10)}`;

      const result = await FileSystem.createDownloadResumable(
        this._uri,
        tmpFileUri,
        this._options,
        this._onProgress
      ).downloadAsync();

      if (result && result.status === 200) {
        await FileSystem.moveAsync({ from: tmpFileUri, to: fileUri });
        this._onSuccess(fileUri);
      } else if (result) {
        this._onError(
          new Error(
            `BadResponse StatusCode: ${result.status} URI: ${this._uri}`
          )
        );
      } else {
        this._onError(new Error(`NoResponse URI: ${this._uri}`));
      }
    } catch (e) {
      this._onError(e);
    }
  }

  private _onProgress(data: FileSystem.DownloadProgressData) {
    const callbacks = this._progressCallbacks;

    for (const cb of callbacks) {
      // We use setImmediate so no callback can block the others from being notified
      setImmediate(() => cb(data));
    }
  }

  private _onSuccess(fileUri: string) {
    const callbacks = this._completeCallbacks;

    this._reset();

    for (const cb of callbacks) {
      // We use setImmediate so no callback can block the others from being notified
      setImmediate(() => cb.onSuccess(fileUri));
    }
  }

  private _onError(error: Error) {
    const callbacks = this._completeCallbacks;

    this._reset();

    for (const cb of callbacks) {
      // We use setImmediate so no callback can block the others from being notified
      setImmediate(() => cb.onError(error));
    }
  }

  private _reset() {
    this._completeCallbacks = [];
    this._progressCallbacks = [];
  }
}

const hexAlphabet = "1234567890abcdef";

function randomString(alphabet: string, size: number) {
  let s = "";
  while (0 < size--) {
    s += alphabet[(Math.random() * alphabet.length) | 0];
  }
  return s;
}
