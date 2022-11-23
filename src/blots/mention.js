import Quill from "quill";

const Embed = Quill.import("blots/embed");

class MentionBlot extends Embed {
  static create(data) {
    const node = super.create();
    // prefix character
    const denotationChar = document.createElement("span");
    denotationChar.className = "ql-mention-denotation-char";
    denotationChar.innerHTML = data.denotationChar;
    denotationChar.setAttribute("contenteditable", false);

    // Content
    const dataContainer = document.createElement("span");
    dataContainer.innerHTML = data.value;
    dataContainer.setAttribute("contenteditable", false);

    // when android keyboard reaches a `contenteditable=false` block, it automatically closes.
    // avoid that by adding a buffer "space" without the attribute.
    const AndroidBackspaceFix = document.createElement("span");
    AndroidBackspaceFix.innerHTML = "&nbsp;";
    // it needs to be "visible" in order to work - so limit to minimal size.
    AndroidBackspaceFix.setAttribute(
      "style",
      "display: inline-block; height: 1px; width: 1px; overflow: hidden; "
    );

    node.appendChild(denotationChar);
    node.appendChild(dataContainer);
    node.appendChild(AndroidBackspaceFix);

    return MentionBlot.setDataValues(node, data);
  }

  static setDataValues(element, data) {
    // the extended Embed constructor has added contenteditable=false to the outermost span,
    // we want to override that in favour of ones applied to the child elements inside create()
    setTimeout(() => {
      element
        .getElementsByTagName("span")[0]
        .setAttribute("contenteditable", "inherit");
    }, 0);

    const domNode = element;
    Object.keys(data).forEach((key) => {
      domNode.dataset[key] = data[key];
    });
    return domNode;
  }

  static value(domNode) {
    return domNode.dataset;
  }

  // android Gboard backspace does not fire onkeypress events, resulting in the caret
  // breaking into the read-only blot element. - so we need to handle edit events inside the blot child elements as well
  update(mutations, context) {
    // `childList` mutations are not handled on Quill
    // see `update` implementation on:
    // https://github.com/quilljs/quill/blob/master/blots/embed.js

    // any attempt at modifying the inner content will just remove it
    // (since we cant block any modifiications completely, this is the "lesser evil" / graceful fallback)
    for (const mutation of mutations) {
      if (
        mutation.type === "attributes" &&
        mutation.attributeName === "contenteditable"
      )
        continue;
      setTimeout(() => this.remove(), 0);
      return;
    }
  }
}

MentionBlot.blotName = "mention";
MentionBlot.tagName = "span";
MentionBlot.className = "mention";

Quill.register(MentionBlot);
