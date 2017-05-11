import { configRedis, fetchMultiverseid } from '../index';

configRedis({ expire: 1, ignoreCache: false });

fetchMultiverseid(369041)
.then(
  (cardData) => {
    console.log(JSON.stringify(cardData, null, 2));
  }
)
.catch(err => { console.log(err); });
