const KEY = 'bf_theme';
/**
 * Espresso (dark) is the brand default. A warm light variant exists for staff who work in bright
 * rooms; the choice is a per-device convenience. Runs before paint so the theme never flashes.
 */
export const themeInitScript = `(function(){try{if(localStorage.getItem('${KEY}')==='light'){document.documentElement.dataset.theme='light';}}catch(e){}})();`;
