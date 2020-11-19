import * as cookie from '@segment/cookie';
import * as topDomain from '@segment/top-domain';
import _debug from 'debug';
import cloneDeep from 'lodash.clonedeep';
import { CookieOptions } from './types';


const debug = _debug('analytics.js:cookie');
const MAX_AGE_ONE_YEAR = 31536000000;

export class Cookie {
  _options: CookieOptions;

  constructor(options?: CookieOptions) {
    this.options(options);
  }

  /**
   * Get or set the cookie options.
   */
  options(options?: CookieOptions) {
    if (arguments.length === 0) return this._options;

    options = options || {};

    let domain = '.' + topDomain(window.location.href);
    if (domain === '.') domain = null;

    const defaults: CookieOptions = {
      maxage: MAX_AGE_ONE_YEAR,
      domain: domain,
      path: '/',
      sameSite: 'Lax'
    };

    this._options = {
      ...defaults,
      ...options
    };

    // http://curl.haxx.se/rfc/cookie_spec.html
    // https://publicsuffix.org/list/effective_tld_names.dat
    //
    // try setting a dummy cookie with the options
    // if the cookie isn't set, it probably means
    // that the domain is on the public suffix list
    // like myapp.herokuapp.com or localhost / ip.
    this.set('ajs:test', 'true');
    if (!this.get('ajs:test')) {
      debug('fallback to domain=null');
      this._options.domain = null;
    }
    this.remove('ajs:test');
  }

  /**
   * Set a `key` and `value` in our cookie.
   */

  set(key: string, value?: any | string): boolean {
    try {
      value = window.JSON.stringify(value);
      cookie(key, value === 'null' ? null : value, cloneDeep(this._options));
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * Get a value from our cookie by `key`.
   */

  get(key: string): any {
    try {
      var value = cookie(key);
      value = value ? window.JSON.parse(value) : null;
      return value;
    } catch (e) {
      return null;
    }
  }

  /**
   * Remove a value from our cookie by `key`.
   */

  remove(key: string): boolean {
    try {
      cookie(key, null, cloneDeep(this._options));
      return true;
    } catch (e) {
      return false;
    }
  }
}

const c = new Cookie();
export default c;
