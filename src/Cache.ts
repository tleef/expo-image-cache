import * as FileSystem from "expo-file-system";

import Entry from "./Entry";

export interface CacheOptions {
  dirName?: string;
}

export default class Cache {
  private readonly _cacheDir: string;
  private _dirExists: boolean = false;
  private _entries: { [uri: string]: Entry } = {};

  constructor(options: CacheOptions = {}) {
    let dirName = options.dirName || "expo-image-cache/";

    if (!dirName.endsWith("/")) {
      dirName += "/";
    }

    this._cacheDir = `${FileSystem.cacheDirectory}${dirName}`;
  }

  get cacheDir() {
    return this._cacheDir;
  }

  getLocalUriAsync(
    uri: string,
    options?: FileSystem.DownloadOptions,
    onProgress?: FileSystem.DownloadProgressCallback
  ) {
    if (!this._entries[uri]) {
      this._entries[uri] = new Entry(this, uri, options);
    }

    const entry = this._entries[uri];

    return new Promise((resolve, reject) => {
      entry.getLocalUri(resolve, reject, onProgress);
    });
  }

  async ensureDirectoryAsync() {
    if (this._dirExists) {
      return;
    }

    try {
      // We turn on intermediates in case user passes in nested `dirName`
      await FileSystem.makeDirectoryAsync(this._cacheDir, {
        intermediates: true
      });
      this._dirExists = true;
    } catch (e) {
      console.log(e);
    }
  }
}
