export type MutationType =
  | 'addClass'
  | 'removeClass'
  | 'appendHTML'
  | 'setHTML'
  | 'setAttribute';

// attr="value" format
const setAttributeRegex = /^([^=\s]+)\s*=\s*"([^"]*)"/;

const applyMutation = (
  targetNode: Element,
  type: MutationType,
  value: string
): null | (() => void) => {
  if (type === 'addClass') {
    if (targetNode.className.match(new RegExp('\\b' + value + '\\b'))) {
      return null;
    }
    const originalClassName = targetNode.className;
    targetNode.className += ' ' + value;
    return () => {
      targetNode.className = originalClassName;
    };
  } else if (type === 'removeClass') {
    if (!targetNode.className.match(new RegExp('\\b' + value + '\\b'))) {
      return null;
    }
    const originalClassName = targetNode.className;
    targetNode.className = targetNode.className.replace(value, '');
    return () => {
      targetNode.className = originalClassName;
    };
  } else if (type === 'appendHTML') {
    const originalHTML = targetNode.innerHTML;
    // TODO: this will break when value is not valid HTML
    if (originalHTML.substr(-1 * value.length) === value) {
      return null;
    }
    targetNode.innerHTML += value;
    return () => {
      targetNode.innerHTML = originalHTML;
    };
  } else if (type === 'setHTML') {
    const originalHTML = targetNode.innerHTML;
    // TODO: this will break when value is not valid HTML
    if (originalHTML === value) {
      return null;
    }
    targetNode.innerHTML = value;
    return () => {
      targetNode.innerHTML = originalHTML;
    };
  } else if (type === 'setAttribute') {
    let match = setAttributeRegex.exec(value);
    if (match?.length === 3) {
      const key = match[1];
      const val = match[2];
      // TODO: if attr name is not valid, this may break
      const originalValue = targetNode.getAttribute(key);
      if (originalValue === val || (!originalValue && !val)) {
        return null;
      }

      targetNode.setAttribute(key, val);
      if (originalValue) {
        return () => {
          targetNode.setAttribute(key, originalValue!);
        };
      } else {
        return () => {
          targetNode.removeAttribute(key);
        };
      }
    }
  }

  return null;
};

// Observer for elements that don't exist in the DOM yet
const waitingToAppear: {
  selector: string;
  onAppear: (el: Element) => void;
}[] = [];
const observer = new MutationObserver(mutations => {
  if (!waitingToAppear.length) return;

  // Only run if new nodes have been added
  let hasAddedNodes = false;
  mutations.forEach(mutation => {
    if (!mutation.addedNodes) hasAddedNodes = true;
  });
  if (!hasAddedNodes) return;

  waitingToAppear.forEach(({ selector, onAppear }, i) => {
    const el = document.querySelector(selector);
    if (el) {
      onAppear(el);
      waitingToAppear.splice(i, 1);
    }
  });
});
observer.observe(document.body, {
  childList: true,
  subtree: true,
  attributes: false,
  characterData: false,
});
export function disconnectGlobalObserver() {
  observer.disconnect();
}

function modifyAndWatch(
  el: Element,
  type: MutationType,
  value: string
): () => void {
  let unapply = applyMutation(el, type, value);

  let init: null | MutationObserverInit = null;
  if (['addClass', 'removeClass'].includes(type)) {
    init = {
      attributes: true,
      attributeFilter: ['className'],
    };
  } else if (['setAttribute'].includes(type)) {
    const match = setAttributeRegex.exec(value);
    if (match?.[1]) {
      init = {
        attributes: true,
        attributeFilter: [match[1]],
      };
    }
  } else if (['appendHTML', 'setHTML'].includes(type)) {
    init = {
      childList: true,
      subtree: true,
      attributes: false,
      characterData: false,
    };
  }

  let elObserver: MutationObserver;
  if (init) {
    const elObserver = new MutationObserver(() => {
      const res = applyMutation(el, type, value);
      // If the value changed, use a new unapply function to go back to the most recent external change
      if (res) {
        unapply = res;
      }
    });
    elObserver.observe(el, init);
  }

  return () => {
    elObserver && elObserver.disconnect();
    unapply && unapply();
  };
}

export default function mutate(
  selector: string,
  type: MutationType,
  value: string
): () => void {
  const el = document.querySelector(selector);
  if (el) {
    return modifyAndWatch(el, type, value);
  }

  let unapply: () => void;
  const record = {
    selector,
    onAppear: (el: Element) => {
      unapply = modifyAndWatch(el, type, value);
    },
  };
  unapply = () => {
    const index = waitingToAppear.indexOf(record);
    if (index !== -1) {
      waitingToAppear.splice(index, 1);
    }
  };
  waitingToAppear.push(record);
  return () => {
    unapply();
  };
}
