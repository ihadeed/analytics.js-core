import * as isMeta from '@segment/is-meta';
import * as prevent from '@segment/prevent-default';
import * as Emitter from 'component-emitter';
import * as querystring from 'component-querystring';
import * as type from 'component-type';
import debug from 'debug';
import * as extend from 'extend';
import * as is from 'is';

import cloneDeep from 'lodash.clonedeep';
import pick from 'lodash.pick';
import * as nextTick from 'next-tick';
import * as Facade from 'segmentio-facade';
import { Alias, Group, Identify, Page, Track } from 'segmentio-facade';
import cookie from './cookie';
import group from './group';
import metrics from './metrics';
import { DestinationMiddlewareChain, IntegrationMiddlewareChain, SourceMiddlewareChain } from './middleware';
import { normalize } from './normalize';
import { pageDefaults } from './pageDefaults';
import store from './store';
import { InitOptions, IntegrationsSettings, SegmentAnalytics, SegmentIntegration, SegmentOpts } from './types';
import user, { User } from './user';

/*
 * Module dependencies.
 */

/**
 * Initialize a new `Analytics` instance.
 */

export class Analytics extends (Emitter as any) implements SegmentAnalytics {
  Integrations = {};
  _sourceMiddlewares = new SourceMiddlewareChain();
  _integrationMiddlewares = new IntegrationMiddlewareChain();
  _destinationMiddlewares = {};
  _integrations = {};
  _readied = false;
  _timeout = 300;
  // XXX: BACKWARDS COMPATIBILITY
  _user = user;
  log = debug('analytics.js');

  constructor() {
    super();
    this._options({});
    this.on('initialize', (_, options) => {
      if (options.initialPageview) this.page();
      this._parseQuery(window.location.search);
    });
  }

  options: InitOptions;
  require: any;
  VERSION: any;
  on: (event: string, callback: (settings?: any, options?: InitOptions) => any) => any;

  /**
   * Use a `plugin`.
   */
  use(plugin: (analytics: SegmentAnalytics) => void): SegmentAnalytics {
    plugin(this);
    return this;
  }

  /**
   * Define a new `Integration`.
   */

  addIntegration(Integration: (options: SegmentOpts) => void): SegmentAnalytics {
    const name = Integration.prototype.name;
    if (!name) throw new TypeError('attempted to add an invalid integration');
    this.Integrations[name] = Integration;
    return this;
  }

  /**
   * Define a new `SourceMiddleware`
   */

  addSourceMiddleware(middleware: Function): SegmentAnalytics {
    this._sourceMiddlewares.add(middleware);
    return this;
  }

  /**
   * Define a new `IntegrationMiddleware`
   * @deprecated
   */

  addIntegrationMiddleware(middleware: Function): SegmentAnalytics {
    this._integrationMiddlewares.add(middleware);
    return this;
  }

  /**
   * Define a new `DestinationMiddleware`
   * Destination Middleware is chained after integration middleware
   */

  addDestinationMiddleware(integrationName: string, middlewares: Array<unknown>): SegmentAnalytics {
    const self = this;
    middlewares.forEach(function(middleware) {
      if (!self._destinationMiddlewares[integrationName]) {
        self._destinationMiddlewares[
          integrationName
          ] = new DestinationMiddlewareChain();
      }

      self._destinationMiddlewares[integrationName].add(middleware);
    });
    return self;
  }

  init(settings?: IntegrationsSettings, options?: InitOptions): SegmentAnalytics {
    return this.initialize(settings, options);
  }

