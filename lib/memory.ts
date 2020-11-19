'use strict';

import cloneDeep from 'lodash.clonedeep'

/**
 * HOP.
 */
var has = Object.prototype.hasOwnProperty;

export class Memory {
  store: any = {};

  /**
   * Set a `key` and `value`.
   */
  set(key: string, value: unknown): boolean  {
    this.store[key] = cloneDeep(value);
    return true;
  };

  /**
   * Get a `key`.
   */
  get(key: string): unknown | undefined  {
    if (!has.call(this.store, key)) return;
    return cloneDeep(this.store[key]);
  };

  /**
   * Remove a `key`.
   */
  remove(key: string): boolean  {
    delete this.store[key];
    return true;
  };
}

export default new Memory();
