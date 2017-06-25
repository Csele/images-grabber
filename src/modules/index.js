import Promise from 'bluebird';

import pixiv from './pixiv';
import twitter from './twitter';

function getImages({ type, link, all = false }) {
  switch (type) {
    case 'Twitter':
      return twitter.getImages(link);
    case 'Pixiv':
      return pixiv.getImages(link, all);
    default:
      return Promise.reject('Module not found!');
  }
}

function downloadImage({ type, path }, image) {
  switch (type) {
    case 'Twitter':
      return twitter.downloadImage(image, path);
    case 'Pixiv':
      return pixiv.downloadImage(image, path);
    default:
      return Promise.reject('Module not found!');
  }
}

export { getImages, downloadImage };
