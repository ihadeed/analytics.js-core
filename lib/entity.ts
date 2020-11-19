import * as isodateTraverse from '@segment/isodate-traverse';
import _debug from 'debug';
import assignIn from 'lodash.assignin';
import cloneDeep from 'lodash.clonedeep';

import  cookie from './cookie';
import  memory from './memory';
import store from './store';
import { InitOptions } from './types';


/**
 * Initialize new `Entity` with `options`.
 */
export class Entity {
  _options: InitOptions = {};
  _storage: any;
  _traits: any;
  defaults?: any = {};
  _id: any;
  debug = _debug('analytics:entity');

  constructor(options?: InitOptions) {
    this.options(options);
    this.initialize();
  }

  /**
   * Initialize picks the storage.
   *
   * Checks to see if cookies can be set
   * otherwise fallsback to localStorage.
   */

  initialize() {
    cookie.set('ajs:cookies', true);

    // cookies are enabled.
    if (cookie.get('ajs:cookies')) {
      cookie.remove('ajs:cookies');
      this._storage = cookie;
      return;
    }

    // localStorage is enabled.
    if (store.enabled) {
      this._storage = store;
      return;
    }

    // fallback to memory storage.
    this.debug(
      'warning using memory store both cookies and localStorage are disabled'
    );
    this._storage = memory;
  }

  /**
   * Get the storage.
   */

  storage() {
    return this._storage;
  }

  /**
   * Get or set storage `options`.
   */

  options(options?: InitOptions) {
    if (arguments.length === 0) return this._options;
    this._options = {
      ...this.defaults,
      ...options
    };
  }

  /**
   * Get or set the entity's `id`.
   */
  id(): string;
  id(id: string): void;
  id(id?: string): string | void {
    if (typeof id === 'string') {
      this._setId(id);
    } else {
      return this._getId();
    }
  }

  /**
   * Get the entity's id.
   */

  _getId(): string | null {
    if (!this._options.persist) {
      return this._id === undefined ? null : this._id;
    }

    // Check cookies.
    const cookieId = this._getIdFromCookie();
    if (cookieId) {
      return cookieId;
    }

    // Check localStorage.
    const lsId = this._getIdFromLocalStorage();
    if (lsId) {
      // Copy the id to cookies so we can read it directly from cookies next time.
      this._setIdInCookies(lsId);
      return lsId;
    }

    return null;
  }

  /**
   * Get the entity's id from cookies.
   */

// FIXME `options.cookie` is an optional field, so `this._options.cookie.key`
// can thrown an exception.
  _getIdFromCookie(): string {
    return this.storage().get(this._options.cookie.key);
  }

  /**
   * Get the entity's id from cookies.
   */

  _getIdFromLocalStorage(): string | null {
    if (!this._options.localStorageFallbackDisabled) {
      return store.get(this._options.cookie.key);
    }
    return null;
  }

  /**
   * Set the entity's `id`.
   */

  _setId(id: string) {
    if (this._options.persist) {
      this._setIdInCookies(id);
      this._setIdInLocalStorage(id);
    } else {
      this._id = id;
    }
  }

  /**
   * Set the entity's `id` in cookies.
   */

  _setIdInCookies(id: string) {
    this.storage().set(this._options.cookie.key, id);
  }

  /**
   * Set the entity's `id` in local storage.
   */

  _setIdInLocalStorage(id: string) {
    if (!this._options.localStorageFallbackDisabled) {
      store.set(this._options.cookie.key, id);
    }
  }

  /**
   * Get or set the entity's `traits`.
   *
   * BACKWARDS COMPATIBILITY: aliased to `properties`
   */
  traits(): any
  traits(traits: any): void
  traits(traits?: any): any | void {
    switch (arguments.length) {
      case 0:
        return this._getTraits();
      case 1:
        return this._setTraits(traits);
      default:
      // No default case
    }
  }

  /**
   * Get the entity's traits. Always convert ISO date strings into real dates,
   * since they aren't parsed back from local storage.
   */

  _getTraits(): any {
    const ret = this._options.persist
      ? store.get(this._options.localStorage.key)
      : this._traits;
    return ret ? isodateTraverse(cloneDeep(ret)) : {};
  }

  /**
   * Set the entity's `traits`.
   */

  _setTraits(traits: any) {
    traits = traits || {};
    if (this._options.persist) {
      store.set(this._options.localStorage.key, traits);
    } else {
      this._traits = traits;
    }
  }

  /**
   * Identify the entity with an `id` and `traits`. If we it's the same entity,
   * extend the existing `traits` instead of overwriting.
   */

  identify(id?: string, traits?: any) {
    traits = traits || {};
    const current = this.id();

    if (current === null || current === id) {
      traits = assignIn(this.traits(), traits);
    }

    if (id) {
      this.id(id);
    }

    this.debug('identify %o, %o', id, traits);
    this.traits(traits);
    this.save();
  }

  /**
   * Save the entity to local storage and the cookie.
   */

  save(): boolean {
    if (!this._options.persist) return false;
    const id: string = this.id();
    this._setId(id);
    this._setTraits(this.traits());
    return true;
  }

  /**
   * Log the entity out, reseting `id` and `traits` to defaults.
   */

  logout() {
    this.id(null);
    this.traits({});
    this.storage().remove(this._options.cookie.key);
    store.remove(this._options.cookie.key);
    store.remove(this._options.localStorage.key);
  }

  /**
   * Reset all entity state, logging out and returning options to defaults.
   */

  reset() {
    this.logout();
    this.options({});
  }

  /**
   * Load saved entity `id` or `traits` from storage.
   */

  load() {
    this.id(this.id());
    this.traits(this.traits());
  }

}
