import {fetchMultiverseid} from '../index';

//fetchCardList('Amonkhet').then(cardList => { console.log(cardList.length); });
fetchMultiverseid(369041)
.then(
  (cardData) => {
    console.log(JSON.stringify(cardData, null, 2));
  }
);
