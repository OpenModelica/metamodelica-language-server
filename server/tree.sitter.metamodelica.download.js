var wget = require('node-wget');
var downloadUrl = 'https://github.com/OpenModelica/tree-sitter-metamodelica/releases/download/v0.3.0/tree-sitter-metamodelica.wasm';

wget({
  url:  downloadUrl,
  dest: 'src/',      // destination path or path with filenname, default is ./
  timeout: 5000       // duration to wait for request fulfillment in milliseconds, default is 2 seconds
  },
  function (error, response, body) {
    if (error) {
      console.log('--- error:');
      console.log(error);            // error encountered
    } else {
      console.log('Downloaded', downloadUrl);
    }
  }
);
