interface VNode {
  parent: VNode;
  native: any; // TODO(pk): type it properly
  bindings: any[] // TODO(pk): storing bindings separatelly for each and every individual node might not be super-performant :-)
}

// INSANITY WARNING: global variables => think of passing context around
// those fields here are part of the view-specific context
let parentVNode: VNode;
let nodes: VNode[] = [];

function createVNode(parent: VNode, native) {
  // TODO(pk): lazy-init bindings array
  return {parent: parent, native: native, bindings: []};
}

function elementStart(idx: number, tagName: string, attrs?: string[] | null) {
  const domEl = document.createElement(tagName);
  const vNode = nodes[idx] = createVNode(parentVNode, domEl);
  if (attrs) {
    for (var i = 0; i<attrs.length; i+= 2) {
      domEl.setAttribute(attrs[i], attrs[i + 1]);
    }
  }
  if (parentVNode) {
    parentVNode.native.appendChild(domEl);
  }
  parentVNode = vNode;
}

// TODO(pk): would be possible to get rid of the idx argument here
function elementEnd(idx: number) {
  parentVNode = nodes[idx].parent;
}

function element(idx: number, tagName: string, attrs?: string[] | null) {
   elementStart(idx, tagName, attrs);
   elementEnd(idx);
}

function text(idx: number, value: string) {
  const domEl = document.createTextNode(value);
  nodes[idx] = createVNode(parentVNode, domEl);
  if (parentVNode) {
    parentVNode.native.appendChild(domEl);
  }
}

function textUpdate(vNodeIdx: number, bindIdx: number, newValue: string) {
  const vNode = nodes[vNodeIdx];
  // this is the first time we see this binding
  if (bindIdx > vNode.bindings.length) {
    vNode.bindings[bindIdx] = newValue;
    vNode.native.textContent = newValue;
  } else {
    const oldValue = vNode.bindings[bindIdx];
    if (oldValue !== newValue) {
      vNode.bindings[bindIdx] = newValue;
      vNode.native.textContent = newValue;
    }
  }
}

function elementProperty(vNodeIdx: number, bindIdx: number, propName: string, newValue: any) {
  const vNode = nodes[vNodeIdx];
  // this is the first time we see this binding
  if (bindIdx > vNode.bindings.length) {
    vNode.bindings[bindIdx] = newValue;
    vNode.native[propName] = newValue;
  } else {
    const oldValue = vNode.bindings[bindIdx];
    if (oldValue !== newValue) {
      vNode.bindings[bindIdx] = newValue;
      vNode.native[propName] = newValue;
    }
  }
}

function elementAttribute(vNodeIdx: number, bindIdx: number, attrName: string, newValue: string) {
  const vNode = nodes[vNodeIdx];
  // this is the first time we see this binding
  if (bindIdx > vNode.bindings.length) {
    vNode.bindings[bindIdx] = newValue;
    vNode.native.setAttribute(attrName, newValue);
  } else {
    const oldValue = vNode.bindings[bindIdx];
    if (oldValue !== newValue) {
      vNode.bindings[bindIdx] = newValue;
      vNode.native.setAttribute(attrName, newValue);
    }
  }
}

function render(host, tpl, ctx) {
  const hostVNode = parentVNode = createVNode(null!, host);
  tpl(true, ctx);
  return function(ctx) {
    parentVNode = hostVNode;
    tpl(false, ctx);
  }
}


function app(cm: boolean, ctx) {
  if (cm) {
    elementStart(0, 'div', ['id', 'test']);
      text(1, `Hello, ${ctx.name}`);
      element(2, 'span');
    elementEnd(0);
  }
  if (!cm) {
    elementProperty(0, 0, 'id', 'new_id');
    textUpdate(1, 0, `Hello, ${ctx.name}`);
  }
}