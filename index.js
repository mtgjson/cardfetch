import fetch from 'node-fetch';
import cheerio from 'cheerio';

export const parseManaSymbols = (parentElement) => {
  let manaSymbols = [];
  cheerio('img', parentElement).each((index, manaLink) => {
    manaSymbols.push(cheerio(manaLink).attr('alt'));
  });
  return manaSymbols
};

/*
  Parses a single card line from gatherer compact output
 */
export const parseCardItem = (cardElement) => {
  let returnValue = {};

  returnValue.multiverseid = parseInt(cheerio('.name a', cardElement).attr('href').replace(/.*multiverseid=/, ''), 10);
  returnValue.name = cheerio('.name', cardElement).text().trim();
  returnValue.type = cheerio('.type', cardElement).text().trim();

  let manaSymbols = parseManaSymbols(cheerio('.mana', cardElement));
  if (manaSymbols.length > 0) returnValue.manaSymbols = manaSymbols;

  let numericals = [];
  cheerio('.numerical', cardElement).each((index, numericalElement) => {
    numericals.push(cheerio(numericalElement).text().trim());
  });

  if (numericals[1] !== '') {
    if (numericals[0] != '') {
      returnValue.power = numericals[0];
      returnValue.toughness = numericals[1];
    } else {
      returnValue.loyalty = numericals[1];
    }
  }

  returnValue.printings = [];
  cheerio('.printings a', cardElement).each((index, printingElement) => {
    let href = cheerio(printingElement).attr('href');
    let src = cheerio('img', printingElement).first().attr('src');
    let alt = cheerio('img', printingElement).first().attr('alt');

    returnValue.printings.push({
      set: alt,
      rarity: src.replace(/.*rarity=/, ''),
      multiverseid: parseInt(href.replace(/.*multiverseid=/, ''))
    });
  });

  return returnValue;
};

export const fetchCardList = (setName) => {
  let returnValue = [];
  let maxPage = 1;
  let currentPage = 1;

  const fetchAtPage = (pageNumber) => {
    let url = `http://gatherer.wizards.com/Pages/Search/Default.aspx?output=compact&set=%5b%22${setName}%22%5d&page=${pageNumber}`;
    console.log('fetching %s', url);
    return fetch(url)
      .then(response => response.text())
      .then(
        (pageContents) => {
          let cardList = [];

          let $ = cheerio.load(pageContents);
          $('.cardItem').each((index, cardElement) => {
            cardList.push(parseCardItem(cardElement));
          });

          $('.pagingcontrols a').each((index, linkElement) => {
            let pageNumber = parseInt(cheerio(linkElement).text().trim(), 10);
            if (pageNumber > maxPage) maxPage = pageNumber;
          });

          return cardList;
        }
      )
      .catch(err => console.error(err));
  };

  return new Promise((accept, reject) => {
    const fetch = () => {
      return fetchAtPage(currentPage)
        .then(cardList => {
          returnValue = [...returnValue, ...cardList];
          currentPage++;
        })
        .then(() => {
          if (currentPage <= maxPage) fetch(currentPage);
          else accept(returnValue);
        });
    };

    fetch();
  });
};

export const parseCardText = (cardTextElement) => {
  let textParts = [];

  cheerio(' > *', cardTextElement).each((index, element) => {
    let raw = cheerio(element).html();
    textParts.push(raw.replace(/<img[^>]*alt="([^"]*)"[^>]*>/g, '{$1}'));
  });

  let textReturn = textParts.join('\n').trim()
    .replace(/&#x2212;/g, '−')
    .replace(/&quot;/g, '"');

  return textReturn;
};

export const parseCardSide = (sideElement) => {
  let sideId = cheerio('.rightCol', sideElement).attr('id');
  if (!sideId) return null;

  let idPrefix = sideId.replace('_rightCol', '');
  let returnValue = {};

  returnValue.name = cheerio(`#${idPrefix}_nameRow .value`, sideElement).text().trim();

  let manaSymbols = parseManaSymbols(cheerio(`#${idPrefix}_manaRow`, sideElement));
  if (manaSymbols.length > 0) returnValue.manaSymbols = manaSymbols;

  let cmc = cheerio(`#${idPrefix}_cmcRow .value`, sideElement).text().trim();
  if (cmc) returnValue.cmc = cmc;
  returnValue.types = cheerio(`#${idPrefix}_typeRow .value`, sideElement).text().trim();

  let cardText = parseCardText(cheerio(`#${idPrefix}_textRow .value`, sideElement));
  if (cardText) returnValue.text = cardText;

  returnValue.rarity = cheerio(`#${idPrefix}_rarityRow .value`, sideElement).text().trim();
  returnValue.number = cheerio(`#${idPrefix}_numberRow .value`, sideElement).text().trim();
  returnValue.artist = cheerio(`#${idPrefix}_artistRow .value`, sideElement).text().trim();
  returnValue.expansion = cheerio(`#${idPrefix}_currentSetSymbol`, sideElement).text().trim();
  returnValue.multiverseid = parseInt(cheerio(`#${idPrefix}_currentSetSymbol a`, sideElement).first().attr('href').replace(/.*multiverseid=/, ''), 10);

  let flavorTextParts = [];
  cheerio(`#${idPrefix}_flavorRow .value > *`, sideElement).each((index, element) => {
    flavorTextParts.push(cheerio(element).text().trim());
  });
  let flavorText = flavorTextParts.join('\n').trim();
  if (flavorText) returnValue.flavor = flavorText;

  let ptRow = cheerio(`#${idPrefix}_ptRow .value`, sideElement);
  if (ptRow) ptRow = ptRow.text().trim();
  if (ptRow) {
    if (ptRow.indexOf('/') >= 0) {
      let pt = ptRow.split('/');
      returnValue.power = pt[0].trim();
      returnValue.toughness = pt[1].trim();
    } else {
      returnValue.loyalty = ptRow;
    }
  }

  let printingList = [];
  cheerio(`#${idPrefix}_otherSetsValue a`, sideElement).each((index, element) => {
    let multiverseid = parseInt(cheerio(element).attr('href').replace(/.*multiverseid=/, ''), 10);
    let setInfo = cheerio('img', element).attr('src').match(/.*set=([^\&]*).*rarity=([^\&]*)/);
    let setName = cheerio('img', element).attr('alt').replace(/ \([^)]*\)/, '');

    printingList.push({
      multiverseid: multiverseid,
      setCode: setInfo[1],
      rarity: setInfo[2],
      set: setName
    });
  });
  if (printingList.length > 0) returnValue.printings = printingList;

  return returnValue;
};

export const fetchMultiverseid = (multiverseid) => {
  let url = `http://gatherer.wizards.com/Pages/Card/Details.aspx?multiverseid=${multiverseid}`;

  return fetch(url)
    .then(response => response.text())
    .then(pageContents => {
      let $ = cheerio.load(pageContents);
      let returnValue = [];
      $('.cardComponentContainer').each((index, cardComponent) => {
        returnValue.push(parseCardSide(cardComponent));
      });

      return returnValue.filter(element => !!element);
    })
    .catch(err => console.error(err));
}
