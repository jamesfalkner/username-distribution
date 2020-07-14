/*!
 * Connect - DG
 */
var Infinispan = require('infinispan')
const log = require('barelog')


module.exports = function(session) {
    const Store = session.Store
    const config = require('../config')

    // All callbacks should have a noop if none provided for compatibility
    // with the most Redis clients.
    const noop = () => {}

    class InfinispanStore extends Store {
      constructor(options = {}) {
        super(options)
        // if (!options.client) {
        //   throw new Error('A client must be directly provided to the InfinispanStore')
        // }

        this.prefix = options.prefix == null ? 'sess:' : options.prefix
        this.scanCount = Number(options.scanCount) || 100
        this.serializer = options.serializer || JSON
       // this.client = options.client
        this.ttl = options.ttl || 86400 // One day in seconds.
        this.disableTouch = options.disableTouch || false

        var thisObj = this;
        log("---- intializing session cache with " + JSON.stringify(config.dg));
        Infinispan.client(config.dg, {cacheName: 'sessioncache'}).then((client) => {
           thisObj.client = client;
           log("---- intialized session cache");
          });

      }

      get(sid, cb = noop) {
        let key = this.prefix + sid

        this.client.get(key).then((data) => {
          if (!data) return cb()

          let result
          try {
            result = this.serializer.parse(data)
          } catch (err) {
            return cb(err)
          }
          return cb(null, result)
        }).catch(err => {
            return cb(err);
        })
      }

      set(sid, sess, cb = noop) {
        log("sid: " + sid + " sess: " + JSON.stringify(sess));
        let value
        try {
          value = this.serializer.stringify(sess)
        } catch (er) {
          return cb(er)
        }
        this.client.put(this.prefix + sid, value, {lifespan: this._getTTL(sess)}).then(() => {
            return cb();
        }).catch((err) => {
            return cb(err);
        });
      }

      touch(sid, sess, cb = noop) {
        log("TOUCH not implemented");

        return cb();
        // if (this.disableTouch) return cb()

        // let key = this.prefix + sid
        // this.client.expire(key, this._getTTL(sess), (err, ret) => {
        //   if (err) return cb(err)
        //   if (ret !== 1) return cb(null, 'EXPIRED')
        //   cb(null, 'OK')
        // })
      }

      destroy(sid, cb = noop) {
        let key = this.prefix + sid
        log("destroying session in cache with id " + key);
        this.client.remove(key).then(() => {
            return cb();
        }).catch((err) => {
            return cb(err);
        })
      }

      clear(cb = noop) {
        this.client.clear().then(() => {
            return cb();
        }).catch((err) => {
            cb(err);
        })
      }

      length(cb = noop) {

        this.client.size().then((size) => {
            return cb(null, size);
        }).catch((err) => {
            cb(err);
        });
      }

      all(cb = noop) {
          log("prefix: " + this.prefix);
        let prefixLen = this.prefix.length

        this._getAllKeys((err, keys) => {

            log("client all keys: " + JSON.stringify(keys));
          if (err) return cb(err)
          if (keys.length === 0) return cb(null, [])

          this.client.getAll(keys).then((sessions) => {
              log("client all sessions: " + JSON.stringify(sessions));
            let result = sessions.map((session) => {
                let res = this.serializer.parse(session.value);
                res.id = session.key.substr(prefixLen);
                return res;
            });

            return cb(null, result);
          }).catch((err) => {
            return cb(err);
          });
        })
      }

      _getTTL(sess) {
        let ttl
        if (sess && sess.cookie && sess.cookie.expires) {
          let ms = Number(new Date(sess.cookie.expires)) - Date.now()
          ttl = Math.ceil(ms / 1000)
        } else {
          ttl = this.ttl
        }
        return ttl + "s"
      }


      _getAllKeys(cb = noop) {
        var keyArray = []
        this.client.size().then((size) => {
            log("size: " + size);
        });

        this.client.iterator(100).then(function(it) {

          function loop(promise, fn) {
            // Simple recursive loop over iterator's next() call
            return promise.then(fn).then(function (entry) {
              return entry.done
                ? it.close().then(function () { return entry.value; })
                : loop(it.next(), fn);
            });
          }

          loop(it.next(), function (entry) {
            log('iterator.next()=' + JSON.stringify(entry));
            if (entry.key) keyArray.push(entry.key);
            return entry;
          }).then(() =>  {
            log("Returning keys: " + JSON.stringify(keyArray));
            return cb(null, keyArray);

          });

        }).catch((err) => {
            return cb(err);
        });
      }

    }

    return InfinispanStore
  }