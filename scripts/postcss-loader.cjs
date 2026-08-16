const postcss = require("postcss");
const tailwindcss = require("@tailwindcss/postcss");

module.exports = function listenOsPostCssLoader(source) {
  const callback = this.async();

  postcss([tailwindcss()])
    .process(source, {
      from: this.resourcePath,
      map: false,
    })
    .then((result) => callback(null, result.css))
    .catch(callback);
};
