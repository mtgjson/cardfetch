import fetch from 'node-fetch';
import cheerio from 'cheerio';
import moment from 'moment';

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
    textParts.push(parseCardTextBlock(element));
  });

  return textParts.join('\n').trim();;
};

export const parseCardTextBlock = (element) => {
  let raw = cheerio(element).html();
  let parsedText = raw.replace(/<img[^>]*alt="([^"]*)"[^>]*>/g, '{$1}')
    .replace(/<\/?i>/g, '')
    .replace(/&#x2212;/g, '−')
    .replace(/&#x2019;/g, "'")
    .replace(/&quot;/g, '"')
    .trim();

  return parsedText;
}

export const parseCardSide = (sideElement) => {
  let sideId = cheerio('.rightCol', sideElement).attr('id');
  if (!sideId) return null;

  let $ = cheerio.load(sideElement);

  let idPrefix = sideId.replace('_rightCol', '');
  let returnValue = {};

  returnValue.name = $(`#${idPrefix}_nameRow .value`).text().trim();

  let manaSymbols = parseManaSymbols($(`#${idPrefix}_manaRow`));
  if (manaSymbols.length > 0) returnValue.manaSymbols = manaSymbols;

  let cmc = $(`#${idPrefix}_cmcRow .value`).text().trim();
  if (cmc) returnValue.cmc = cmc;
  returnValue.types = $(`#${idPrefix}_typeRow .value`).text().trim();

  let cardText = parseCardText($(`#${idPrefix}_textRow .value`));
  if (cardText) returnValue.text = cardText;

  returnValue.rarity = $(`#${idPrefix}_rarityRow .value`).text().trim();
  returnValue.number = $(`#${idPrefix}_numberRow .value`).text().trim();
  returnValue.artist = $(`#${idPrefix}_artistRow .value`).text().trim();
  returnValue.expansion = $(`#${idPrefix}_currentSetSymbol`).text().trim();
  returnValue.multiverseid = parseInt($(`#${idPrefix}_currentSetSymbol a`).first().attr('href').replace(/.*multiverseid=/, ''), 10);

  let flavorTextParts = [];
  $(`#${idPrefix}_flavorRow .value > *`).each((index, element) => {
    flavorTextParts.push($(element).text().trim());
  });
  let flavorText = flavorTextParts.join('\n').trim();
  if (flavorText) returnValue.flavor = flavorText;

  let ptRow = $(`#${idPrefix}_ptRow .value`);
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
  $(`#${idPrefix}_otherSetsValue a`).each((index, element) => {
    let multiverseid = parseInt($(element).attr('href').replace(/.*multiverseid=/, ''), 10);
    let setInfo = $('img', element).attr('src').match(/.*set=([^\&]*).*rarity=([^\&]*)/);
    let setName = $('img', element).attr('alt').replace(/ \([^)]*\)/, '');

    printingList.push({
      multiverseid: multiverseid,
      setCode: setInfo[1],
      rarity: setInfo[2],
      set: setName
    });
  });
  if (printingList.length > 0) returnValue.printings = printingList;

  let rulings = [];
  // Rulings
  $(`#${idPrefix}_rulingsContainer .post`).each((index, element) => {
    let elements = $('td', element);
    let rulingDate = elements.first().text().trim();
    let convertedRulingDate = moment(rulingDate, 'MM/DD/YYYY').format('YYYY-MM-DD');
    let rulingText = parseCardTextBlock(elements.last());
    rulings.push({
      date: convertedRulingDate,
      text: rulingText
    });
  });
  if (rulings) returnValue.rulings = rulings;

  return returnValue;
};

const fetchMultiverseidOracle = (multiverseid) => {
  let url = `http://gatherer.wizards.com/Pages/Card/Details.aspx?multiverseid=${multiverseid}`;

  return fetch(url)
    .then(response => response.text())
    .then(pageContents => {
      let $ = cheerio.load(pageContents);
      let returnValue = [];
      let cardTitle = $('#ctl00_ctl00_ctl00_MainContent_SubContent_SubContentHeader_subtitleDisplay').text().trim();

      $('.cardComponentContainer').each((index, cardComponent) => {
        let cardObject = parseCardSide(cardComponent);
        if (cardObject) {
          cardObject.title = cardTitle;
          returnValue.push(cardObject);
        }
      });

      return returnValue;
    })
    .catch(err => console.error(err));
}

const fetchMultiverseidPrinted = (multiverseid) => {
  let url = `http://gatherer.wizards.com/Pages/Card/Details.aspx?multiverseid=${multiverseid}&printed=true`;

  return fetch(url)
    .then(response => response.text())
    .then(pageContents => {
      let $ = cheerio.load(pageContents);
      let returnValue = [];
      let cardTitle = $('#ctl00_ctl00_ctl00_MainContent_SubContent_SubContentHeader_subtitleDisplay').text().trim();

      $('.cardComponentContainer').each((index, cardComponent) => {
        let cardObject = parseCardSide(cardComponent);
        if (cardObject) {
          cardObject.title = cardTitle;
          returnValue.push(cardObject);
        }
      });

      return returnValue;
    })
    .catch(err => console.error(err));
}

export const fetchMultiverseid = (multiverseid) => {
  let cardInfo = null;

  return new Promise((accept, reject) => {
    fetchMultiverseidOracle(multiverseid)
      .then(response => {
        cardInfo = response;
        return fetchMultiverseidPrinted(multiverseid);
      })
      .then(response => {
        response.forEach(cardPrintedInfo => {
          cardInfo.forEach(returnInfo => {
            if (returnInfo.number === cardPrintedInfo.number) returnInfo.printed = cardPrintedInfo;
          });
        });
      })
      .then(() => {
        accept(cardInfo);
      });
  });
}
