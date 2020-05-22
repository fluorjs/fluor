const DEV = process.env.NODE_ENV !== "production"

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
function classNames(obj) {
  return Array.isArray(obj)
    ? obj.join(" ")
    : typeof obj === "string"
    ? obj
    : Object.entries(obj).reduce((a, [k, v]) => (v ? a.concat(k) : a), [])
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
  if (!Fluor.__molecules__.size) {
    return null
  }

  let parent = node
  while (parent) {
    if (Fluor.__molecules__.has(parent)) {
      return Fluor.__molecules__.get(parent)
    }
    parent = parent.parentElement
  }

  return null
}

function handleLoop(attr, element, data) {
  if (DEV && element.tagName !== "TEMPLATE") {
    throw "@each only works on <template> tags"
  }

  const [iterator, source] = attr.value.split(/\s+in\s+/)
  const items = dotPath(source, data)
  const fragment = document.createDocumentFragment()

  // TODO: This is highly inefficient as we are removing then recreating all
  // elements from the list.
  // We should probably use a key-based strategy like most other frameworks do.
  if (element.__f_loop_items__) {
    const molecules = [
      ...new Set(element.__f_loop_items__.map((e) => e.molecule)),
    ]
    for (const m of molecules) {
      destroyMolecule(m)
      m.$root.parentElement.removeChild(m.$root)
    }
    element.__f_loop_items__ = null
    handleLoop(attr, element, data)
  } else {
    element.__f_loop_items__ = []
    for (let index = 0, l = items.length; index < l; index++) {
      const clone = element.content.cloneNode(true)
      for (const child of [...clone.children]) {
        element.__f_loop_items__.push({ index, child })
        fragment.append(child)
      }
    }

    element.parentNode.insertBefore(fragment, element.nextSibling)

    for (const loopItem of element.__f_loop_items__) {
      const { index, child } = loopItem
      const id = createId()
      const molecule = createMolecule(id, child)
      molecule.setup({
        $index: index,
        [iterator]: items[index],
      })
      loopItem.molecule = molecule
      Fluor.__molecules__.set(child, molecule)
      discoverMolecules(child)
      molecule.render()
    }
  }
}

function handleAttributeBind(attr, element, data) {
  if (!attr.name.startsWith("f-")) {
    return
  }

  const value = dotPath(attr.value, data)
  const concreteAttr = attr.name.slice(2)
  switch (value) {
    case true:
      element.setAttribute(concreteAttr, "")
      break
    case false:
      element.removeAttribute(concreteAttr)
      break
    default:
      element.setAttribute(concreteAttr, value)
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
          case "f-each":
            handleLoop(attr, element, data)
            break
          default:
            handleAttributeBind(attr, element, data)
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
  const scripts = Fluor.__scripts__.get(molecule) || []
  for (const script of scripts) {
    script.parentElement.removeChild(script)
  }
}

const PUBLIC_API = Object.keys(createMolecule())

function Fluor(id, atomCode) {
  const molecule = Array.from(Fluor.__molecules__.values()).find(
    (m) => m.$id === id
  )
  atomCode(molecule)
}

window.Fluor = Fluor

Fluor.__molecules__ = new Map()
Fluor.__scripts__ = new Map()

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
    if (Fluor.__molecules__.has(rootNode)) {
      molecule = Fluor.__molecules__.get(rootNode)
    } else {
      const id = createId()
      molecule = createMolecule(id, rootNode)
      Fluor.__molecules__.set(rootNode, molecule)
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
    )}}) => {${atom.textContent}; render(false)})`
    scriptElement.textContent = wrappedScript
    atom.parentElement.removeChild(atom)
    if (Fluor.__scripts__.has(molecule)) {
      Fluor.__scripts__.set(molecule, [
        ...Fluor.__scripts__.get(molecule),
        scriptElement,
      ])
    } else {
      Fluor.__scripts__.set(molecule, [scriptElement])
    }
    fragment.appendChild(scriptElement)
  }
  document.body.appendChild(fragment)
}

async function start() {
  await domReady()
  discoverMolecules(document.body)
}

start()
