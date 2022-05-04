class mssql {
    connecting = false;
    connected = false;
    mssql = null;
    _instance = null;
    _error = false;
    _error_msg = null;
    _count = 0;
    _lastInsertId = null;
    _lastQuery = null;

    constructor() {
        const sql = require('mssql')
        this.mssql = new sql.Request();
    }

    getInstance() {
        if (!isset(this._instance)) {
            this._instance = new mssql();
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

    lastInsertId() {
        return this._lastInsertId;
    }

    first() {
        return this._results[0]; // first data
    }

    last() {
        return this._results[this._results.length - 1]; // first data
    }

    async query(sql, params = {}) {
        try {
            this._error = false;
            this._error_msg = null;
            this._query = sql;

            for (const param in params) {
                if (typeof params[param] === "number" || typeof params[param] === "bigint") {
                    this._query = `${this._query}`.replace("?", `${params[param]}`);
                } else {
                    let value = params[param].trim();
                    this._query = `${this._query}`.replace("?", `'${value}'`);
                }
            }

            // console.log(this._query);
            const dataset = await this.execute(this._query).catch(error => {
                this._error = true;
                this._error_msg = error;
                this._results = []
                console.log(error);
            });
            // console.log(dataset);
            this._count = (dataset && dataset.recordset) ? dataset.recordset.length : 0;
            this._results = (dataset && dataset.recordset) ? dataset.recordset : [];
        } catch (error) {
            console.log(error)
        }
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

        const sql = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${values}) SELECT SCOPE_IDENTITY() as lastid`;
        await this.query(sql, fields);
        if (!this.error()) {
            this._lastInsertId = this._results[0].lastid;
            return true;
        }
        return false;
    }


    async delete(table, condition = "") {
        const sql = `DELETE FROM ${table} ${condition}`;
        await this.query(sql);
        if (!this.error()) {
            return true;
        }
        return false;
    }

    execute(sqlQuery) {
        this._lastQuery = sqlQuery;
        const vm = this;
        return new Promise(function(resolve, reject) {
            vm.mssql.query(sqlQuery).then(dataset => {
                if (dataset && dataset.recordset && dataset.recordset.length > 0) {
                    resolve(dataset)
                } else if (dataset && dataset.rowsAffected.length > 0) {
                    resolve(dataset)
                } else {
                    resolve([])
                }
            }).catch(error => {
                reject(error)
            });
        });
    }


}

module.exports = mssql;