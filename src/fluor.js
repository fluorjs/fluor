var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
const TEXT_NODE_OWNERS = new WeakMap();
const VARIABLE_PREFIX = "fluor$";
const VARIABLE_PREFIX_LENGTH = VARIABLE_PREFIX.length;
export default function Fluor(selector, fluorScript) {
    const matchingNodes = $$(selector || document.body);
    const componentRegistry = new WeakMap([...matchingNodes].map((n) => [n, new Set()]));
    for (const node of matchingNodes) {
        registerComponent(componentRegistry, node, fluorScript);
    }
    // If no selector is given we attach the component on the body so there is
    // no need to watch for added nodes matching the selector.
    if (!selector) {
        return;
    }
    const observer = new MutationObserver((mutationList) => {
        var _a, _b;
        for (const mutation of mutationList) {
            const mutatedNodes = mutation.type === "attributes" ? [mutation.target] : mutation.addedNodes;
            for (const node of mutatedNodes) {
                const nodeComponents = componentRegistry.get(node);
                if (!nodeComponents && ((_a = node.matches) === null || _a === void 0 ? void 0 : _a.call(node, selector))) {
                    componentRegistry.set(node, new Set());
                    registerComponent(componentRegistry, node, fluorScript);
                }
                if (nodeComponents && !((_b = node.matches) === null || _b === void 0 ? void 0 : _b.call(node, selector))) {
                    for (const component of nodeComponents) {
                        if (component.$fluorScript === fluorScript) {
                            nodeComponents.delete(component);
                            component.destroy();
                        }
                    }
                }
            }
        }
    });
    observer.observe(document.body, {
        attributes: true,
        childList: true,
        subtree: true,
    });
}
function registerComponent(registry, node, fluorScript) {
    return __awaiter(this, void 0, void 0, function* () {
        const component = yield createComponent(node, fluorScript);
        const nodeComponents = registry.get(node);
        nodeComponents.add(component);
        component.render();
    });
}
export function init() {
    return __awaiter(this, void 0, void 0, function* () {
        const PUBLIC_API = Object.keys(yield createComponent());
        yield new Promise((resolve) => {
            if (document.readyState == "loading") {
                document.addEventListener("DOMContentLoaded", resolve);
            }
            else {
                resolve();
            }
        });
        window.Fluor = Fluor;
        const fluorScriptTags = $$("script[type=fluor]");
        for (const fluorScript of fluorScriptTags) {
            const selector = fluorScript.dataset.fluorSelector;
            const scriptTag = document.createElement("script");
            if (fluorScript.hasAttribute("src")) {
                try {
                    const scriptUrl = fluorScript.getAttribute("src");
                    const response = yield fetch(scriptUrl);
                    if (response.status >= 400) {
                        throw new Error(`Unable to load Fluor script at ${scriptUrl}`);
                    }
                    const remoteScript = yield response.text();
                    setTextContent(fluorScript, remoteScript);
                }
                catch (error) {
                    setTextContent(fluorScript, `console.error(${JSON.stringify(error.message)})`);
                }
            }
            setTextContent(scriptTag, `Fluor(${JSON.stringify(selector)}, async ({${PUBLIC_API.join(",")}}) => {${fluorScript.textContent}})`);
            fluorScript.parentNode.removeChild(fluorScript);
            document.body.appendChild(scriptTag);
        }
    });
}
const shouldInit = new URL(import.meta.url).searchParams.has("init");
if (shouldInit) {
    init();
}
function createComponent(rootNode, fluorScript = null) {
    var _a;
    return __awaiter(this, void 0, void 0, function* () {
        const abortController = new AbortController();
        const bindings = {};
        const dependencyMap = new Map();
        function get(variable) {
            return variable === null || variable === void 0 ? void 0 : variable.value;
        }
        function destroy() {
            abortController.abort();
        }
        function render() {
            return __awaiter(this, void 0, void 0, function* () {
                yield walk(rootNode, (element, queue) => {
                    const textContent = element.textContent;
                    switch (element.nodeType) {
                        case Node.TEXT_NODE: {
                            const owner = TEXT_NODE_OWNERS.get(element);
                            // If the current node is a parent of the text node owner, ignore it
                            if (owner && owner !== rootNode && rootNode.contains(owner)) {
                                break;
                            }
                            // If the text node is unclaimed or owned by a parent, claim it
                            if (!owner || owner.contains(rootNode)) {
                                TEXT_NODE_OWNERS.set(element, rootNode);
                            }
                            // If we have unparsed interpolations, parse them
                            if (textContent.match(/{{([^}]+)}}/g)) {
                                const nodes = textContent
                                    .split(/(?:{{|}})/g)
                                    .reduce((nodes, currentText, index) => {
                                    return [
                                        ...nodes,
                                        index % 2 === 1
                                            ? new Comment(VARIABLE_PREFIX + currentText)
                                            : false,
                                        new Text(currentText),
                                    ];
                                }, [])
                                    .filter(Boolean);
                                const fragment = document.createDocumentFragment();
                                fragment.replaceChildren(...nodes);
                                element.parentElement.replaceChild(fragment, element);
                                queue.push(...nodes);
                            }
                            break;
                        }
                        case Node.COMMENT_NODE: {
                            if (!textContent.startsWith(VARIABLE_PREFIX)) {
                                return;
                            }
                            const variableName = textContent.slice(VARIABLE_PREFIX_LENGTH);
                            if (variableName in bindings) {
                                setTextContent(element.nextSibling, get(bindings[variableName]));
                            }
                            break;
                        }
                        case Node.ELEMENT_NODE:
                            for (const attrName of Object.keys(element.dataset)) {
                                if (!attrName.startsWith("fluor") || attrName === "fluorData") {
                                    continue;
                                }
                                const attrValue = element.dataset[attrName];
                                if (!(attrValue in bindings)) {
                                    const html = element.outerHTML;
                                    const tag = html.slice(0, html.indexOf(">") + 1);
                                    if (rootNode !== document.body) {
                                        console.warn(`Undefined or unbound variable ${attrValue} in: ${tag}`);
                                    }
                                }
                                const value = get(bindings[attrValue]);
                                if (!value) {
                                    break;
                                }
                                switch (attrName) {
                                    case "fluorText":
                                        setTextContent(element, value);
                                        break;
                                    case "fluorHtml":
                                        element.innerHTML = value;
                                        break;
                                    case "fluorList": {
                                        if (element.tagName !== "TEMPLATE") {
                                            console.error("data-fluor-list must be used on a template tag");
                                            continue;
                                        }
                                        const children = value.map((item) => {
                                            const node = element.content.cloneNode(true);
                                            node.firstElementChild.dataset.fluorData =
                                                JSON.stringify(item);
                                            return node;
                                        });
                                        element.parentNode.replaceChildren(element, ...children);
                                        break;
                                    }
                                    default: {
                                        const htmlAttr = attrName.replace("fluor", "").toLowerCase();
                                        switch (value) {
                                            case true:
                                                element.setAttribute(htmlAttr, "");
                                                break;
                                            case false:
                                                element.removeAttribute(htmlAttr);
                                                break;
                                            default:
                                                element.setAttribute(htmlAttr, value);
                                        }
                                        break;
                                    }
                                }
                            }
                            break;
                    }
                });
            });
        }
        const component = {
            variable(defaultValue, dependencies) {
                var _a;
                if (defaultValue instanceof Function) {
                    const initialValue = defaultValue(...dependencies.map(get));
                    const container = {
                        value: initialValue,
                        update: defaultValue,
                        dependencies,
                    };
                    for (const dependency of dependencies) {
                        dependencyMap.set(dependency, [
                            ...((_a = dependencyMap.get(dependency)) !== null && _a !== void 0 ? _a : []),
                            container,
                        ]);
                    }
                    return container;
                }
                return { value: defaultValue, update: () => defaultValue };
            },
            bind(newBindings) {
                Object.assign(bindings, newBindings);
            },
            get,
            set(variable, valueOrUpdate) {
                return () => __awaiter(this, void 0, void 0, function* () {
                    var _a;
                    variable.value = yield makeValue(valueOrUpdate, variable);
                    const dependantContainers = (_a = dependencyMap.get(variable)) !== null && _a !== void 0 ? _a : [];
                    for (const container of dependantContainers) {
                        container.value = container.update(...container.dependencies.map(get));
                    }
                    component.render();
                });
            },
            toggle(variableName) {
                return component.set(variableName, (prev) => !prev);
            },
            on(event, selector, actionOrArray, options = {}) {
                const actionChain = chainActions(actionOrArray);
                const handler = (ev) => {
                    const matchedTarget = isNode(selector)
                        ? selector
                        : ev.target.closest(selector);
                    if (matchedTarget && rootNode.contains(matchedTarget)) {
                        actionChain(ev);
                    }
                };
                rootNode.addEventListener(event, handler, options);
                abortController.signal.addEventListener("abort", () => {
                    rootNode.removeEventListener(event, handler, options);
                });
            },
            render,
            destroy,
            every: (interval, action, options) => every(interval, action, Object.assign(Object.assign({}, options), { signal: abortController.signal })),
            delay,
            classNames,
            append: listOperation("push", render),
            prepend: listOperation("unshift", render),
            pop: listOperation("pop", render),
            shift: listOperation("shift", render),
            addClass: classListMutation("add", rootNode),
            removeClass: classListMutation("remove", rootNode),
            toggleClass: classListMutation("toggle", rootNode),
            withEvent(fn) {
                return (ev) => chainActions(fn(ev))(ev);
            },
            withTarget(fn) {
                return (ev) => chainActions(fn(ev.target))(ev);
            },
            $root: rootNode,
            $data: JSON.parse(((_a = rootNode === null || rootNode === void 0 ? void 0 : rootNode.dataset) === null || _a === void 0 ? void 0 : _a.fluorData) || "{}"),
            $fluorScript: fluorScript,
            $: (selector, root = rootNode) => $(selector, root),
            $$: (selector, root = rootNode) => $$(selector, root),
        };
        if (fluorScript) {
            yield fluorScript(component);
        }
        return component;
    });
}
// Utilities
function isNode(obj) {
    return obj instanceof Node;
}
function setTextContent(node, text) {
    node.textContent = text;
}
function $(selector, root = document) {
    if (isNode(selector)) {
        return selector;
    }
    return root.querySelector(selector);
}
function $$(selector, root = document) {
    if (isNode(selector)) {
        return [selector];
    }
    return root.querySelectorAll(selector);
}
// Inspired by https://github.com/lukeed/clsx
function classNames(...args) {
    return args
        .flatMap((arg) => Array.isArray(arg)
        ? arg.map((e) => classNames(e))
        : typeof arg === "string"
            ? arg
            : classNames(Object.keys(arg).filter((k) => arg[k])))
        .join(" ");
}
//
function makeValue(valueOrUpdate, variable) {
    return __awaiter(this, void 0, void 0, function* () {
        return valueOrUpdate instanceof Function
            ? yield valueOrUpdate(variable.value)
            : valueOrUpdate;
    });
}
// Turns an array of actions into a single action
function chainActions(actionOrArray) {
    return Array.isArray(actionOrArray)
        ? function actionChain(...args) {
            return __awaiter(this, void 0, void 0, function* () {
                for (const action of actionOrArray) {
                    yield action(...args);
                }
            });
        }
        : actionOrArray;
}
// Breadth-first node tree walk.
function walk(node, visitFn) {
    return __awaiter(this, void 0, void 0, function* () {
        const queue = [node];
        while (queue.length) {
            const next = queue.shift();
            visitFn(next, queue);
            queue.push(...next.childNodes);
        }
    });
}
// https://codereview.stackexchange.com/questions/47889/alternative-to-setinterval-and-settimeout
function every(intervalInSeconds, actionOrArray, options = { leading: false, signal: null }) {
    const handler = chainActions(actionOrArray);
    const interval = intervalInSeconds * 1000;
    let start = Date.now() - (options.leading ? interval : 0);
    const intervalFn = () => {
        var _a;
        if ((_a = options === null || options === void 0 ? void 0 : options.signal) === null || _a === void 0 ? void 0 : _a.aborted) {
            return;
        }
        if (Date.now() - start >= interval) {
            start += interval;
            handler();
        }
        requestAnimationFrame(intervalFn);
    };
    requestAnimationFrame(intervalFn);
}
function delay(delayInSeconds, actionOrArray) {
    return () => {
        const handler = chainActions(actionOrArray);
        const delay = delayInSeconds * 1000;
        let start = Date.now();
        const timeoutFn = () => {
            Date.now() - start < delay ? requestAnimationFrame(timeoutFn) : handler();
        };
        requestAnimationFrame(timeoutFn);
    };
}
function classListMutation(mutation, rootNode) {
    return (className, selector) => (ev) => {
        const targets = selector ? $$(selector, rootNode) : [ev.target];
        for (const target of targets) {
            target.classList[mutation](className);
        }
    };
}
function listOperation(method, render) {
    return (variable, valueOrUpdate = null) => () => __awaiter(this, void 0, void 0, function* () {
        variable.value[method](yield makeValue(valueOrUpdate, variable));
        render();
    });
}