  /**
   * Initialize with the given integration `settings` and `options`.
   *
   * Aliased to `init` for convenience.
   */
  initialize(settings?: IntegrationsSettings, options?: InitOptions): SegmentAnalytics {
    settings = settings || {};
    options = options || {};

    this._options(options);
    this._readied = false;

    // clean unknown integrations from settings
    Object.keys(settings).forEach(key => {
      const Integration = this.Integrations[key];
      if (!Integration) delete settings[key];
    });

    // add integrations
    Object.keys(settings).forEach(key => {
      const opts = settings[key];
      const name = key;

      // Don't load disabled integrations
      if (options.integrations) {
        if (
          options.integrations[name] === false ||
          (options.integrations.All === false && !options.integrations[name])
        ) {
          return;
        }
      }

      const Integration = this.Integrations[name];
      const clonedOpts = {
        ...opts // TODO clone
      };
      const integration = new Integration(clonedOpts);
      this.log('initialize %o - %o', name, opts);
      this.add(integration);
    });

    const integrations = this._integrations;

    // load user now that options are set
    user.load();
    group.load();

    // make ready callback
    let readyCallCount = 0;
    const integrationCount = Object.keys(integrations).length;
    const ready = () => {
      readyCallCount++;
      if (readyCallCount >= integrationCount) {
        this._readied = true;
        this.emit('ready');
      }
    };

    // init if no integrations
    if (integrationCount <= 0) {
      ready();
    }

    // initialize integrations, passing ready
    // create a list of any integrations that did not initialize - this will be passed with all events for replay support:
    this.failedInitializations = [];
    let initialPageSkipped = false;
    Object.keys(integrations).forEach(key => {
      const integration = integrations[key];
      if (
        options.initialPageview &&
        integration.options.initialPageview === false
      ) {
        // We've assumed one initial pageview, so make sure we don't count the first page call.
        const page = integration.page;
        integration.page = (...args: any[]) => {
          if (initialPageSkipped) {
            return page(...args);
          }
          initialPageSkipped = true;
          return;
        };
      }

      integration.analytics = self;

      integration.once('ready', ready);
      try {
        metrics.increment('analytics_js.integration.invoke', {
          method: 'initialize',
          integration_name: integration.name
        });
        integration.initialize();
      } catch (e) {
        const integrationName = integration.name;
        metrics.increment('analytics_js.integration.invoke.error', {
          method: 'initialize',
          integration_name: integration.name
        });
        this.failedInitializations.push(integrationName);
        this.log('Error initializing %s integration: %o', integrationName, e);
        // Mark integration as ready to prevent blocking of anyone listening to analytics.ready()

        integration.ready();
      }
    });

    // backwards compat with angular plugin and used for init logic checks
    this.initialized = true;

    this.emit('initialize', settings, options);
    return this;
  }

  /**
   * Set the user's `id`.
   */
  setAnonymousId(id: string): SegmentAnalytics {
    this.user().anonymousId(id);
    return this;
  }

  /**
   * Add an integration.
   */
  add(integration: {
    name: string | number;
  }): SegmentAnalytics {
    this._integrations[integration.name] = integration;
    return this;
  }

  /**
   * Identify a user by optional `id` and `traits`.
   *
   * @param {string} [id=user.id()] User ID.
   * @param {Object} [traits=null] User traits.
   * @param {Object} [options=null]
   * @param {Function} [fn]
   * @return {Analytics}
   */
  identify(id?: string, traits?: any, options?: SegmentOpts, fn?: Function | SegmentOpts): SegmentAnalytics {
    // Argument reshuffling.
    /* eslint-disable no-unused-expressions, no-sequences */
    if (is.fn(options)) (fn = options), (options = null);
    if (is.fn(traits)) (fn = traits), (options = null), (traits = null);
    if (is.object(id)) (options = traits), (traits = id), (id = user.id());
    /* eslint-enable no-unused-expressions, no-sequences */

    // clone traits before we manipulate so we don't do anything uncouth, and take
    // from `user` so that we carryover anonymous traits
    user.identify(id, traits);

    const msg = this.normalize({
      options: options,
      traits: user.traits(),
      userId: user.id()
    });

    // Add the initialize integrations so the server-side ones can be disabled too
    // NOTE: We need to merge integrations, not override them with assign
    // since it is possible to change the initialized integrations at runtime.
    if (this.options.integrations) {
      msg.integrations = {
        ...this.options.integrations,
        ...msg.integrations
      };
    }

    this._invoke('identify', new Identify(msg));

    // emit
    this.emit('identify', id, traits, options);
    this._callback(fn);
    return this;
  }

  /**
   * Return the current user.
   *
   * @return {Object}
   */

  user(): User {
    return user;
  }

  /**
   * Identify a group by optional `id` and `traits`. Or, if no arguments are
   * supplied, return the current group.
   *
   * @param {string} [id=group.id()] Group ID.
   * @param {Object} [traits=null] Group traits.
   * @param {Object} [options=null]
   * @param {Function} [fn]
   * @return {Analytics|Object}
   */
  group(id?: string, traits?: any, options?: any, fn?: any): any {
    /* eslint-disable no-unused-expressions, no-sequences */
    if (!arguments.length) return group;
    if (is.fn(options)) (fn = options), (options = null);
    if (is.fn(traits)) (fn = traits), (options = null), (traits = null);
    if (is.object(id)) (options = traits), (traits = id), (id = group.id());
    /* eslint-enable no-unused-expressions, no-sequences */

    // grab from group again to make sure we're taking from the source
    group.identify(id, traits);

    const msg = this.normalize({
      options: options,
      traits: group.traits(),
      groupId: group.id()
    });

    // Add the initialize integrations so the server-side ones can be disabled too
    // NOTE: We need to merge integrations, not override them with assign
    // since it is possible to change the initialized integrations at runtime.
    if (this.options.integrations) {
      msg.integrations = {
        ...this.options.integrations,
        ...msg.integrations
      };
    }

    this._invoke('group', new Group(msg));

    this.emit('group', id, traits, options);
    this._callback(fn);
    return this;
  }

