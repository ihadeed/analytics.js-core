import _debug from 'debug';
import { Entity } from './entity';


const debug = _debug('analytics:group');

/**
 * Initialize a new `Group` with `options`.
 */
export class Group extends Entity {
  defaults = {
    persist: true,
    cookie: {
      key: 'ajs_group_id'
    },
    localStorage: {
      key: 'ajs_group_properties'
    }
  };
}

export default new Group();
