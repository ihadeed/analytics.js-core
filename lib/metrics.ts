'use strict';

import * as send from '@segment/send-json';
import _debug from 'debug';
import { MetricsOptions } from './types';


const debug = _debug('analytics.js:metrics');

export class Metrics {
  private host: string;
  private sampleRate: number;
  private flushTimer: number;
  private maxQueueSize: number;
  private queue: any[] = [];

  constructor(options?: MetricsOptions) {
    this.options(options);
  }

  /**
   * Set the metrics options.
   */

  options(options?: MetricsOptions) {
    options = options || {};

    this.host = options.host || 'api.segment.io/v1';
    this.sampleRate = options.sampleRate || 0; // disable metrics by default.
    this.flushTimer = options.flushTimer || 30 * 1000 /* 30s */;
    this.maxQueueSize = options.maxQueueSize || 20;

    this.queue = [];

    if (this.sampleRate > 0) {
      var self = this;
      setInterval(function() {
        self._flush();
      }, this.flushTimer);
    }
  }

  /**
   * Increments the counter identified by name and tags by one.
   */
  increment(metric: string, tags: any) {
    if (Math.random() > this.sampleRate) {
      return;
    }

    if (this.queue.length >= this.maxQueueSize) {
      return;
    }

    this.queue.push({ type: 'Counter', metric: metric, value: 1, tags: tags });

    // Trigger a flush if this is an error metric.
    if (metric.indexOf('error') > 0) {
      this._flush();
    }
  };

  /**
   * Flush all queued metrics.
   */
  _flush() {
    var self = this;

    if (self.queue.length <= 0) {
      return;
    }

    var payload = { series: this.queue };
    var headers = { 'Content-Type': 'text/plain' };

    self.queue = [];

    // This endpoint does not support jsonp, so only proceed if the browser
    // supports xhr.
    if (send.type !== 'xhr') return;

    send('https://' + this.host + '/m', payload, headers, function(err, res) {
      debug('sent %O, received %O', payload, [err, res]);
    });
  }
}

export default new Metrics();
