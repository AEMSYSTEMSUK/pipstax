type Listener = (count: number) => void;

let loadingCount = 0;
const listeners = new Set<Listener>();

export const subscribeLoading = (listener: Listener) => {
    listeners.add(listener);
    listener(loadingCount);
    return () => {
        listeners.delete(listener);
    };
};

export const startLoading = () => {
    loadingCount += 1;
    listeners.forEach((cb) => cb(loadingCount));
};

export const stopLoading = () => {
    loadingCount = Math.max(0, loadingCount - 1);
    listeners.forEach((cb) => cb(loadingCount));
};
