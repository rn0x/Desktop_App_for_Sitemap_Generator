const validUrl = require('valid-url');
module.exports = (str) => {
  let isValid = validUrl.isUri(str);

  if(str.indexOf('{{') !== -1 || str.indexOf('%7B%7B') !== -1){
    isValid = false;
  }
  return isValid;
};

