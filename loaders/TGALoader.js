import { LoadingManager } from '../three.module.js';

class TGALoader {
    constructor(manager = LoadingManager) {
        this.manager = manager;
        this.path = '';
    }

    setPath(path) {
        this.path = path || '';
        return this;
    }

    load(url, onLoad, _onProgress, onError) {
        const resolved = this.path ? `${this.path}${url}` : url;
        const err = new Error(`TGALoader is not implemented. Failed to load ${resolved}`);
        if (onError) {
            onError(err);
            return;
        }
        if (onLoad) {
            onLoad(null);
        }
    }
}

export { TGALoader };
