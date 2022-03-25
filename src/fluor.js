const TEXT_NODE_OWNERS = new WeakMap();
const VARIABLE_PREFIX = "fluor$";
const VARIABLE_PREFIX_LENGTH = VARIABLE_PREFIX.length;

export default async function Fluor(selector, fluorFn) {
  // TODO: If no selector is given, root to the parent node
  const matchingNodes = $$(selector || document.body);
  const componentRegistry = new WeakMap(
    [...matchingNodes].map((n) => [n, null])
  );

  for (const node of matchingNodes) {
    registerComponent(node, fluorFn);
  }

  // If no selector is given we attached the component on the body and there is
  // no need to watch for mutations.
  if (!selector) {
    return;
  }

  const observer = new MutationObserver((mutationList) => {
    for (const mutation of mutationList) {
      const mutatedNodes =
        mutation.type === "attributes"
          ? [mutation.target]
          : mutation.addedNodes;

      for (const mutatedNode of mutatedNodes) {
        if (mutatedNode.nodeType !== Node.ELEMENT_NODE) {
          continue;
        }
        const existingComponent = componentRegistry.get(mutatedNode);

        // Destroy components not matching their selector anymore
        if (existingComponent && !mutatedNode.matches(selector)) {
          existingComponent.destroy();
          componentRegistry.delete(mutatedNode);
        }

        // Create components for new nodes matching the selector
        if (!existingComponent && mutatedNode.matches(selector)) {
          registerComponent(mutatedNode, fluorFn);
        }
      }
    }
  });

  observer.observe(document.body, {
    attributes: true,
    childList: true,
    subtree: true,
  });

  async function registerComponent(node, fluorFn) {
    const component = await createComponent(node, fluorFn);
    componentRegistry.set(node, component);
    component.render();
  }
}

// Perform automatic discovery and initialization of Fluor components if the
// script is loaded with the `init` parameter in the query parameters.
const shouldInit = new URL(import.meta.url).searchParams.has("init");

if (shouldInit) {
  void (async () => {
    const PUBLIC_API = Object.keys(await createComponent());

    await new Promise((resolve) => {
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", resolve);
      } else {
        resolve();
      }
    });

    // We need to expose the Fluor runtime on the window object for discovered
    // components to load properly
    window.Fluor = Fluor;

    const fluorScriptTags = $$("script[type=fluor]");

    for (const fluorScript of fluorScriptTags) {
      // TODO: Implement selector-less scripts (roots the component to the script
      // tag's parent)
      const selector = fluorScript.dataset.fluorSelector;
      const scriptTag = document.createElement("script");

      if (fluorScript.hasAttribute("src")) {
        try {
          const scriptUrl = fluorScript.getAttribute("src");
          const response = await fetch(scriptUrl);
          // FIXME: This is probably a bit dumb, need to check how redirects are
          // handled.
          if (response.status >= 400) {
            throw new Error(`Unable to load Fluor script at ${scriptUrl}`);
          }
          const remoteScript = await response.text();
          fluorScript.textContent = remoteScript;
        } catch (error) {
          fluorScript.textContent = `console.error(${JSON.stringify(
            error.message
          )})`;
        }
      }

      scriptTag.textContent = `Fluor(${JSON.stringify(
        selector
      )}, async ({${PUBLIC_API.join(",")}}) => {${fluorScript.textContent}})`;

      fluorScript.parentNode.removeChild(fluorScript);
      document.body.appendChild(scriptTag);
    }
  })();
}

