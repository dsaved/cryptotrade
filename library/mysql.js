class mysql {
    connecting = false;
    connected = false;
    db_config = null;
    _instance = null;
    _error = false;
    _error_msg = null;
    _count = 0;
    _lastQuery = null;

    constructor(db_config) {
        this.db_config = db_config;
    }

    getInstance(db_config) {
        if (!isset(this._instance)) {
            this._instance = new mysql(db_config);
        }
        return this._instance;
    }

    results() {
        return this._results;
    }

    count() {
        return this._count;
    }

    error() {
        return this._error;
    }

    error_msg() {
        return this._error_msg;
    }

    lastQuery() {
        return this._lastQuery;
    }

    async query(sql, params = {}) {
        this._error = false;
        this._error_msg = null;
        this._query = sql;

        for (const param in params) {
            // console.log(param, params[param], typeof params[param])
            if (typeof params[param] === "number" || typeof params[param] === "bigint") {
                this._query = `${this._query}`.replace("?", `${params[param]}`);
            } else {
                let value = params[param].trim();
                this._query = `${this._query}`.replace("?", `'${value}'`);
            }
        }

        // console.log(this._query)
        const dataset = await this.execute(this._query).catch(error => {
            console.log(error)
            this._error = true;
            this._error_msg = error;
            this._results = []
        });
        this._count = (dataset) ? dataset.length : 0;
        this._results = (dataset) ? dataset : [];
    }

    async update(table, colume, identifiyer, fields = {}) {
        const keys = Object.keys(fields);
        let set = '';
        let x = 1;

        for (const name in fields) {
            set += `${name} = ? `;
            if (x < keys.length) {
                set += ', ';
            }
            x++;
        }

        let sql = "";
        if (typeof identifiyer === "number" || typeof identifiyer === "bigint") {
            sql = `UPDATE ${table} SET ${set} WHERE ${colume} = ${identifiyer}`;
        } else {
            sql = `UPDATE ${table} SET ${set} WHERE ${colume} = '${identifiyer}'`;
        }
        await this.query(sql, fields);
        const result = this.error()
        if (!result) {
            return true;
        }
        return false;
    }

    async delete(table, whereClause) {
        await this.query(`DELETE FROM ${table} ${whereClause}`);
        const result = this.error()
        if (!result) {
            return true;
        }
        return false;
    }

    async insert(table, fields = {}) {
            const keys = Object.keys(fields);
            let values = '';
            let x = 1;

            for (const name in fields) {
                values += `?`;
                if (x < keys.length) {
                    values += ', ';
                }
                x++;
            }

            const sql = `INSERT INTO \`${table}\` (\`${keys.join('\`, \`')}\`) VALUES (${values}) `;
        await this.query(sql, fields);
        if (!this.error()) {
            return true;
        }
        return false;
    }

    execute(sqlQuery) {
        this._lastQuery = sqlQuery;
        const vm = this;
        return new Promise(function (resolve, reject) {
            const mysqlOBJ = require('mysql')
            var connection = mysqlOBJ.createConnection(vm.db_config);
            connection.connect();
            connection.query(sqlQuery, function (error, dataset, fields) {
                if (error) {
                    reject(error);
                } else {
                    if (dataset && dataset.length > 0) {
                        resolve(dataset)
                    } 
                    // else if (dataset && dataset.rowsAffected.length > 0) {
                    //     resolve(dataset)
                    // } 
                    else {
                        resolve([])
                    }
                }
            });
            connection.end();
        });
    }
}

module.exports = mysql;