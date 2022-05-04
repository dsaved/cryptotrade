var fs = require('fs');
// ========
module.exports = {
    // socket configurations
    configs: {
        isSecure: false, //set to true to use certs in https connection
        socket_port: 8378,
        torConfig: {
            host: "localhost",
            port: 9050,
            controlPort: 9051,
            password: 'salvationboy@zuzu1',
        },
        cert: {
            key: fs.readFileSync(process.cwd() + '\\cert\\private.key', 'utf8'),
            cert: fs.readFileSync(process.cwd() + '\\cert\\certificate.crt', 'utf8'),
            ca: fs.readFileSync(process.cwd() + '\\cert\\ca_bundle.crt', 'utf8')
        },
        file_system: fs,
        //email config
        email: {
            host: "server-host",
            port: 465,
            secure: true, // true for 465, false for other ports
            auth: {
                user: "email@company.com",
                pass: "password",
            },
            sender: '"sender name" <email@company.com>',
        },
    },
};