"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const ArSyncApi_1 = require("./ArSyncApi");
const ModelBatchRequest = {
    timer: null,
    apiRequests: {},
    fetch(api, query, id) {
        this.setTimer();
        return new Promise(resolve => {
            const queryJSON = JSON.stringify(query);
            const apiRequest = this.apiRequests[api] = this.apiRequests[api] || {};
            const queryRequests = apiRequest[queryJSON] = apiRequest[queryJSON] || { query, requests: {} };
            const request = queryRequests.requests[id] = queryRequests.requests[id] || { id, callbacks: [] };
            request.callbacks.push(resolve);
        });
    },
    batchFetch() {
        const { apiRequests } = this;
        for (const api in apiRequests) {
            const apiRequest = apiRequests[api];
            for (const { query, requests } of Object.values(apiRequest)) {
                const ids = Object.values(requests).map(({ id }) => id);
                ArSyncApi_1.default.syncFetch({ api, query, params: { ids } }).then((models) => {
                    for (const model of models)
                        requests[model.id].model = model;
                    for (const { model, callbacks } of Object.values(requests)) {
                        for (const callback of callbacks)
                            callback(model);
                    }
                });
            }
        }
        this.apiRequests = {};
    },
    setTimer() {
        if (this.timer)
            return;
        this.timer = setTimeout(() => {
            this.timer = null;
            this.batchFetch();
        }, 20);
    }
};
class ArSyncContainerBase {
    constructor() {
        this.listeners = [];
    }
    replaceData(_data, _sync_keys) { }
    initForReload(request) {
        this.networkSubscriber = ArSyncStore.connectionManager.subscribeNetwork((state) => {
            if (state) {
                ArSyncApi_1.default.syncFetch(request).then(data => {
                    if (this.data) {
                        this.replaceData(data);
                        if (this.onConnectionChange)
                            this.onConnectionChange(true);
                        if (this.onChange)
                            this.onChange([], this.data);
                    }
                });
            }
            else {
                if (this.onConnectionChange)
                    this.onConnectionChange(false);
            }
        });
    }
    release() {
        if (this.networkSubscriber)
            this.networkSubscriber.unsubscribe();
        this.unsubscribeAll();
        for (const child of Object.values(this.children)) {
            if (child)
                child.release();
        }
        this.data = null;
    }
    onChange(path, data) {
        if (this.parentModel)
            this.parentModel.onChange([this.parentKey, ...path], data);
    }
    subscribe(key, listener) {
        this.listeners.push(ArSyncStore.connectionManager.subscribe(key, listener));
    }
    unsubscribeAll() {
        for (const l of this.listeners)
            l.unsubscribe();
        this.listeners = [];
    }
    static compactQuery(query) {
        function compactAttributes(attributes) {
            const attrs = {};
            const keys = [];
            for (const key in attributes) {
                const c = compactQuery(attributes[key]);
                if (c === true) {
                    keys.push(key);
                }
                else {
                    attrs[key] = c;
                }
            }
            if (Object.keys(attrs).length === 0) {
                if (keys.length === 0)
                    return [true, false];
                if (keys.length === 1)
                    return [keys[0], false];
                return [keys];
            }
            const needsEscape = attrs['attributes'] || attrs['params'] || attrs['as'];
            if (keys.length === 0)
                return [attrs, needsEscape];
            return [[...keys, attrs], needsEscape];
        }
        function compactQuery(query) {
            if (!('attributes' in query))
                return true;
            const { as, params } = query;
            const [attributes, needsEscape] = compactAttributes(query.attributes);
            if (as == null && params == null) {
                if (needsEscape)
                    return { attributes };
                return attributes;
            }
            const result = {};
            if (as)
                result.as = as;
            if (params)
                result.params = params;
            if (attributes !== true)
                result.attributes = attributes;
            return result;
        }
        try {
            const result = compactQuery(query);
            return result === true ? {} : result;
        }
        catch (e) {
            throw JSON.stringify(query) + e.stack;
        }
    }
    static parseQuery(query, attrsonly) {
        const attributes = {};
        let column = null;
        let params = null;
        if (!query)
            query = [];
        if (query.constructor !== Array)
            query = [query];
        for (const arg of query) {
            if (typeof (arg) === 'string') {
                attributes[arg] = {};
            }
            else if (typeof (arg) === 'object') {
                for (const key in arg) {
                    const value = arg[key];
                    if (attrsonly) {
                        attributes[key] = this.parseQuery(value);
                        continue;
                    }
                    if (key === 'attributes') {
                        const child = this.parseQuery(value, true);
                        for (const k in child)
                            attributes[k] = child[k];
                    }
                    else if (key === 'as') {
                        column = value;
                    }
                    else if (key === 'params') {
                        params = value;
                    }
                    else {
                        attributes[key] = this.parseQuery(value);
                    }
                }
            }
        }
        if (attrsonly)
            return attributes;
        return { attributes, as: column, params };
    }
    static _load({ api, id, params, query }, root) {
        const parsedQuery = ArSyncRecord.parseQuery(query);
        const compactQuery = ArSyncRecord.compactQuery(parsedQuery);
        if (id) {
            return ModelBatchRequest.fetch(api, compactQuery, id).then(data => new ArSyncRecord(parsedQuery, data, null, root));
        }
        else {
            const request = { api, query: compactQuery, params };
            return ArSyncApi_1.default.syncFetch(request).then((response) => {
                if (response.collection && response.order) {
                    return new ArSyncCollection(response.sync_keys, 'collection', parsedQuery, response, request, root);
                }
                else if (response instanceof Array) {
                    return new ArSyncCollection([], '', parsedQuery, response, request, root);
                }
                else {
                    return new ArSyncRecord(parsedQuery, response, request, root);
                }
            });
        }
    }
    static load(apiParams, root) {
        if (!(apiParams instanceof Array))
            return this._load(apiParams, root);
        return new Promise((resolve, _reject) => {
            const resultModels = [];
            let countdown = apiParams.length;
            apiParams.forEach((param, i) => {
                this._load(param, root).then(model => {
                    resultModels[i] = model;
                    countdown--;
                    if (countdown === 0)
                        resolve(resultModels);
                });
            });
        });
    }
}
class ArSyncRecord extends ArSyncContainerBase {
    constructor(query, data, request, root) {
        super();
        this.root = root;
        if (request)
            this.initForReload(request);
        this.query = query;
        this.data = {};
        this.children = {};
        this.replaceData(data);
    }
    setSyncKeys(sync_keys) {
        this.sync_keys = sync_keys;
        if (!this.sync_keys) {
            this.sync_keys = [];
        }
    }
    replaceData(data) {
        this.setSyncKeys(data.sync_keys);
        this.unsubscribeAll();
        if (this.data.id !== data.id) {
            this.mark();
            this.data.id = data.id;
        }
        this.paths = [];
        for (const key in this.query.attributes) {
            const subQuery = this.query.attributes[key];
            const aliasName = subQuery.as || key;
            const subData = data[aliasName];
            const child = this.children[aliasName];
            if (key === 'sync_keys')
                continue;
            if (subData instanceof Array || (subData && subData.collection && subData.order)) {
                if (child) {
                    child.replaceData(subData, this.sync_keys);
                }
                else {
                    const collection = new ArSyncCollection(this.sync_keys, key, subQuery, subData, null, this.root);
                    this.mark();
                    this.children[aliasName] = collection;
                    this.data[aliasName] = collection.data;
                    collection.parentModel = this;
                    collection.parentKey = aliasName;
                }
            }
            else {
                if (subQuery.attributes && Object.keys(subQuery.attributes).length > 0)
                    this.paths.push(key);
                if (subData && subData.sync_keys) {
                    if (child) {
                        child.replaceData(subData);
                    }
                    else {
                        const model = new ArSyncRecord(subQuery, subData, null, this.root);
                        this.mark();
                        this.children[aliasName] = model;
                        this.data[aliasName] = model.data;
                        model.parentModel = this;
                        model.parentKey = aliasName;
                    }
                }
                else {
                    if (child) {
                        child.release();
                        delete this.children[aliasName];
                    }
                    if (this.data[aliasName] !== subData) {
                        this.mark();
                        this.data[aliasName] = subData;
                    }
                }
            }
        }
        if (this.query.attributes['*']) {
            for (const key in data) {
                if (!this.query.attributes[key] && this.data[key] !== data[key]) {
                    this.mark();
                    this.data[key] = data[key];
                }
            }
        }
        this.subscribeAll();
    }
    onNotify(notifyData, path) {
        const { action, class_name, id } = notifyData;
        const query = path && this.query.attributes[path];
        const aliasName = (query && query.as) || path;
        if (action === 'remove') {
            const child = this.children[aliasName];
            if (child)
                child.release();
            this.children[aliasName] = null;
            this.mark();
            this.data[aliasName] = null;
            this.onChange([aliasName], null);
        }
        else if (action === 'add') {
            if (this.data[aliasName] && this.data[aliasName].id === id)
                return;
            ModelBatchRequest.fetch(class_name, ArSyncRecord.compactQuery(query), id).then(data => {
                if (!data || !this.data)
                    return;
                const model = new ArSyncRecord(query, data, null, this.root);
                const child = this.children[aliasName];
                if (child)
                    child.release();
                this.children[aliasName] = model;
                this.mark();
                this.data[aliasName] = model.data;
                model.parentModel = this;
                model.parentKey = aliasName;
                this.onChange([aliasName], model.data);
            });
        }
        else {
            const { field } = notifyData;
            const query = field ? this.patchQuery(field) : this.reloadQuery();
            if (query)
                ModelBatchRequest.fetch(class_name, query, id).then(data => {
                    if (this.data)
                        this.update(data);
                });
        }
    }
    subscribeAll() {
        const callback = data => this.onNotify(data);
        for (const key of this.sync_keys) {
            this.subscribe(key, callback);
        }
        for (const path of this.paths) {
            const pathCallback = data => this.onNotify(data, path);
            for (const key of this.sync_keys)
                this.subscribe(key + path, pathCallback);
        }
    }
    patchQuery(key) {
        const val = this.query.attributes[key];
        if (!val)
            return;
        let { attributes, as, params } = val;
        if (attributes && Object.keys(val.attributes).length === 0)
            attributes = null;
        if (!attributes && !as && !params)
            return key;
        const result = {};
        if (attributes)
            result.attributes = attributes;
        if (as)
            result.as = as;
        if (params)
            result.params = params;
        return result;
    }
    reloadQuery() {
        if (this.reloadQueryCache)
            return this.reloadQueryCache;
        const reloadQuery = this.reloadQueryCache = { attributes: [] };
        for (const key in this.query.attributes) {
            if (key === 'sync_keys')
                continue;
            const val = this.query.attributes[key];
            if (!val || !val.attributes) {
                reloadQuery.attributes.push(key);
            }
            else if (!val.params && Object.keys(val.attributes).length === 0) {
                reloadQuery.attributes.push({ [key]: val });
            }
        }
        return reloadQuery;
    }
    update(data) {
        for (const key in data) {
            const subQuery = this.query.attributes[key];
            if (subQuery && subQuery.attributes && Object.keys(subQuery.attributes).length > 0)
                continue;
            if (this.data[key] === data[key])
                continue;
            this.mark();
            this.data[key] = data[key];
            this.onChange([key], data[key]);
        }
    }
    markAndSet(key, data) {
        this.mark();
        this.data[key] = data;
    }
    mark() {
        if (!this.root || !this.root.immutable || !Object.isFrozen(this.data))
            return;
        this.data = Object.assign({}, this.data);
        this.root.mark(this.data);
        if (this.parentModel)
            this.parentModel.markAndSet(this.parentKey, this.data);
    }
}
class ArSyncCollection extends ArSyncContainerBase {
    constructor(sync_keys, path, query, data, request, root) {
        super();
        this.order = { limit: null, mode: 'asc', key: 'id' };
        this.aliasOrderKey = 'id';
        this.root = root;
        this.path = path;
        this.query = query;
        this.compactQuery = ArSyncRecord.compactQuery(query);
        if (request)
            this.initForReload(request);
        if (query.params && (query.params.order || query.params.limit)) {
            this.setOrdering(query.params.limit, query.params.order);
        }
        this.data = [];
        this.children = [];
        this.replaceData(data, sync_keys);
    }
    setOrdering(limit, order) {
        let mode = 'asc';
        let key = 'id';
        if (order === 'asc' || order === 'desc') {
            mode = order;
        }
        else if (typeof order === 'object' && order) {
            const keys = Object.keys(order);
            if (keys.length > 1)
                throw 'multiple order keys are not supported';
            if (keys.length === 1)
                key = keys[0];
            mode = order[key] === 'asc' ? 'asc' : 'desc';
        }
        const limitNumber = (typeof limit === 'number') ? limit : null;
        if (limitNumber !== null && key !== 'id')
            throw 'limit with custom order key is not supported';
        const subQuery = this.query.attributes[key];
        this.aliasOrderKey = (subQuery && subQuery.as) || key;
        this.order = { limit: limitNumber, mode, key };
    }
    setSyncKeys(sync_keys) {
        if (sync_keys) {
            this.sync_keys = sync_keys.map(key => key + this.path);
        }
        else {
            this.sync_keys = [];
        }
    }
    replaceData(data, sync_keys) {
        this.setSyncKeys(sync_keys);
        const existings = {};
        for (const child of this.children)
            existings[child.data.id] = child;
        let collection;
        if ('collection' in data && 'order' in data) {
            collection = data.collection;
            this.setOrdering(data.order.limit, data.order.mode);
        }
        else {
            collection = data;
        }
        const newChildren = [];
        const newData = [];
        for (const subData of collection) {
            let model = null;
            if (typeof (subData) === 'object' && subData && 'id' in subData)
                model = existings[subData.id];
            let data = subData;
            if (model) {
                model.replaceData(subData);
            }
            else if (subData.id) {
                model = new ArSyncRecord(this.query, subData, null, this.root);
                model.parentModel = this;
                model.parentKey = subData.id;
            }
            if (model) {
                newChildren.push(model);
                data = model.data;
            }
            newData.push(data);
        }
        while (this.children.length) {
            const child = this.children.pop();
            if (!existings[child.data.id])
                child.release();
        }
        if (this.data.length || newChildren.length)
            this.mark();
        while (this.data.length)
            this.data.pop();
        for (const child of newChildren)
            this.children.push(child);
        for (const el of newData)
            this.data.push(el);
        this.subscribeAll();
    }
    consumeAdd(className, id) {
        if (this.data.findIndex(a => a.id === id) >= 0)
            return;
        if (this.order.limit === this.data.length) {
            if (this.order.mode === 'asc') {
                const last = this.data[this.data.length - 1];
                if (last && last.id < id)
                    return;
            }
            else {
                const last = this.data[this.data.length - 1];
                if (last && last.id > id)
                    return;
            }
        }
        ModelBatchRequest.fetch(className, this.compactQuery, id).then((data) => {
            if (!data || !this.data)
                return;
            const model = new ArSyncRecord(this.query, data, null, this.root);
            model.parentModel = this;
            model.parentKey = id;
            const overflow = this.order.limit && this.order.limit === this.data.length;
            let rmodel;
            this.mark();
            const orderKey = this.aliasOrderKey;
            if (this.order.mode === 'asc') {
                const last = this.data[this.data.length - 1];
                this.children.push(model);
                this.data.push(model.data);
                if (last && last[orderKey] > data[orderKey])
                    this.markAndSort();
                if (overflow) {
                    rmodel = this.children.shift();
                    rmodel.release();
                    this.data.shift();
                }
            }
            else {
                const first = this.data[0];
                this.children.unshift(model);
                this.data.unshift(model.data);
                if (first && first[orderKey] > data[orderKey])
                    this.markAndSort();
                if (overflow) {
                    rmodel = this.children.pop();
                    rmodel.release();
                    this.data.pop();
                }
            }
            this.onChange([model.id], model.data);
            if (rmodel)
                this.onChange([rmodel.id], null);
        });
    }
    markAndSort() {
        this.mark();
        const orderKey = this.aliasOrderKey;
        if (this.order.mode === 'asc') {
            this.children.sort((a, b) => a.data[orderKey] < b.data[orderKey] ? -1 : +1);
            this.data.sort((a, b) => a[orderKey] < b[orderKey] ? -1 : +1);
        }
        else {
            this.children.sort((a, b) => a.data[orderKey] > b.data[orderKey] ? -1 : +1);
            this.data.sort((a, b) => a[orderKey] > b[orderKey] ? -1 : +1);
        }
    }
    consumeRemove(id) {
        const idx = this.data.findIndex(a => a.id === id);
        if (idx < 0)
            return;
        this.mark();
        this.children[idx].release();
        this.children.splice(idx, 1);
        this.data.splice(idx, 1);
        this.onChange([id], null);
    }
    onNotify(notifyData) {
        if (notifyData.action === 'add') {
            this.consumeAdd(notifyData.class_name, notifyData.id);
        }
        else if (notifyData.action === 'remove') {
            this.consumeRemove(notifyData.id);
        }
    }
    subscribeAll() {
        const callback = data => this.onNotify(data);
        for (const key of this.sync_keys)
            this.subscribe(key, callback);
    }
    onChange(path, data) {
        super.onChange(path, data);
        if (path[1] === this.aliasOrderKey)
            this.markAndSort();
    }
    markAndSet(id, data) {
        this.mark();
        const idx = this.data.findIndex(a => a.id === id);
        if (idx >= 0)
            this.data[idx] = data;
    }
    mark() {
        if (!this.root || !this.root.immutable || !Object.isFrozen(this.data))
            return;
        this.data = [...this.data];
        this.root.mark(this.data);
        if (this.parentModel)
            this.parentModel.markAndSet(this.parentKey, this.data);
    }
}
class ArSyncStore {
    constructor(request, { immutable } = {}) {
        this.immutable = !!immutable;
        this.markedForFreezeObjects = [];
        this.changes = [];
        this.eventListeners = { events: {}, serial: 0 };
        this.request = request;
        this.complete = false;
        this.data = null;
        this.load(0);
    }
    load(retryCount) {
        ArSyncContainerBase.load(this.request, this).then((container) => {
            if (this.markForRelease) {
                container.release();
                return;
            }
            this.container = container;
            this.data = container.data;
            if (this.immutable)
                this.freezeRecursive(this.data);
            this.complete = true;
            this.notfound = false;
            this.trigger('load');
            this.trigger('change', { path: [], value: this.data });
            container.onChange = (path, value) => {
                this.changes.push({ path, value });
                this.setChangesBufferTimer();
            };
            container.onConnectionChange = state => {
                this.trigger('connection', state);
            };
        }).catch(e => {
            if (!e || e.retry === undefined)
                throw e;
            if (this.markForRelease)
                return;
            if (!e.retry) {
                this.complete = true;
                this.notfound = true;
                this.trigger('load');
                return;
            }
            const sleepSeconds = Math.min(Math.pow(2, retryCount), 30);
            this.retryLoadTimer = setTimeout(() => {
                this.retryLoadTimer = null;
                this.load(retryCount + 1);
            }, sleepSeconds * 1000);
        });
    }
    setChangesBufferTimer() {
        if (this.changesBufferTimer)
            return;
        this.changesBufferTimer = setTimeout(() => {
            this.changesBufferTimer = null;
            const changes = this.changes;
            this.changes = [];
            this.freezeMarked();
            this.data = this.container.data;
            changes.forEach(patch => this.trigger('change', patch));
        }, 20);
    }
    subscribe(event, callback) {
        let listeners = this.eventListeners.events[event];
        if (!listeners)
            this.eventListeners.events[event] = listeners = {};
        const id = this.eventListeners.serial++;
        listeners[id] = callback;
        return { unsubscribe: () => { delete listeners[id]; } };
    }
    trigger(event, arg) {
        const listeners = this.eventListeners.events[event];
        if (!listeners)
            return;
        for (const id in listeners)
            listeners[id](arg);
    }
    mark(object) {
        this.markedForFreezeObjects.push(object);
    }
    freezeRecursive(obj) {
        if (Object.isFrozen(obj))
            return obj;
        for (const key in obj)
            this.freezeRecursive(obj[key]);
        Object.freeze(obj);
    }
    freezeMarked() {
        this.markedForFreezeObjects.forEach(obj => this.freezeRecursive(obj));
        this.markedForFreezeObjects = [];
    }
    release() {
        if (this.retryLoadTimer)
            clearTimeout(this.retryLoadTimer);
        if (this.changesBufferTimer)
            clearTimeout(this.changesBufferTimer);
        if (this.container) {
            this.container.release();
        }
        else {
            this.markForRelease = true;
        }
    }
}
exports.default = ArSyncStore;
