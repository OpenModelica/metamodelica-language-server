// Code taken from https://github.com/TylerLeonhardt/wgetjs

var downloadUrl = 'https://github.com/OpenModelica/tree-sitter-metamodelica/releases/download/v0.3.0/tree-sitter-metamodelica.wasm';

var fs = require('fs'),
  request = require('request');

function wget(options, callback) {
  if (typeof options === 'string') {
    options  = { url: options };
  }
  options      = options  || {};
  callback     = callback || function (){};
  var src      = options.url || options.uri || options.src,
    parts    = src.split('/'),
    file     = parts[parts.length-1];
  parts        = file.split('?');
  file         = parts[0];
  parts        = file.split('#');
  file         = parts[0];
  options.dest = options.dest || './';
  if (options.dest.substr(options.dest.length-1,1) == '/') {
    options.dest = options.dest + file;
  }

  function handle_request_callback(err, res, body) {
    if (err) {
      callback(err);
    } else {
      var data = {
        filepath: options.dest
      };
      if (res && res.headers) {
        data.headers = res.headers;
      }
      callback(err, data, body);
    }
  }

  if (options.dry) {
    handle_request_callback(null, {}, { filepath: options.dest });
    return options.dest;
  } else {
    try {
      request(options, handle_request_callback).pipe(fs.createWriteStream(options.dest));
    } catch (err) {
      callback(err);
    }
  }
}

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
