class encryption {
    constructor() {
        this.bcrypt = require('bcrypt');
    }

    hash(text) {
        const vm = this;
        return new Promise(function(resolve, reject) {
            vm.bcrypt.hash(text, 10, function(err, hash) {
                if (err) reject(err);
                resolve(hash);
            });
        });
    }

    async compare(password, hash) {
        return await this.bcrypt.compare(password, hash);
    }
}

module.exports = encryption;