import * as rawCookie from '@segment/cookie';
import _debug from 'debug';
import * as uuid from 'uuid';
import cookie from './cookie';
import { Entity } from './entity';
import localStorage from './store';


interface UserDefaults {
  persist: boolean;
  cookie: {
    key: string;
    oldKey: string;
  };
  localStorage: {
    key: string;
  };
}

/**
 * Inherit `Entity`
 */
export class User extends Entity {
  defaults: UserDefaults = {
    persist: true,
    cookie: {
      key: 'ajs_user_id',
      oldKey: 'ajs_user'
    },
    localStorage: {
      key: 'ajs_user_traits'
    }
  };

  debug = _debug('analytics:user');


  /**
   * Set/get the user id.
   *
   * When the user id changes, the method will reset his anonymousId to a new one.
   *
   * @example
   * // didn't change because the user didn't have previous id.
   * anonymousId = user.anonymousId();
   * user.id('foo');
   * assert.equal(anonymousId, user.anonymousId());
   *
   * // didn't change because the user id changed to null.
   * anonymousId = user.anonymousId();
   * user.id('foo');
   * user.id(null);
   * assert.equal(anonymousId, user.anonymousId());
   *
   * // change because the user had previous id.
   * anonymousId = user.anonymousId();
   * user.id('foo');
   * user.id('baz'); // triggers change
   * user.id('baz'); // no change
   * assert.notEqual(anonymousId, user.anonymousId());
   */

  id(id?: string): string | undefined {
    const prev = this._getId();
    const ret = Entity.prototype.id.apply(this, arguments);
    if (prev == null) return ret;
    // FIXME: We're relying on coercion here (1 == "1"), but our API treats these
    // two values differently. Figure out what will break if we remove this and
    // change to strict equality
    /* eslint-disable eqeqeq */
    if (prev != id && id) this.anonymousId(null);
    /* eslint-enable eqeqeq */
    return ret;
  }

  /**
   * Set / get / remove anonymousId.
   *
   * @param {String} anonymousId
   * @return {String|User}
   */

  anonymousId(anonymousId?: string): string | User {
    const store = this.storage();

    // set / remove
    if (arguments.length) {
      store.set('ajs_anonymous_id', anonymousId);
      this._setAnonymousIdInLocalStorage(anonymousId);
      return this;
    }

    // new
    anonymousId = store.get('ajs_anonymous_id');
    if (anonymousId) {
      // value exists in cookie, copy it to localStorage
      this._setAnonymousIdInLocalStorage(anonymousId);
      // refresh cookie to extend expiry
      store.set('ajs_anonymous_id', anonymousId);
      return anonymousId;
    }

    if (!this._options.localStorageFallbackDisabled) {
      // if anonymousId doesn't exist in cookies, check localStorage
      anonymousId = localStorage.get('ajs_anonymous_id');
      if (anonymousId) {
        // Write to cookies if available in localStorage but not cookies
        store.set('ajs_anonymous_id', anonymousId);
        return anonymousId;
      }
    }

    // old - it is not stringified so we use the raw cookie.
    anonymousId = rawCookie('_sio');
    if (anonymousId) {
      anonymousId = anonymousId.split('----')[0];
      store.set('ajs_anonymous_id', anonymousId);
      this._setAnonymousIdInLocalStorage(anonymousId);
      store.remove('_sio');
      return anonymousId;
    }

    // empty
    anonymousId = uuid.v4();
    store.set('ajs_anonymous_id', anonymousId);
    this._setAnonymousIdInLocalStorage(anonymousId);
    return store.get('ajs_anonymous_id');
  }

  /**
   * Set the user's `anonymousid` in local storage.
   */

  _setAnonymousIdInLocalStorage(id: string) {
    if (!this._options.localStorageFallbackDisabled) {
      localStorage.set('ajs_anonymous_id', id);
    }
  }

  /**
   * Remove anonymous id on logout too.
   */

  logout() {
    Entity.prototype.logout.call(this);
    this.anonymousId(null);
  }

  /**
   * Load saved user `id` or `traits` from storage.
   */

  load() {
    if (this._loadOldCookie()) return;
    Entity.prototype.load.call(this);
  }

  /**
   * BACKWARDS COMPATIBILITY: Load the old user from the cookie.
   *
   * @api private
   */

  _loadOldCookie(): boolean {
    const user = cookie.get(this._options.cookie.oldKey);
    if (!user) return false;

    this.id(user.id);
    this.traits(user.traits);
    cookie.remove(this._options.cookie.oldKey);
    return true;
  }
}

export default new User();