  /**
   * Track an `event` that a user has triggered with optional `properties`.
   *
   * @param {string} event
   * @param {Object} [properties=null]
   * @param {Object} [options=null]
   * @param {Function} [fn]
   * @return {Analytics}
   */

  track(event: string, properties?: unknown, options?: unknown, fn?: unknown): SegmentAnalytics {
    // Argument reshuffling.
    /* eslint-disable no-unused-expressions, no-sequences */
    if (is.fn(options)) (fn = options), (options = null);
    if (is.fn(properties))
      (fn = properties), (options = null), (properties = null);
    /* eslint-enable no-unused-expressions, no-sequences */

    // figure out if the event is archived.
    let plan = this.options.plan || {};
    const events = plan.track || {};
    let planIntegrationOptions = {};

    // normalize
    const msg = this.normalize({
      properties: properties,
      options: options,
      event: event
    });

    // plan.
    plan = events[event];
    if (plan) {
      this.log('plan %o - %o', event, plan);
      if (plan.enabled === false) {
        // Disabled events should always be sent to Segment.
        planIntegrationOptions = { All: false, 'Segment.io': true };
      } else {
        planIntegrationOptions = plan.integrations || {};
      }
    } else {
      const defaultPlan = events.__default || { enabled: true };
      if (!defaultPlan.enabled) {
        // Disabled events should always be sent to Segment.
        planIntegrationOptions = { All: false, 'Segment.io': true };
      }
    }

    // Add the initialize integrations so the server-side ones can be disabled too
    // NOTE: We need to merge integrations, not override them with assign
    // since it is possible to change the initialized integrations at runtime.
    msg.integrations = {
      ...this._mergeInitializeAndPlanIntegrations(planIntegrationOptions),
      ...msg.integrations
    };

    this._invoke('track', new Track(msg));

    this.emit('track', event, properties, options);
    this._callback(fn);
    return this;
  }

  trackLink(links: Element | Array<Element> | JQuery, event: any, properties?: any): SegmentAnalytics {
    return this.trackClick(links, event, properties);
  }

  /**
   * Helper method to track an outbound link that would normally navigate away
   * from the page before the analytics calls were sent.
   *
   * BACKWARDS COMPATIBILITY: aliased to `trackClick`.
   *
   * @param {Element|Array} links
   * @param {string|Function} event
   * @param {Object|Function} properties (optional)
   * @return {Analytics}
   */

  trackClick(links: Element | Array<Element> | JQuery, event: any, properties?: any): SegmentAnalytics {
    let elements: Array<Element> = [];
    if (!links) return this;
    // always arrays, handles jquery
    if (links instanceof Element) {
      elements = [links];
    } else if ('toArray' in links) {
      elements = links.toArray();
    } else {
      elements = links as Array<Element>;
    }

    elements.forEach(el => {
      if (type(el) !== 'element') {
        throw new TypeError('Must pass HTMLElement to `analytics.trackLink`.');
      }
      el.addEventListener('click', (e) => {
        const ev = is.fn(event) ? event(el) : event;
        const props = is.fn(properties) ? properties(el) : properties;
        const href =
          el.getAttribute('href') ||
          el.getAttributeNS('http://www.w3.org/1999/xlink', 'href') ||
          el.getAttribute('xlink:href');

        this.track(ev, props);

        // @ts-ignore
        if (href && el.target !== '_blank' && !isMeta(e)) {
          prevent(e);
          this._callback(function() {
            window.location.href = href;
          });
        }
      });
    });

    return this;
  }

  trackSubmit(forms: Element | Array<any>, event: any, properites?: any): SegmentAnalytics {
    return this.trackForm(forms, event, properites);
  }

