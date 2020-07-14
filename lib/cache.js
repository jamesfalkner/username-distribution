'use strict'

const cacheManager = require('cache-manager');
const redisStore = require('cache-manager-redis-store');
const infinispanStore = require('./infinispan-cache-store');

const log = require('barelog')
const config = require('../config')
const timestring = require('timestring')

if (config.redis.host) {
  log('Using Redis as a store for caching')
}

if (config.dg.host) {
  log('Using Data Grid as a store for caching')
}

log("passing ttl as " + timestring(config.eventHours))

/**
 * Exposes an abstract caching layer, i.e get, set, del functions
 */

var opts = {
  ttl: timestring(config.eventHours)
};

if (config.dg.host) {
  opts.store = infinispanStore;
  opts.host = config.dg.host;
  opts.port = config.dg.port;
} else if (config.redis.host) {
  opts.store = redisStore;
  opts.host = config.redis.host;
  opts.port = config.redis.port;
  opts.auth_pass = config.redis.password;
  } else {
  opts.store = 'memory'
};

module.exports = cacheManager.caching(opts);
