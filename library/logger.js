var fs = require('fs');
var path = require("path");

function getDate() {
    var d = new Date(),
        month = '' + (d.getMonth() + 1),
        day = '' + d.getDate(),
        year = d.getFullYear();

    if (month.length < 2)
        month = '0' + month;
    if (day.length < 2)
        day = '0' + day;

    return [year, month, day].join('');
}

// Create a helper function
async function moveFile(oldPath, newPath) {
    // 1. Create the destination directory if it does not exist
    // Set the `recursive` option to `true` to create all the subdirectories
    await fs.mkdir(path.dirname(newPath), { recursive: true }, () => {});
    // 2. Rename the file (move it to the new directory)
    // Return the promise
    return fs.rename(oldPath, newPath, () => {});
}

module.exports = function(req, res, next) {
    //move old files
    fs.readdirSync("./logs/").forEach(file => {
        var extension = path.extname(file);
        var oldFile = path.basename(file, extension);
        if (Number(oldFile) < Number(getDate())) {
            moveFile(`./logs/${file}`, `./logs/backup/${file}`)
                .then(() => {})
                .catch(console.error);
        }
    });

    let data = `REQUEST TIME:  ${new Date().toLocaleString()} \n`;
    data += `${req.method} ${req.url} HTTP/${req.httpVersion}\n\nHTTP headers:\n`;

    for (const name in req.headers) {
        data += `${name}: ${req.headers[name]}\n`;
    }

    data += "\nRequest body:\n";
    data += JSON.stringify(req.body) + "\n";
    data += "** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** END ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** \n\n";

    if (!req.url.toLowerCase().includes("JOBS".toLowerCase())) {
        fs.appendFile(`./logs/${getDate()}.log`, data, function(err) {
            if (err) throw err;
        });
    }
    next()
}