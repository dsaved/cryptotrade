var mysql = require('mysql');
var pool;
var fs = require('fs')
var path = require('path')
const configPath = path.join(process.cwd(), 'config.json');
fs.readFile(configPath, async(error, configuration) => {
    pool = mysql.createPool(JSON.parse(configuration).db_config);
    exports.pool = pool;
});