import axios from 'axios';
import { createWriteStream } from 'fs';

var downloadUrl = 'https://github.com/OpenModelica/tree-sitter-metamodelica/releases/download/v0.3.0/tree-sitter-metamodelica.wasm';

axios
  .get(downloadUrl, {responseType: "stream"} )
  .then(response => {
    response.data.pipe(createWriteStream("tree-sitter-metamodelica.wasm"));
    console.log("Downloaded", downloadUrl);
  })
  .catch(error => {
    console.log(error);
  });
