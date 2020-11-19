import { Cookie } from './cookie';
import { StoreOptions } from './store';


export interface SegmentAnalytics {
  Integrations: { [name: string]: (options: SegmentOpts) => void };
  options: InitOptions;
  require: any
  VERSION: any

  // Analytics.JS Methods
  page: (
    category?: string,
    name?: string,
    properties?: any,
    options?: any,
    fn?: unknown
  ) => void

  // Private fields
  _options: (options: Object) => void
  _sourceMiddlewares: unknown
  _integrationMiddlewares: unknown
  _destinationMiddlewares: unknown
  _integrations: unknown
  _readied: boolean
  _timeout: number
  _user: unknown
  log: (args: string) => void
  on: (event: string, callback: (settings: unknown, options: InitOptions) => void) => void
  _parseQuery: (queryString: string) => void
}

export interface IntegrationsSettings {
  // TODO remove `any`
  [key: string]: any;
}

export interface CookieOptions {
  key?: string;
  oldKey?: string;
  maxage?: number;
  domain?: string;
  path?: string;
  secure?: boolean;
  sameSite?: string
}

export interface MetricsOptions {
  host?: string;
  sampleRate?: number;
  flushTimer?: number;
  maxQueueSize?: number;
}

export interface UserOptions {
  cookie?: {
    key: string;
    oldKey: string;
  };
  localStorage?: {
    key: string;
  };
  persist?: boolean;
}

export interface GroupOptions {
  cookie?: {
    key: string;
  };
  localStorage?: {
    key: string;
  };
  persist?: boolean;
}

export interface InitOptions {
  plan?: any;
  initialPageview?: boolean;
  cookie?: CookieOptions;
  metrics?: MetricsOptions;
  localStorage?: StoreOptions;
  user?: UserOptions;
  group?: GroupOptions;
  integrations?: SegmentIntegration;
  localStorageFallbackDisabled?: boolean;
  persist?: boolean;
}

export interface SegmentIntegration {
  All?: boolean;

  [integration: string]: boolean | undefined;
}

export interface SegmentOpts {
  integrations?: any;
  anonymousId?: string;
  context?: any;
}

export interface Message {
  options?: unknown;
  integrations?: { [key: string]: string };
  providers?: { [key: string]: string | boolean };
  context?: unknown;
  messageId?: string;
}

export interface PageDefaults {
  path: string;
  referrer: string;
  search: string;
  title: string;
  url: string;
}
