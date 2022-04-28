module.exports = (code) => {
  const langs = {
    'es': ['espanol', 'Espanol', 'spanish', 'es', 'ES'],
    'en': ['english', 'English', 'en', 'EN'],
    'fr': ['french', 'French', 'fr', 'FR']
  };
  return langs[code] ? langs[code] : [];
};