  /**
   * Helper method to track an outbound form that would normally navigate away
   * from the page before the analytics calls were sent.
   *
   * BACKWARDS COMPATIBILITY: aliased to `trackSubmit`.
   *
   * @param {Element|Array} forms
   * @param {string|Function} event
   * @param {Object|Function} properties (optional)
   * @return {Analytics}
   */
  trackForm(forms: Element | Array<any>, event: any, properties?: any): SegmentAnalytics {
    if (!forms) return this;
    // always arrays, handles jquery
    if (type(forms) === 'element') forms = [forms];

    const elements = forms as Array<unknown>;

    elements.forEach((el: HTMLElement | { submit: () => void }) => {
      if (type(el) !== 'element')
        throw new TypeError('Must pass HTMLElement to `analytics.trackForm`.');
      const handler = (e) => {
        prevent(e);

        const ev = is.fn(event) ? event(el) : event;
        const props = is.fn(properties) ? properties(el) : properties;
        this.track(ev, props);

        this._callback(function() {
          (el as any).submit();
        });
      };

      // Support the events happening through jQuery or Zepto instead of through
      // the normal DOM API, because `el.submit` doesn't bubble up events...
      const $ = window.jQuery || window.Zepto;
      if ($) {
        $(el).submit(handler);
      } else {
        (el as HTMLElement).addEventListener('submit', handler);
      }
    });

    return this;
  }

  /**
   * Trigger a pageview, labeling the current page with an optional `category`,
   * `name` and `properties`.
   *
   * @param {string} [category]
   * @param {string} [name]
   * @param {Object|string} [properties] (or path)
   * @param {Object} [options]
   * @param {Function} [fn]
   * @return {Analytics}
   */
  page(properties?: any): SegmentAnalytics;
  page(category?: string, name?: string, properties?: any, options?: any, fn?: unknown): SegmentAnalytics {
    // Argument reshuffling.
    /* eslint-disable no-unused-expressions, no-sequences */
    if (is.fn(options)) (fn = options), (options = null);
    if (is.fn(properties)) (fn = properties), (options = properties = null);
    if (is.fn(name)) (fn = name), (options = properties = name = null);
    if (type(category) === 'object')
      (options = name), (properties = category), (name = category = null);
    if (type(name) === 'object')
      (options = properties), (properties = name), (name = null);
    if (type(category) === 'string' && type(name) !== 'string')
      (name = category), (category = null);
    /* eslint-enable no-unused-expressions, no-sequences */

    properties = cloneDeep(properties) || {};
    if (name) properties.name = name;
    if (category) properties.category = category;

    // Ensure properties has baseline spec properties.
    // TODO: Eventually move these entirely to `options.context.page`
    // FIXME: This is purposely not overriding `defs`. There was a bug in the logic implemented by `@ndhoule/defaults`.
    //        This bug made it so we only would overwrite values in `defs` that were set to `undefined`.
    //        In some cases, though, pageDefaults  will return defaults with values set to "" (such as `window.location.search` defaulting to "").
    //        The decision to not fix this bus was made to preserve backwards compatibility.
    const defs = pageDefaults();
    properties = {
      ...properties,
      ...defs
    };

    // Mirror user overrides to `options.context.page` (but exclude custom properties)
    // (Any page defaults get applied in `this.normalize` for consistency.)
    // Weird, yeah--moving special props to `context.page` will fix this in the long term.
    const overrides = pick(properties, Object.keys(defs));
    if (!is.empty(overrides)) {
      options = options || {};
      options.context = options.context || {};
      options.context.page = overrides;
    }

    const msg = this.normalize({
      properties: properties,
      category: category,
      options: options,
      name: name
    });

    // Add the initialize integrations so the server-side ones can be disabled too
    // NOTE: We need to merge integrations, not override them with assign
    // since it is possible to change the initialized integrations at runtime.
    if (this.options.integrations) {
      msg.integrations = {
        ...this.options.integrations,
        ...msg.integrations
      };
    }

    this._invoke('page', new Page(msg));

    this.emit('page', category, name, properties, options);
    this._callback(fn);
    return this;
  }

  /**
   * FIXME: BACKWARDS COMPATIBILITY: convert an old `pageview` to a `page` call.
   * @api private
   */
  pageview(url: string): SegmentAnalytics {
    const properties: { path?: string } = {};
    if (url) properties.path = url;
    this.page(properties);
    return this;
  }

