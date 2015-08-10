//require system modules
var fs = require('fs');
var exec = require('child_process').execSync;
var execFileSync = require('child_process').execFileSync;
var spawn = require('child_process').spawn;
var assert = require('assert');
require('tty').setRawMode(true);

console.log("copy begins...");

var executor = spawn("scp", ["-r", ".deploy/tmp/paesidisandalmazzo.tar.gz", "igor@cinnamom:/home/igor"]);

function indata(c) {
    executor.stdin.write(c);
}
function outdata(c) {
    process.stdout.write(c);
}

process.stdin.resume();
process.stdin.on('data', indata);
executor.stdout.on('data', outdata);

executor.on('exit', function(code) {
	tty.setRawMode(false);
	executor.stdout.removeListener('data', outdata);
    if (code !== 0) {
        console.log('Failed: ' + code);
    }
});