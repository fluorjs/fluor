const DEV = "development" !== "production"

const LIST_OPS = {
  append: "push",
  prepend: "unshift",
  pop: "pop",
  shift: "shift",
}

function $(selector, root = document) {
  if (selector instanceof Node) {
    return [selector]
  }
  return root.querySelectorAll(selector)
}

function $$(selector, root = document) {
  if (selector instanceof Node) {
    return selector
  }
  return root.querySelector(selector)
}

function isFunction(object) {
  return Boolean(object && object.constructor && object.call && object.apply)
}

function createId() {
  return Math.random().toString(36).slice(2)
}

// Inspired by
// https://github.com/lukeed/clsx
function classNames(...objs) {
  return objs
    .map((obj) => {
      return Array.isArray(obj)
        ? obj.map((e) => classNames(...e)).join(" ")
        : typeof obj === "string"
        ? obj
        : classNames(
            ...Object.entries(obj).reduce(
              (a, [k, v]) => (v ? a.concat(k) : a),
              []
            )
          )
    })
    .join(" ")
}

function dotPath(path, object) {
  return path.split(".").reduce((obj, current) => {
    if (DEV && !(current in obj)) {
      throw `No path ${path} in ${JSON.stringify(object)}`
    }
    return obj[current]
  }, object)
}

function makeValue(valueOrFn, previousValue, data) {
  return isFunction(valueOrFn) ? valueOrFn(previousValue, data) : valueOrFn
}

// Thanks @stimulus and alpine
function domReady() {
  return new Promise((resolve) => {
    if (document.readyState == "loading") {
      document.addEventListener("DOMContentLoaded", resolve)
    } else {
      resolve()
    }
  })
}

// Breadth-first node tree walk. Doesn't recurse into child when the callback
// fn returns false
function walk(node, fn) {
  const queue = [node]

  while (queue.length) {
    const next = queue.shift()
    if (fn(next) !== false) {
      Array.from(next.children, (c) => queue.push(c))
    }
  }
}

// Find the closest parent molecule for a given DOM node
function moleculeOf(node) {
  if (!FluorRuntime.__molecules__.size) {
    return null
  }

  let parent = node
  while (parent) {
    if (FluorRuntime.__molecules__.has(parent)) {
      return FluorRuntime.__molecules__.get(parent)
    }
    parent = parent.parentElement
  }

  return null
}

function handleFIf(attr, element, data) {
  if (DEV && element.tagName !== "TEMPLATE") {
    throw "@each only works on <template> tags"
  }

  const truthValue = dotPath(attr.value, data)

  if (element.__f_if_items__) {
    const molecules = [
      ...new Set(element.__f_if_items__.map((e) => e.molecule)),
    ]
    for (const m of molecules) {
      m.$root.parentElement.removeChild(m.$root)
      destroyMolecule(m)
    }
    element.__f_if_items__ = null
  }
  if (truthValue && !element.__f_if_items__) {
    const fragment = document.createDocumentFragment()
    const clone = element.content.cloneNode(true)

    element.__f_if_items__ = []

    for (const child of [...clone.children]) {
      element.__f_if_items__.push({ child })
      fragment.append(child)
    }

    element.parentNode.insertBefore(fragment, element.nextSibling)

    for (const ifItem of element.__f_if_items__) {
      const { child } = ifItem
      const id = createId()
      const molecule = createMolecule(id, child)
      ifItem.molecule = molecule
      FluorRuntime.__molecules__.set(child, molecule)
      discoverMolecules(child)
      molecule.render()
    }
  }
}

function handleFEach(attr, element, data) {
  if (DEV && element.tagName !== "TEMPLATE") {
    throw "@each only works on <template> tags"
  }

  const [iterator, source] = attr.value.split(/\s+in\s+/)
  const items = dotPath(source, data)
  const fragment = document.createDocumentFragment()

  // TODO: This is highly inefficient as we are removing then recreating all
  // elements from the list.
  // We should probably use a key-based strategy like most other frameworks do.
  if (element.__f_each_items__) {
    const molecules = [
      ...new Set(element.__f_each_items__.map((e) => e.molecule)),
    ]
    for (const m of molecules) {
      m.$root.parentElement.removeChild(m.$root)
      destroyMolecule(m)
    }
    element.__f_each_items__ = null
    handleFEach(attr, element, data)
  } else {
    element.__f_each_items__ = []
    for (let index = 0, l = items.length; index < l; index++) {
      const clone = element.content.cloneNode(true)
      for (const child of [...clone.children]) {
        element.__f_each_items__.push({ index, child })
        fragment.append(child)
      }
    }

    element.parentNode.insertBefore(fragment, element.nextSibling)

    for (const loopItem of element.__f_each_items__) {
      const { index, child } = loopItem
      const id = createId()
      const molecule = createMolecule(id, child)
      molecule.setup({
        $index: index,
        [iterator]: items[index],
      })
      loopItem.molecule = molecule
      FluorRuntime.__molecules__.set(child, molecule)
      discoverMolecules(child)
      molecule.render()
    }
  }
}

function handleFBind(attr, element, data) {
  const [attrName, valuePath] = attr.value.split(":")
  const value = dotPath(valuePath, data)
  switch (value) {
    case true:
      element.setAttribute(attrName, "")
      break
    case false:
      element.removeAttribute(attrName)
      break
    default:
      element.setAttribute(attrName, value)
  }
}