  /**
   * Merge two previously unassociated user identities.
   *
   * @param {string} to
   * @param {string} from (optional)
   * @param {Object} options (optional)
   * @param {Function} fn (optional)
   * @return {Analytics}
   */
  alias(
    to: string,
    from?: string,
    options?: unknown,
    fn?: unknown
  ): SegmentAnalytics {
    // Argument reshuffling.
    /* eslint-disable no-unused-expressions, no-sequences */
    if (is.fn(options)) (fn = options), (options = null);
    if (is.fn(from)) (fn = from), (options = null), (from = null);
    if (is.object(from)) (options = from), (from = null);
    /* eslint-enable no-unused-expressions, no-sequences */

    const msg = this.normalize({
      options: options,
      previousId: from,
      userId: to
    });

    // Add the initialize integrations so the server-side ones can be disabled too
    // NOTE: We need to merge integrations, not override them with assign
    // since it is possible to change the initialized integrations at runtime.
    if (this.options.integrations) {
      msg.integrations = {
        ...this.options.integrations,
        ...msg.integrations
      };
    }

    this._invoke('alias', new Alias(msg));

    this.emit('alias', to, from, options);
    this._callback(fn);
    return this;
  }

  /**
   * Register a `fn` to be fired when all the analytics services are ready.
   */
  ready(fn: Function): SegmentAnalytics {
    if (is.fn(fn)) {
      if (this._readied) {
        nextTick(fn);
      } else {
        this.once('ready', fn);
      }
    }
    return this;
  }

  /**
   * Set the `timeout` (in milliseconds) used for callbacks.
   */

  timeout(timeout: number) {
    this._timeout = timeout;
  }

  /**
   * Enable or disable debug.
   */

  debug(str: string | boolean) {
    if (!arguments.length || str) {
      debug.enable('analytics:' + (str || '*'));
    } else {
      debug.disable();
    }
  }

  /**
   * Apply options.
   * @api private
   */

  _options(
    options: InitOptions
  ): SegmentAnalytics {
    options = options || {};
    this.options = options;
    cookie.options(options.cookie);
    metrics.options(options.metrics);
    store.options(options.localStorage);
    user.options(options.user);
    group.options(options.group);
    return this;
  }

  /**
   * Callback a `fn` after our defined timeout period.
   * @api private
   */

  _callback(fn: any): SegmentAnalytics {
    if (is.fn(fn)) {
      this._timeout ? setTimeout(fn, this._timeout) : nextTick(fn);
    }
    return this;
  }

  /**
   * Call `method` with `facade` on all enabled integrations.
   *
   * @param {string} method
   * @param {Facade} facade
   * @return {Analytics}
   * @api private
   */
  _invoke(
    method: string,
    facade: Facade
  ): SegmentAnalytics {
    const self = this;

    try {
      this._sourceMiddlewares.applyMiddlewares(
        extend(true, new Facade({}), facade),
        this._integrations,
        function(result) {
          // A nullified payload should not be sent.
          if (result === null) {
            self.log(
              'Payload with method "%s" was null and dropped by source a middleware.',
              method
            );
            return;
          }

          // Check if the payload is still a Facade. If not, convert it to one.
          if (!(result instanceof Facade)) {
            result = new Facade(result);
          }

          self.emit('invoke', result);
          metrics.increment('analytics_js.invoke', {
            method: method
          });

          applyIntegrationMiddlewares(result);
        }
      );
    } catch (e) {
      metrics.increment('analytics_js.invoke.error', {
        method: method
      });
      self.log(
        'Error invoking .%s method of %s integration: %o',
        method,
        name,
        e
      );
    }

    return this;

    function applyIntegrationMiddlewares(facade) {
      const failedInitializations = self.failedInitializations || [];
      Object.keys(self._integrations).forEach(key => {
        const integration = self._integrations[key];
        const { name } = integration;
        const facadeCopy = extend(true, new Facade({}), facade);

        if (!facadeCopy.enabled(name)) return;
        // Check if an integration failed to initialize.
        // If so, do not process the message as the integration is in an unstable state.
        if (failedInitializations.indexOf(name) >= 0) {
          self.log(
            'Skipping invocation of .%s method of %s integration. Integration failed to initialize properly.',
            method,
            name
          );
        } else {
          try {
            // Apply any integration middlewares that exist, then invoke the integration with the result.
            self._integrationMiddlewares.applyMiddlewares(
              facadeCopy,
              integration.name,
              function(result) {
                // A nullified payload should not be sent to an integration.
                if (result === null) {
                  self.log(
                    'Payload to integration "%s" was null and dropped by a middleware.',
                    name
                  );
                  return;
                }

                // Check if the payload is still a Facade. If not, convert it to one.
                if (!(result instanceof Facade)) {
                  result = new Facade(result);
                }

                // apply destination middlewares
                // Apply any integration middlewares that exist, then invoke the integration with the result.
                if (self._destinationMiddlewares[integration.name]) {
                  self._destinationMiddlewares[integration.name].applyMiddlewares(
                    facadeCopy,
                    integration.name,
                    function(result) {
                      // A nullified payload should not be sent to an integration.
                      if (result === null) {
                        self.log(
                          'Payload to destination "%s" was null and dropped by a middleware.',
                          name
                        );
                        return;
                      }

                      // Check if the payload is still a Facade. If not, convert it to one.
                      if (!(result instanceof Facade)) {
                        result = new Facade(result);
                      }

                      metrics.increment('analytics_js.integration.invoke', {
                        method: method,
                        integration_name: integration.name
                      });

                      integration.invoke.call(integration, method, result);
                    }
                  );
                } else {
                  metrics.increment('analytics_js.integration.invoke', {
                    method: method,
                    integration_name: integration.name
                  });

                  integration.invoke.call(integration, method, result);
                }
              }
            );
          } catch (e) {
            metrics.increment('analytics_js.integration.invoke.error', {
              method: method,
              integration_name: integration.name
            });
            self.log(
              'Error invoking .%s method of %s integration: %o',
              method,
              name,
              e
            );
          }
        }
      });
    }
  }

