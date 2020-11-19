import * as store from '@segment/store';

export interface StoreOptions {
  key?: string;
  enabled?: boolean;
}

export class Store {
  _options: any = {};
  enabled: boolean;

  constructor(options?: StoreOptions) {
    this.options(options);
  }

  /**
   * Set the `options` for the store.
   */
  options(options?: StoreOptions) {
    if (arguments.length === 0) return this._options;

    options = options || {};
    options = {
      enabled: true,
      ...options
    };

    this.enabled = options.enabled && store.enabled;
    this._options = options;
  }

  /**
   * Set a `key` and `value` in local storage.
   */
  set(key: string, value: any) {
    if (!this.enabled) return false;
    return store.set(key, value);
  }

  /**
   * Get a value from local storage by `key`.
   */
  get(key: string): any {
    if (!this.enabled) return null;
    return store.get(key);
  }

  /**
   * Remove a value from local storage by `key`.
   */
  remove(key: string) {
    if (!this.enabled) return false;
    return store.remove(key);
  }
}

export default new Store();
