var fs = require('fs');

module.exports = function(app, db_config) {
    fs.readdirSync(__dirname).forEach(function(file) {
        if (file == "index.js" || file.substr(file.lastIndexOf('.') + 1) !== 'js') return;
        var name = file.substr(0, file.indexOf('.'));
        require('./' + name)(app, db_config);
    });
}