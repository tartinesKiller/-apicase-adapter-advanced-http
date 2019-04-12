import { toArrayBuffer } from "./utils";

const pathToRegexp = require("path-to-regexp");

var _FormData = typeof FormData !== "undefined" ? FormData : function () {};

const parseUrl = url => {
    let origin = "";
    let pathname = "";
    if (url.indexOf("://") > -1) {
        const res = url.match("(^(?:(?:.*?)?//)?[^/?#;]*)(.*)");
        origin = res[1];
        pathname = res[2];
    } else {
        pathname = url;
    }
    return { origin, pathname };
};

const compilePath = (url, params) => pathToRegexp.compile(url)(params);

const uriReducer = (res = [], [key, val]) =>
    res.concat(
        Array.isArray(val)
            ? val.reduce((res, val, i) => uriReducer(res, [`${key}[]`, val]), [])
            : typeof val === "object"
                ? Object.entries(val).reduce(
                    (res, [i, val]) => uriReducer(res, [`${key}[${i}]`, val]),
                    []
                )
                : `${encodeURIComponent(key)}=${encodeURIComponent(val)}`
    );

const withQuestion = res => (res.length && `?${res}`) || "";

const buildQueryString = payload =>
    withQuestion(
        typeof payload === "string"
            ? payload
            : Object.entries(payload)
                .reduce(uriReducer, [])
                .join("&")
    );

const defaultStatusValidator = status => status >= 200 && status < 300;

const prepareBody = body => body;

const createResponse = res => body => ({
    status: res.status,
    headers: Array.from(res.headers).reduce((res, pair) => {
        res[pair[0]] = pair[1];
        return res;
    }, {}),
    body: body,
});

export default {
    createState: () => ({
        status: null,
        headers: null,
        body: null,
    }),

    callback ({ emit, payload, resolve, reject, setCancelCallback }) {
        if (payload.controller) {
            setCancelCallback(payload.controller.abort);
        }

        const cbs = { resolve, reject };

        const done = res => {
            return new Promise((resolve, reject) => {
                const isValid = payload.validateStatus(res.status);
                const responseWith = createResponse(res);

                const callback = isValid ? "resolve" : "reject";
                const parser = payload.parser[isValid ? "done" : "fail"];

                if (parser === "arrayBuffer") {
                    const arr = toArrayBuffer(res.data);
                    cbs[callback](responseWith(arr));
                } else {
                    try {
                        const parsedBody = res.data ? JSON.parse(res.data) : res.data;
                        cbs[callback](responseWith(parsedBody));
                    } catch (err) {
                        emit("error", err);
                        cbs[callback](responseWith(res.data));
                    }
                }
            });
        };

        const fail = err => {
            throw err;
        };

        const res = new Promise(async (resolve, reject) => {
            window.cordova.plugin.http.setDataSerializer("json");
            window.cordova.plugin.http.sendRequest(payload.url, payload.options, resp => {
                resolve(resp);
            }, err => {
                resolve(err);
            });
        });
        return res
            .then(done)
            .catch(function (err) {
                fail(err);
                if (err instanceof Error && err.name !== "AbortError") {
                    throw err;
                }
            });
    },

    convert (payload) {
        let controller;
        try {
            controller = new AbortController();
        } catch (err) {}
        const { origin, pathname } = parseUrl(payload.url);
        const res = {
            url: origin + compilePath(pathname, payload.params || {}),
            parser: (payload.parser &&
        (typeof payload.parser === "string"
            ? { done: payload.parser, fail: payload.parser }
            : payload.parser)) || { done: "json", fail: "json" },
            controller: controller,
            validateStatus: payload.validateStatus || defaultStatusValidator,
            options: {
                method: payload.method || "GET",
                headers: payload.headers || {},
            },
        };
        if (payload.query) {
            res.url += buildQueryString(payload.query);
        }
        if (payload.body) {
            res.options.data = (payload.prepareBody || prepareBody)(payload.body);
        }
        if (
            typeof payload.body === "object" &&
      !(payload.body instanceof _FormData)
        ) {
            res.options.headers["Content-Type"] = "application/json";
        }
        if (controller) {
            res.options.signal = controller.signal;
        }
        return res;
    },

    merge (from, to) {
        const res = Object.assign({}, from, to);
        if (to.url !== undefined && from.url !== undefined) {
            res.url = to.url[0] === "/" ? to.url : [from.url, to.url].join("/");
        }
        return res;
    },
};