  /**
   * Push `args`.
   *
   * @param {Array} args
   * @api private
   */

  push(args: any[]) {
    const method = args.shift();
    if (!this[method]) return;
    this[method].apply(this, args);
  }

  /**
   * Reset group and user traits and id's.
   *
   * @api public
   */
  reset() {
    this.user().logout();
    this.group().logout();
  }

  /**
   * Parse the query string for callable methods.
   *
   * @api private
   */

  _parseQuery(query: string): SegmentAnalytics {
    // Parse querystring to an object
    const q = querystring.parse(query);
    // Create traits and properties objects, populate from querysting params
    const traits = pickPrefix('ajs_trait_', q);
    const props = pickPrefix('ajs_prop_', q);
    // Trigger based on callable parameters in the URL
    if (q.ajs_uid) this.identify(q.ajs_uid, traits);
    if (q.ajs_event) this.track(q.ajs_event, props);
    if (q.ajs_aid) user.anonymousId(q.ajs_aid);
    return this;

    /**
     * Create a shallow copy of an input object containing only the properties
     * whose keys are specified by a prefix, stripped of that prefix
     *
     * @return {Object}
     * @api private
     */

    function pickPrefix(prefix: string, object: any) {
      const length = prefix.length;
      let sub;
      return Object.keys(object).reduce(function(acc, key) {
        if (key.substr(0, length) === prefix) {
          sub = key.substr(length);
          acc[sub] = object[key];
        }
        return acc;
      }, {});
    }
  }

  /**
   * Normalize the given `msg`.
   */

  normalize(msg: any): any {
    const nMsg = normalize(msg, Object.keys(this._integrations));
    if (nMsg.anonymousId) user.anonymousId(nMsg.anonymousId);
    nMsg.anonymousId = user.anonymousId();

    // Ensure all outgoing requests include page data in their contexts.
    nMsg.context.page = {
      ...pageDefaults(),
      ...nMsg.context.page
    };

    return nMsg;
  }

  /**
   * Merges the tracking plan and initialization integration options.
   *
   * @param  {Object} planIntegrations Tracking plan integrations.
   * @return {Object}                  The merged integrations.
   */
  _mergeInitializeAndPlanIntegrations(
    planIntegrations: SegmentIntegration
  ): any {
    // Do nothing if there are no initialization integrations
    if (!this.options.integrations) {
      return planIntegrations;
    }

    // Clone the initialization integrations
    let integrations = { ...this.options.integrations };
    let integrationName: string;

    // Allow the tracking plan to disable integrations that were explicitly
    // enabled on initialization
    if (planIntegrations.All === false) {
      integrations = { All: false };
    }

    for (integrationName in planIntegrations) {
      if (planIntegrations.hasOwnProperty(integrationName)) {
        // Don't allow the tracking plan to re-enable disabled integrations
        if (this.options.integrations[integrationName] !== false) {
          integrations[integrationName] = planIntegrations[integrationName];
        }
      }
    }

    return integrations;
  }
}

export default new Analytics();
