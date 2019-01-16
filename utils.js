const toArrayBuffer = (bin) => {
    var len = bin.length;
    var bytes = new Uint8Array(len);
    for (var i = 0; i < len; i++) {
        bytes[i] = bin.charCodeAt(i);
    }
    return bytes.buffer;
};

export { toArrayBuffer };
