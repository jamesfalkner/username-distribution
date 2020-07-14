var Infinispan = require('infinispan')
const log = require('barelog')

function InfinispanClient (options) {
  this.options = options

  log('Options: ' + JSON.stringify(options))

  if (!this.options) {
    throw new Error('[cache-manager] infinispan options not defined')
  }

  this.createClient(options).then((client) => {
    log("Connected to DG: " + client.toString());
    this.infinispan = client;
  })
}

InfinispanClient.prototype.name = 'infinispan'

InfinispanClient.prototype.createClient = function(options) {
  return Infinispan.client(
    {
      host: options.host,
      port: options.port
    },
    {
      cacheName: 'usercache'
    }
  );
}

/**
 * Used for testing; Gets the set options
 * @returns {object}
 * @private
 */
InfinispanClient.prototype._getOptions = function () {
  return this.options
}

/**
 * See https://github.com/BryanDonovan/node-cache-manager/blob/master/lib/caching.js
 * for the interface methods that need to be implemented
 */

/**
 * Get a value for a given key.
 * @method get
 * @param {String} key - The cache key
 * @param {Object} [options] - The options (optional)
 * @param {Function} cb - A callback that returns a potential error and the response
 */
InfinispanClient.prototype.get = function (key, options, cb) {

  if (typeof options === 'function') {
    cb = options

    this.clientPromise().then((client) => {
      client.get(key).then((value) => {
        cb(null, value);
      }).catch((err) => {
        cb(err, null)
      })
    });

  } else {
    this.clientPromise().then((client) => {
      client.get(key, options).then((value) => {
        cb(null, value);
      }).catch((err) => {
        cb(err, null)
      })
    });
  }
}

/**
 * Set a value for a given key.
 * @method set
 * @param {String} key - The cache key
 * @param {String} value - The value to set
 * @param {Object} [options] - The options (optional)
 * @param {Object} options.ttl - The ttl value. Default is 2592000 seconds
 * @param {Function} [cb] - A callback that returns a potential error, otherwise null
 */
InfinispanClient.prototype.set = function (key, value, options, cb) {
  log("prototype set: key: " + key + " val: " + value);
  var opt = {
    lifespan: 2592000
  }

  if (typeof options === 'function') {
    cb = options

    this.clientPromise().then((client) => {
      client.put(key, value);
    }).then(function () {
      cb(null, true)
    }).catch(function (err) {
      cb(err, null)
    })
  } else if (typeof options === 'number') {
    opt.lifespan = options + "s";

    this.clientPromise().then((client) => {
      client.put(key, value, opt)
    }).then(function () {
      cb(null, true)
    }).catch(function (err) {
      cb(err, null)
    })
  } else if (typeof options === 'object') {
    this.clientPromise().then((client) => {
      client.put(key, value, {lifespan: options.ttl});
    }).then(function () {
      cb(null, true)
    }).catch(function (err) {
      cb(err, null)
    })
  }
}

/**
 * Delete value of a given key
 * @method del
 * @param {String} key - The cache key
 * @param {Object} [options] - The options (optional)
 * @param {Function} [cb] - A callback that returns a potential error, otherwise null
 */
InfinispanClient.prototype.del = function (key, options, cb) {
  if (typeof options === 'function') {
    cb = options
  } else if (!options) {
    cb = function () {}
  }

  this.clientPromise().then((client) => {
    client.remove(key, options)
  }).then(function () {
    cb(null, null)
  }).catch(function (err) {
    cb(err, null)
  })
}

/**
 * Delete all the keys
 * @method reset
 * @param {Function} [cb] - A callback that returns a potential error, otherwise null
 */
InfinispanClient.prototype.reset = function (cb) {
  if (typeof cb !== 'function') {
    cb = function () {}
  }

  this.clientPromise().then((client) => {
    client.clear();
  }).then(function () {
    cb(null)
  }).catch(function (err) {
    cb(err, null)
  })
}

/**
 * Specify which values should and should not be cached.
 * If the function returns true, it will be stored in cache.
 * By default, it caches everything except null and undefined values.
 * Can be overriden via standard node-cache-manager options.
 * @method isCacheableValue
 * @param {String} value - The value to check
 * @return {Boolean} - Returns true if the value is cacheable, otherwise false.
 */
InfinispanClient.prototype.isCacheableValue = function (value) {
  if (this.options.isCacheableValue) {
    return this.options.isCacheableValue(value)
  }

  return value !== null && value !== undefined
}

/**
 * Returns the underlying dg client connection
 * @method getClient
 * @param {Function} cb - A callback that returns a potential error and an object containing the Redis client and a done method
 */
InfinispanClient.prototype.getClient = function (cb) {
  return cb(null, {
    client: this.infinispan
  })
}

/**
 * Returns all keys.
 * @method keys
 * @param {String} [pattern] - Has no use, retained for interface compat.
 * @param {Function} cb - A callback that returns a potential error and the response
 */
InfinispanClient.prototype.keys = function (pattern, cb) {
  if (typeof pattern === 'function') {
    cb = pattern
  }

  getKeys(this.clientPromise(), handleError(cb))
}

module.exports = {
  create: function (args) {
    return new InfinispanClient(args)
  }
}

function handleError (cb) {
  cb = cb || function () {}

  return function (err, resp) {
    if (!err) {
      return cb(null, resp)
    }

    return cb(err, resp)
  }
}

InfinispanClient.prototype.clientPromise = function() {

  if (this.infinispan) {
    return Promise.resolve(this.infinispan);
  } else {
      log("making a new one with " + JSON.stringify(this.options));
      return this.createClient(this.options);
  }
}

function getKeys (infinispan, cb) {
  var keyArray = []

  infinispan.iterator(100).then(function(it) {

    function loop(promise, fn) {
      // Simple recursive loop over iterator's next() call
      return promise.then(fn).then(function (entry) {
        return entry.done
          ? it.close().then(function () { return entry.key; })
          : loop(it.next(), fn);
      });
    }

    loop(it.next(), function (entry) {
      console.log('iterator.next()=' + JSON.stringify(entry));
      keyArray.push(entry.key);
      return entry;
    });

    cb(keyArray);
  });
}

  // memcached.items().then(function (items) {
  //   items.forEach(function (item) {
  //     keyLength += item.data.number

  //     memcached.cachedump(item.slab_id, item.data.number).then(function (dataSet) {
  //       dataSet.forEach(function (data) {
  //         if (data.key) {
  //           memcached.get(data.key).then(function (val) {
  //             if (val) {
  //               keyArray.push(data.key)
  //             }

  //             keyLength -= 1

  //             if (keyLength === 0) {
  //               cb(null, keyArray)
  //             }
  //           })
  //         }
  //       })
  //     })
  //   })
  // }).catch(function (err) {
  //   cb(err)
  // })
