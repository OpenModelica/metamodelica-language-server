const axios = require('axios');
const fs = require('fs');

var downloadUrl = 'https://github.com/OpenModelica/tree-sitter-metamodelica/releases/download/v0.3.0/tree-sitter-metamodelica.wasm';

axios.get(downloadUrl, {responseType: "stream"} )
.then(response => {
  response.data.pipe(fs.createWriteStream("tree-sitter-metamodelica.wasm"));
  console.log("Downloaded", downloadUrl);
})
.catch(error => {
  console.log(error);
});
