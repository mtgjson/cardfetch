import fetch from 'node-fetch';
import redis from 'redis';

let defaultRedisConfig = {
  host: '127.0.0.1',
  port: 6379,
  ignoreCache: false
};

let redisConfig = null;

export const configRedis = (data) => {
  if (data === null) {
    redisConfig = null;
    return null;
  }

  redisConfig = {
    ...defaultRedisConfig,
    ...data
  };

  return redisConfig;
}

const retrieveAndSave = (url, redisClient) => {
  return fetch(url)
    .then(response => response.text())
    .then(pageData => {
      redisClient.set(url, pageData);
      if (redisConfig.expire !== undefined) redisClient.setex(url, parseInt((+new Date)/1000) + redisConfig.expire);

      return pageData;
    });
};

export const fetchCachedUrl = (url) => {
  if (!redisConfig) return fetch(url).then(response => response.text());

  return new Promise((accept, reject) => {
    let client = redis.createClient(redisConfig);
    client.on('connect', () => {
      if (redisConfig.ignoreCache) {
        retrieveAndSave(url, client)
          .then(response => {
            client.quit();
            accept(response);
          })
          .catch(reject);
      } else {
        client.get(url, (err, reply) => {
          if (reply) {
            accept(reply);
            client.quit();
            return;
          }

          retrieveAndSave(url, client)
            .then(response => {
              client.quit();
              accept(response);
            })
            .catch(reject);
        });
      }
    });
    client.on('error', err => { reject(err); });
  });
};