async function createComponent(rootNode, fluorFn = null) {
  const abortController = new AbortController();
  const bindings = {};
  const dependencyMap = new Map();
  const $data = JSON.parse(rootNode?.dataset?.fluorData || "{}");

  function destroy() {
    abortController.abort();
  }

  function get(variable) {
    return variable?.value;
  }

  async function render() {
    await walk(rootNode, (element, queue) => {
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
            element.nextSibling.textContent = get(bindings[variableName]);
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
                console.warn(
                  `Undefined or unbound variable ${attrValue} in: ${tag}`
                );
              }
            }

            const value = get(bindings[attrValue]);

            if (!value) {
              break;
            }

            switch (attrName) {
              case "fluorText":
                element.textContent = value;
                break;
              case "fluorHtml":
                element.innerHTML = value;
                break;
              case "fluorLoop": {
                if (element.tagName !== "TEMPLATE") {
                  console.error(
                    "data-fluor-loop must be used on a template tag"
                  );
                  continue;
                }
                const children = value.map((item, index) => {
                  const node = element.content.cloneNode(true);
                  node.firstElementChild.dataset.fluorData = JSON.stringify({
                    $loop: {
                      item,
                      index,
                      count: value.length,
                    },
                  });
                  return node;
                });
                element.parentNode.replaceChildren(element, ...children);
                break;
              }
              default: {
                const htmlAttr = attrName
                  .replace(/fluor(-html)?/, "")
                  .toLowerCase();
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
        default: // do nothing
      }
    });
  }
  function variable(defaultValue, dependencies = []) {
    if (defaultValue instanceof Function) {
      const initialValue = defaultValue(...dependencies.map(get));
      const container = {
        value: initialValue,
        update: defaultValue,
        dependencies,
      };

      for (const dependency of dependencies) {
        dependencyMap.set(dependency, [
          ...(dependencyMap.get(dependency) ?? []),
          container,
        ]);
      }

      return container;
    }

    return { value: defaultValue, update: () => defaultValue };
  }

  variable.fromValue = (selector) => variable(() => $(selector).value);
  variable.fromValueAsDate = (selector) =>
    variable(() => $(selector).valueAsDate);
  variable.fromValueAsNumber = (selector) =>
    variable(() => $(selector).valueAsNumber);
  variable.fromTextContent = (selector, parser = (x) => x) =>
    variable(() => parser($(selector).textContent));

  const component = {
    Fluor,
    bindings,
    variable,
    get,

    set(variable, valueOrUpdate = variable.update) {
      return async () => {
        variable.value = await makeValue(valueOrUpdate, variable);
        const dependantContainers = dependencyMap.get(variable) ?? [];
        for (const container of dependantContainers) {
          container.value = container.update(
            ...(container?.dependencies.map(get) || [])
          );
        }
        component.render();
      };
    },

    bind(newBindings) {
      Object.assign(bindings, newBindings);
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
    every: (interval, action, options) =>
      every(interval, action, { ...options, signal: abortController.signal }),
    delay,
    classNames,

    addClass: classListMutation("add", rootNode),
    removeClass: classListMutation("remove", rootNode),
    toggleClass: classListMutation("toggle", rootNode),

    withEvent(fn) {
      return (ev) => chainActions(fn(ev))(ev);
    },

    withTarget(fn) {
      return (ev) => chainActions(fn(ev.target))(ev);
    },

    preventDefault: (ev) => ev.preventDefault(),

    $data,
    $root: rootNode,
    $loop: $data.$loop || {},
    $: (selector, root = rootNode) => $(selector, root),
    $$: (selector, root = rootNode) => $$(selector, root),
  };

  // Bind loop variables for convenience
  component.bind(
    Object.fromEntries(
      Object.entries(component.$loop).map(([key, value]) => [
        `$loop.${key}`,
        variable(value),
      ])
    )
  );

  if (fluorFn) {
    await fluorFn(component);
  }

  return component;
}

/**
 * Utilities
 */

function isNode(obj) {
  return obj instanceof Node;
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
    .flatMap((arg) =>
      Array.isArray(arg)
        ? arg.map((e) => classNames(e))
        : typeof arg === "string"
        ? arg
        : classNames(Object.keys(arg).filter((k) => arg[k]))
    )
    .join(" ");
}

//
async function makeValue(valueOrUpdate, variable) {
  return valueOrUpdate instanceof Function
    ? await valueOrUpdate(variable.value)
    : valueOrUpdate;
}

// Turns an array of actions into a single action
function chainActions(actionOrArray) {
  return Array.isArray(actionOrArray)
    ? async function actionChain(...args) {
        for (const action of actionOrArray) {
          await action(...args);
        }
      }
    : actionOrArray;
}

// Breadth-first node tree walk.
async function walk(node, visitFn) {
  const queue = [node];

  while (queue.length) {
    const next = queue.shift();
    visitFn(next, queue);
    queue.push(...next.childNodes);
  }
}

// https://codereview.stackexchange.com/questions/47889/alternative-to-setinterval-and-settimeout
function every(
  intervalInSeconds,
  actionOrArray,
  options = { leading: false, signal: null }
) {
  const handler = chainActions(actionOrArray);
  const interval = intervalInSeconds * 1000;
  let start = Date.now() - (options.leading ? interval : 0);
  const intervalFn = () => {
    if (options?.signal?.aborted) {
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
