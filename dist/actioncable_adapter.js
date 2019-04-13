"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const actioncable_1 = require("actioncable");
class ArSyncActionCableAdapter {
    constructor() {
        this.connected = true;
        this.subscribe(Math.random(), () => { });
    }
    subscribe(key, received) {
        const disconnected = () => {
            if (!this.connected)
                return;
            this.connected = false;
            this.ondisconnect();
        };
        const connected = () => {
            if (this.connected)
                return;
            this.connected = true;
            this.onreconnect();
        };
        if (!this._cable)
            this._cable = actioncable_1.default.createConsumer();
        return this._cable.subscriptions.create({ channel: 'SyncChannel', key }, { received, disconnected, connected });
    }
    ondisconnect() { }
    onreconnect() { }
}
exports.default = ArSyncActionCableAdapter;