function createMolecule(moleculeId, rootNode) {
  const data = {}
  const merge = (obj) => Object.assign(data, obj)

  const parent = rootNode ? moleculeOf(rootNode.parentElement) : null
  if (parent) {
    merge({ $parent: parent.$data })
  }

  function render(updateChildren = true) {
    const mRoot = moleculeOf(rootNode)

    walk(rootNode, (element) => {
      const mElement = moleculeOf(element)
      if (mElement !== mRoot) {
        if (updateChildren) {
          mElement.render(updateChildren)
        }
        return false
      }
      for (const attr of element.attributes) {
        switch (attr.name) {
          case "f-text":
            element.textContent = dotPath(attr.value, data)
            break
          case "f-html":
            element.innerHTML = dotPath(attr.value, data)
            break
          case "f-if":
            handleFIf(attr, element, data)
            break
          case "f-each":
            handleFEach(attr, element, data)
            break
          case "f-bind":
            handleFBind(attr, element, data)
            break
        }
      }
    })
  }

  function _set(objectOrKey, valueOrFn) {
    if (typeof objectOrKey === "object") {
      merge(
        Object.entries(objectOrKey).reduce(
          (a, [k, v]) => ({
            ...a,
            [k]: makeValue(v, data[k], data),
          }),
          {}
        )
      )
    } else {
      merge({ [objectOrKey]: makeValue(valueOrFn, data[objectOrKey], data) })
    }
  }

  function classListMutation(mutation, className, selector = null) {
    return (ev) => {
      const targets = selector ? $(selector, rootNode) : [ev.currentTarget]
      targets.forEach((target) => target.classList[mutation](className))
    }
  }

  const api = {
    set(objectOrKey, valueOrFn) {
      return () => {
        _set(objectOrKey, valueOrFn)
        render()
      }
    },

    setup(objectOrKey, valueOrFn) {
      _set(objectOrKey, valueOrFn)
    },

    on(event, selector, fnOrArray) {
      const handler = Array.isArray(fnOrArray)
        ? (ev) => fnOrArray.forEach((fn) => fn(ev))
        : fnOrArray
      for (const node of $(selector, rootNode)) {
        if (moleculeOf(node).$root === rootNode) {
          node.addEventListener(event, handler)
        }
      }
    },

    addClass(className, selector = null) {
      return classListMutation("add", className, selector)
    },

    removeClass(className, selector = null) {
      return classListMutation("remove", className, selector)
    },

    toggleClass(className, selector = null) {
      return classListMutation("toggle", className, selector)
    },

    ...Object.entries(LIST_OPS).reduce(
      (a, [apiName, method]) => ({
        ...a,
        [apiName]: (name, valueOrFn) => {
          return () => {
            data[name][method](makeValue(valueOrFn, data[name], data))
            render()
          }
        },
      }),
      {}
    ),

    withEvent(fn) {
      return (ev) => fn(ev)()
    },

    render,

    classes: classNames,

    $data: data,
    $id: moleculeId,
    $root: rootNode,
    $parent: parent,
    $: (selector, root = rootNode) => $(selector, root),
    $$: (selector, root = rootNode) => $$(selector, root),
  }

  return api
}

function destroyMolecule(molecule) {
  const scripts = FluorRuntime.__scripts__.get(molecule) || []
  for (const script of scripts) {
    script.parentElement.removeChild(script)
  }
}

const PUBLIC_API = Object.keys(createMolecule())

function FluorRuntime(id, atomCode) {
  const molecule = Array.from(FluorRuntime.__molecules__.values()).find(
    (m) => m.$id === id
  )
  atomCode(molecule)
  molecule.render(false)
}

window.Fluor = FluorRuntime

FluorRuntime.__molecules__ = new Map()
FluorRuntime.__scripts__ = new Map()

function discoverMolecules(root) {
  const atoms = []
  const molecules = []

  walk(root, (e) => {
    if (e.tagName === "SCRIPT" && e.type === "fluor") {
      atoms.push(e)
    }
  })

  for (const atom of atoms) {
    const rootNode = atom.parentElement
    let molecule
    if (FluorRuntime.__molecules__.has(rootNode)) {
      molecule = FluorRuntime.__molecules__.get(rootNode)
    } else {
      const id = createId()
      molecule = createMolecule(id, rootNode)
      FluorRuntime.__molecules__.set(rootNode, molecule)
    }
    atom.__f_molecule__ = molecule
    molecules.push(molecule)
  }

  const fragment = document.createDocumentFragment()
  for (const atom of atoms) {
    const molecule = atom.__f_molecule__
    const scriptElement = document.createElement("script")
    const wrappedScript = `Fluor("${molecule.$id}", ({${PUBLIC_API.join(
      ","
    )}}) => {${atom.textContent}})`
    scriptElement.textContent = wrappedScript
    atom.parentElement.removeChild(atom)
    if (FluorRuntime.__scripts__.has(molecule)) {
      FluorRuntime.__scripts__.set(molecule, [
        ...FluorRuntime.__scripts__.get(molecule),
        scriptElement,
      ])
    } else {
      FluorRuntime.__scripts__.set(molecule, [scriptElement])
    }
    fragment.appendChild(scriptElement)
  }
  document.body.appendChild(fragment)
}

async function autostart() {
  await domReady()
  discoverMolecules(document.body)
}
autostart()

export default function Fluor(selectorOrNode, atomCode) {
  const rootNode = $$(selectorOrNode)
  const id = createId()
  const molecule = createMolecule(id, rootNode)
  FluorRuntime.__molecules__.set(rootNode, molecule)
  FluorRuntime(id, atomCode)
}
