'use strict';

var Quill = require('quill');

function _interopDefaultLegacy (e) { return e && typeof e === 'object' && 'default' in e ? e : { 'default': e }; }

var Quill__default = /*#__PURE__*/_interopDefaultLegacy(Quill);

function _extends() {
  _extends = Object.assign || function (target) {
    for (var i = 1; i < arguments.length; i++) {
      var source = arguments[i];

      for (var key in source) {
        if (Object.prototype.hasOwnProperty.call(source, key)) {
          target[key] = source[key];
        }
      }
    }

    return target;
  };

  return _extends.apply(this, arguments);
}

const Keys = {
  TAB: 9,
  ENTER: 13,
  ESCAPE: 27,
  UP: 38,
  DOWN: 40
};

function attachDataValues(element, data, dataAttributes) {
  const mention = element;
  Object.keys(data).forEach(key => {
    if (dataAttributes.indexOf(key) > -1) {
      mention.dataset[key] = data[key];
    } else {
      delete mention.dataset[key];
    }
  });
  return mention;
}

function getMentionCharIndex(text, mentionDenotationChars) {
  return mentionDenotationChars.reduce((prev, mentionChar) => {
    const mentionCharIndex = text.lastIndexOf(mentionChar);

    if (mentionCharIndex > prev.mentionCharIndex) {
      return {
        mentionChar,
        mentionCharIndex
      };
    }

    return {
      mentionChar: prev.mentionChar,
      mentionCharIndex: prev.mentionCharIndex
    };
  }, {
    mentionChar: null,
    mentionCharIndex: -1
  });
}

function hasValidChars(text, allowedChars) {
  return allowedChars.test(text);
}

function hasValidMentionCharIndex(mentionCharIndex, text, isolateChar) {
  if (mentionCharIndex > -1) {
    if (isolateChar && !(mentionCharIndex === 0 || !!text[mentionCharIndex - 1].match(/\s/g))) {
      return false;
    }

    return true;
  }

  return false;
}

const Embed = Quill__default["default"].import("blots/embed");

class MentionBlot extends Embed {
  static create(data) {
    const node = super.create(); // prefix character

    const denotationChar = document.createElement("span");
    denotationChar.className = "ql-mention-denotation-char";
    denotationChar.innerHTML = data.denotationChar;
    denotationChar.setAttribute("contenteditable", false); // Content

    const dataContainer = document.createElement("span");
    dataContainer.innerHTML = data.value;
    dataContainer.setAttribute("contenteditable", false); // when android keyboard reaches a `contenteditable=false` block, it automatically closes.
    // avoid that by adding a buffer "space" without the attribute.

    const AndroidBackspaceFix = document.createElement("span");
    AndroidBackspaceFix.innerHTML = "&nbsp;"; // it needs to be "visible" in order to work - so limit to minimal size.

    AndroidBackspaceFix.setAttribute("style", "display: inline-block; height: 1px; width: 1px; overflow: hidden; ");
    node.appendChild(denotationChar);
    node.appendChild(dataContainer);
    node.appendChild(AndroidBackspaceFix);
    return MentionBlot.setDataValues(node, data);
  }

  static setDataValues(element, data) {
    // the extended Embed constructor has added contenteditable=false to the outermost span,
    // we want to override that in favour of ones applied to the child elements inside create()
    setTimeout(() => {
      element.getElementsByTagName("span")[0].setAttribute("contenteditable", "inherit");
    }, 0);
    const domNode = element;
    Object.keys(data).forEach(key => {
      domNode.dataset[key] = data[key];
    });
    return domNode;
  }

  static value(domNode) {
    return domNode.dataset;
  } // android Gboard backspace does not fire onkeypress events, resulting in the caret
  // breaking into the read-only blot element. - so we need to handle edit events inside the blot child elements as well


  update(mutations, context) {
    // `childList` mutations are not handled on Quill
    // see `update` implementation on:
    // https://github.com/quilljs/quill/blob/master/blots/embed.js
    // any attempt at modifying the inner content will just remove it
    // (since we cant block any modifiications completely, this is the "lesser evil" / graceful fallback)
    for (const mutation of mutations) {
      if (mutation.type === "attributes" && mutation.attributeName === "contenteditable") continue;
      setTimeout(() => this.remove(), 0);
      return;
    }
  }

}

MentionBlot.blotName = "mention";
MentionBlot.tagName = "span";
MentionBlot.className = "mention";
Quill__default["default"].register(MentionBlot);

class Mention {
  constructor(quill, options) {
    this.isOpen = false;
    this.itemIndex = 0;
    this.mentionCharPos = null;
    this.cursorPos = null;
    this.values = [];
    this.suspendMouseEnter = false; //this token is an object that may contains one key "abandoned", set to
    //true when the previous source call should be ignored in favor or a
    //more recent execution.  This token will be null unless a source call
    //is in progress.

    this.existingSourceExecutionToken = null;
    this.quill = quill;
    this.options = {
      source: null,

      renderItem(item) {
        return `${item.value}`;
      },

      renderLoading() {
        return null;
      },

      onSelect(item, insertItem) {
        insertItem(item);
      },

      mentionDenotationChars: ["@"],
      showDenotationChar: true,
      allowedChars: /^[a-zA-Z0-9_]*$/,
      minChars: 0,
      maxChars: 31,
      offsetTop: 2,
      offsetLeft: 0,
      isolateCharacter: false,
      fixMentionsToQuill: false,
      positioningStrategy: "normal",
      defaultMenuOrientation: "bottom",
      blotName: "mention",
      dataAttributes: ["id", "value", "denotationChar", "link", "target", "disabled"],
      linkTarget: "_blank",

      onOpen() {
        return true;
      },

      onBeforeClose() {
        return true;
      },

      onClose() {
        return true;
      },

      // Style options
      listItemClass: "ql-mention-list-item",
      mentionContainerClass: "ql-mention-list-container",
      mentionListClass: "ql-mention-list",
      spaceAfterInsert: true,
      selectKeys: [Keys.ENTER]
    };

    _extends(this.options, options, {
      dataAttributes: Array.isArray(options.dataAttributes) ? this.options.dataAttributes.concat(options.dataAttributes) : this.options.dataAttributes
    }); //create mention container


    this.mentionContainer = document.createElement("div");
    this.mentionContainer.className = this.options.mentionContainerClass ? this.options.mentionContainerClass : "";
    this.mentionContainer.style.cssText = "display: none; position: absolute;";
    this.mentionContainer.onmousemove = this.onContainerMouseMove.bind(this);

    if (this.options.fixMentionsToQuill) {
      this.mentionContainer.style.width = "auto";
    }

    this.mentionList = document.createElement("ul");
    this.mentionList.id = 'quill-mention-list';
    quill.root.setAttribute('aria-owns', 'quill-mention-list');
    this.mentionList.className = this.options.mentionListClass ? this.options.mentionListClass : "";
    this.mentionContainer.appendChild(this.mentionList);
    quill.on("text-change", this.onTextChange.bind(this));
    quill.on("selection-change", this.onSelectionChange.bind(this)); //Pasting doesn't fire selection-change after the pasted text is
    //inserted, so here we manually trigger one

    quill.container.addEventListener("paste", () => {
      setTimeout(() => {
        const range = quill.getSelection();
        this.onSelectionChange(range);
      });
    });
    quill.keyboard.addBinding({
      key: Keys.TAB
    }, this.selectHandler.bind(this));
    quill.keyboard.bindings[Keys.TAB].unshift(quill.keyboard.bindings[Keys.TAB].pop());

    for (let selectKey of this.options.selectKeys) {
      quill.keyboard.addBinding({
        key: selectKey
      }, this.selectHandler.bind(this));
    }

    quill.keyboard.bindings[Keys.ENTER].unshift(quill.keyboard.bindings[Keys.ENTER].pop());
    quill.keyboard.addBinding({
      key: Keys.ESCAPE
    }, this.escapeHandler.bind(this));
    quill.keyboard.addBinding({
      key: Keys.UP
    }, this.upHandler.bind(this));
    quill.keyboard.addBinding({
      key: Keys.DOWN
    }, this.downHandler.bind(this));
  }

  selectHandler() {
    if (this.isOpen && !this.existingSourceExecutionToken) {
      this.selectItem();
      return false;
    }

    return true;
  }

  escapeHandler() {
    if (this.isOpen) {
      if (this.existingSourceExecutionToken) {
        this.existingSourceExecutionToken.abandoned = true;
      }

      this.hideMentionList();
      return false;
    }

    return true;
  }

  upHandler() {
    if (this.isOpen && !this.existingSourceExecutionToken) {
      this.prevItem();
      return false;
    }

    return true;
  }

  downHandler() {
    if (this.isOpen && !this.existingSourceExecutionToken) {
      this.nextItem();
      return false;
    }

    return true;
  }

  showMentionList() {
    if (this.options.positioningStrategy === "fixed") {
      document.body.appendChild(this.mentionContainer);
    } else {
      this.quill.container.appendChild(this.mentionContainer);
    }

    this.mentionContainer.style.visibility = "hidden";
    this.mentionContainer.style.display = "";
    this.mentionContainer.scrollTop = 0;
    this.setMentionContainerPosition();
    this.setIsOpen(true);
  }

  hideMentionList() {
    this.options.onBeforeClose();
    this.mentionContainer.style.display = "none";
    this.mentionContainer.remove();
    this.setIsOpen(false);
    this.quill.root.removeAttribute('aria-activedescendant');
  }

  highlightItem() {
    let scrollItemInView = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : true;

    for (let i = 0; i < this.mentionList.childNodes.length; i += 1) {
      this.mentionList.childNodes[i].classList.remove("selected");
    }

    if (this.itemIndex === -1 || this.mentionList.childNodes[this.itemIndex].dataset.disabled === "true") {
      return;
    }

    this.mentionList.childNodes[this.itemIndex].classList.add("selected");
    this.quill.root.setAttribute('aria-activedescendant', this.mentionList.childNodes[this.itemIndex].id);

    if (scrollItemInView) {
      const itemHeight = this.mentionList.childNodes[this.itemIndex].offsetHeight;
      const itemPos = this.mentionList.childNodes[this.itemIndex].offsetTop;
      const containerTop = this.mentionContainer.scrollTop;
      const containerBottom = containerTop + this.mentionContainer.offsetHeight;

      if (itemPos < containerTop) {
        // Scroll up if the item is above the top of the container
        this.mentionContainer.scrollTop = itemPos;
      } else if (itemPos > containerBottom - itemHeight) {
        // scroll down if any part of the element is below the bottom of the container
        this.mentionContainer.scrollTop += itemPos - containerBottom + itemHeight;
      }
    }
  }

  getItemData() {
    const {
      link
    } = this.mentionList.childNodes[this.itemIndex].dataset;
    const hasLinkValue = typeof link !== "undefined";
    const itemTarget = this.mentionList.childNodes[this.itemIndex].dataset.target;

    if (hasLinkValue) {
      this.mentionList.childNodes[this.itemIndex].dataset.value = `<a href="${link}" target=${itemTarget || this.options.linkTarget}>${this.mentionList.childNodes[this.itemIndex].dataset.value}`;
    }

    return this.mentionList.childNodes[this.itemIndex].dataset;
  }

  onContainerMouseMove() {
    this.suspendMouseEnter = false;
  }

  selectItem() {
    if (this.itemIndex === -1) {
      return;
    }

    const data = this.getItemData();

    if (data.disabled) {
      return;
    }

    this.options.onSelect(data, asyncData => {
      this.insertItem(asyncData);
    });
    this.hideMentionList();
  }

  insertItem(data, programmaticInsert) {
    const render = data;

    if (render === null) {
      return;
    }

    if (!this.options.showDenotationChar) {
      render.denotationChar = "";
    }

    var insertAtPos;

    if (!programmaticInsert) {
      insertAtPos = this.mentionCharPos;
      this.quill.deleteText(this.mentionCharPos, this.cursorPos - this.mentionCharPos, Quill__default["default"].sources.USER);
    } else {
      insertAtPos = this.cursorPos;
    }

    this.quill.insertEmbed(insertAtPos, this.options.blotName, render, Quill__default["default"].sources.USER);

    if (this.options.spaceAfterInsert) {
      this.quill.insertText(insertAtPos + 1, " ", Quill__default["default"].sources.USER); // setSelection here sets cursor position

      this.quill.setSelection(insertAtPos + 2, Quill__default["default"].sources.USER);
    } else {
      this.quill.setSelection(insertAtPos + 1, Quill__default["default"].sources.USER);
    }

    this.hideMentionList();
  }

  onItemMouseEnter(e) {
    if (this.suspendMouseEnter) {
      return;
    }

    const index = Number(e.target.dataset.index);

    if (!Number.isNaN(index) && index !== this.itemIndex) {
      this.itemIndex = index;
      this.highlightItem(false);
    }
  }

  onDisabledItemMouseEnter(e) {
    if (this.suspendMouseEnter) {
      return;
    }

    this.itemIndex = -1;
    this.highlightItem(false);
  }

  onItemClick(e) {
    if (e.button !== 0) {
      return;
    }

    e.preventDefault();
    e.stopImmediatePropagation();
    this.itemIndex = e.currentTarget.dataset.index;
    this.highlightItem();
    this.selectItem();
  }

  onItemMouseDown(e) {
    e.preventDefault();
    e.stopImmediatePropagation();
  }

  renderLoading() {
    var renderedLoading = this.options.renderLoading();

    if (!renderedLoading) {
      return;
    }

    if (this.mentionContainer.getElementsByClassName("ql-mention-loading").length > 0) {
      this.showMentionList();
      return;
    }

    this.mentionList.innerHTML = "";
    var loadingDiv = document.createElement("div");
    loadingDiv.className = "ql-mention-loading";
    loadingDiv.innerHTML = this.options.renderLoading();
    this.mentionContainer.append(loadingDiv);
    this.showMentionList();
  }

  removeLoading() {
    var loadingDiv = this.mentionContainer.getElementsByClassName("ql-mention-loading");

    if (loadingDiv.length > 0) {
      loadingDiv[0].remove();
    }
  }

  renderList(mentionChar, data, searchTerm) {
    if (data && data.length > 0) {
      this.removeLoading();
      this.values = data;
      this.mentionList.innerHTML = "";
      var initialSelection = -1;

      for (let i = 0; i < data.length; i += 1) {
        const li = document.createElement("li");
        li.id = 'quill-mention-item-' + i;
        li.className = this.options.listItemClass ? this.options.listItemClass : "";

        if (data[i].disabled) {
          li.className += " disabled";
          li.setAttribute('aria-hidden', 'true');
        } else if (initialSelection === -1) {
          initialSelection = i;
        }

        li.dataset.index = i;
        li.innerHTML = this.options.renderItem(data[i], searchTerm);

        if (!data[i].disabled) {
          li.onmouseenter = this.onItemMouseEnter.bind(this);
          li.onmouseup = this.onItemClick.bind(this);
          li.onmousedown = this.onItemMouseDown.bind(this);
        } else {
          li.onmouseenter = this.onDisabledItemMouseEnter.bind(this);
        }

        li.dataset.denotationChar = mentionChar;
        this.mentionList.appendChild(attachDataValues(li, data[i], this.options.dataAttributes));
      }

      this.itemIndex = initialSelection;
      this.highlightItem();
      this.showMentionList();
    } else {
      this.hideMentionList();
    }
  }

  nextItem() {
    var increment = 0;
    var newIndex;

    do {
      increment++;
      newIndex = (this.itemIndex + increment) % this.values.length;
      var disabled = this.mentionList.childNodes[newIndex].dataset.disabled === "true";

      if (increment === this.values.length + 1) {
        //we've wrapped around w/o finding an enabled item
        newIndex = -1;
        break;
      }
    } while (disabled);

    this.itemIndex = newIndex;
    this.suspendMouseEnter = true;
    this.highlightItem();
  }

  prevItem() {
    var decrement = 0;
    var newIndex;

    do {
      decrement++;
      newIndex = (this.itemIndex + this.values.length - decrement) % this.values.length;
      var disabled = this.mentionList.childNodes[newIndex].dataset.disabled === "true";

      if (decrement === this.values.length + 1) {
        //we've wrapped around w/o finding an enabled item
        newIndex = -1;
        break;
      }
    } while (disabled);

    this.itemIndex = newIndex;
    this.suspendMouseEnter = true;
    this.highlightItem();
  }

  containerBottomIsNotVisible(topPos, containerPos) {
    const mentionContainerBottom = topPos + this.mentionContainer.offsetHeight + containerPos.top;
    return mentionContainerBottom > window.pageYOffset + window.innerHeight;
  }

  containerRightIsNotVisible(leftPos, containerPos) {
    if (this.options.fixMentionsToQuill) {
      return false;
    }

    const rightPos = leftPos + this.mentionContainer.offsetWidth + containerPos.left;
    const browserWidth = window.pageXOffset + document.documentElement.clientWidth;
    return rightPos > browserWidth;
  }

  setIsOpen(isOpen) {
    if (this.isOpen !== isOpen) {
      if (isOpen) {
        this.options.onOpen();
      } else {
        this.options.onClose();
      }

      this.isOpen = isOpen;
    }
  }

  setMentionContainerPosition() {
    if (this.options.positioningStrategy === "fixed") {
      this.setMentionContainerPosition_Fixed();
    } else {
      this.setMentionContainerPosition_Normal();
    }
  }

  setMentionContainerPosition_Normal() {
    const containerPos = this.quill.container.getBoundingClientRect();
    const mentionCharPos = this.quill.getBounds(this.mentionCharPos);
    const containerHeight = this.mentionContainer.offsetHeight;
    let topPos = this.options.offsetTop;
    let leftPos = this.options.offsetLeft; // handle horizontal positioning

    if (this.options.fixMentionsToQuill) {
      const rightPos = 0;
      this.mentionContainer.style.right = `${rightPos}px`;
    } else {
      leftPos += mentionCharPos.left;
    }

    if (this.containerRightIsNotVisible(leftPos, containerPos)) {
      const containerWidth = this.mentionContainer.offsetWidth + this.options.offsetLeft;
      const quillWidth = containerPos.width;
      leftPos = quillWidth - containerWidth;
    } // handle vertical positioning


    if (this.options.defaultMenuOrientation === "top") {
      // Attempt to align the mention container with the top of the quill editor
      if (this.options.fixMentionsToQuill) {
        topPos = -1 * (containerHeight + this.options.offsetTop);
      } else {
        topPos = mentionCharPos.top - (containerHeight + this.options.offsetTop);
      } // default to bottom if the top is not visible


      if (topPos + containerPos.top <= 0) {
        let overMentionCharPos = this.options.offsetTop;

        if (this.options.fixMentionsToQuill) {
          overMentionCharPos += containerPos.height;
        } else {
          overMentionCharPos += mentionCharPos.bottom;
        }

        topPos = overMentionCharPos;
      }
    } else {
      // Attempt to align the mention container with the bottom of the quill editor
      if (this.options.fixMentionsToQuill) {
        topPos += containerPos.height;
      } else {
        topPos += mentionCharPos.bottom;
      } // default to the top if the bottom is not visible


      if (this.containerBottomIsNotVisible(topPos, containerPos)) {
        let overMentionCharPos = this.options.offsetTop * -1;

        if (!this.options.fixMentionsToQuill) {
          overMentionCharPos += mentionCharPos.top;
        }

        topPos = overMentionCharPos - containerHeight;
      }
    }

    if (topPos >= 0) {
      this.options.mentionContainerClass.split(' ').forEach(className => {
        this.mentionContainer.classList.add(`${className}-bottom`);
        this.mentionContainer.classList.remove(`${className}-top`);
      });
    } else {
      this.options.mentionContainerClass.split(' ').forEach(className => {
        this.mentionContainer.classList.add(`${className}-top`);
        this.mentionContainer.classList.remove(`${className}-bottom`);
      });
    }

    this.mentionContainer.style.top = `${topPos}px`;
    this.mentionContainer.style.left = `${leftPos}px`;
    this.mentionContainer.style.visibility = "visible";
  }

  setMentionContainerPosition_Fixed() {
    this.mentionContainer.style.position = "fixed";
    this.mentionContainer.style.height = null;
    const containerPos = this.quill.container.getBoundingClientRect();
    const mentionCharPos = this.quill.getBounds(this.mentionCharPos);
    const mentionCharPosAbsolute = {
      left: containerPos.left + mentionCharPos.left,
      top: containerPos.top + mentionCharPos.top,
      width: 0,
      height: mentionCharPos.height
    }; //Which rectangle should it be relative to

    const relativeToPos = this.options.fixMentionsToQuill ? containerPos : mentionCharPosAbsolute;
    let topPos = this.options.offsetTop;
    let leftPos = this.options.offsetLeft; // handle horizontal positioning

    if (this.options.fixMentionsToQuill) {
      const rightPos = relativeToPos.right;
      this.mentionContainer.style.right = `${rightPos}px`;
    } else {
      leftPos += relativeToPos.left; //if its off the righ edge, push it back

      if (leftPos + this.mentionContainer.offsetWidth > document.documentElement.clientWidth) {
        leftPos -= leftPos + this.mentionContainer.offsetWidth - document.documentElement.clientWidth;
      }
    }

    const availableSpaceTop = relativeToPos.top;
    const availableSpaceBottom = document.documentElement.clientHeight - (relativeToPos.top + relativeToPos.height);
    const fitsBottom = this.mentionContainer.offsetHeight <= availableSpaceBottom;
    const fitsTop = this.mentionContainer.offsetHeight <= availableSpaceTop;
    var placement;

    if (this.options.defaultMenuOrientation === "top" && fitsTop) {
      placement = "top";
    } else if (this.options.defaultMenuOrientation === "bottom" && fitsBottom) {
      placement = "bottom";
    } else {
      //it doesnt fit either so put it where there's the most space
      placement = availableSpaceBottom > availableSpaceTop ? "bottom" : "top";
    }

    if (placement === "bottom") {
      topPos = relativeToPos.top + relativeToPos.height;

      if (!fitsBottom) {
        //shrink it to fit
        //3 is a bit of a fudge factor so it doesnt touch the edge of the screen
        this.mentionContainer.style.height = availableSpaceBottom - 3 + "px";
      }

      this.options.mentionContainerClass.split(" ").forEach(className => {
        this.mentionContainer.classList.add(`${className}-bottom`);
        this.mentionContainer.classList.remove(`${className}-top`);
      });
    } else {
      topPos = relativeToPos.top - this.mentionContainer.offsetHeight;

      if (!fitsTop) {
        //shrink it to fit
        //3 is a bit of a fudge factor so it doesnt touch the edge of the screen
        this.mentionContainer.style.height = availableSpaceTop - 3 + "px";
        topPos = 3;
      }

      this.options.mentionContainerClass.split(" ").forEach(className => {
        this.mentionContainer.classList.add(`${className}-top`);
        this.mentionContainer.classList.remove(`${className}-bottom`);
      });
    }

    this.mentionContainer.style.top = `${topPos}px`;
    this.mentionContainer.style.left = `${leftPos}px`;
    this.mentionContainer.style.visibility = "visible";
  }

  getTextBeforeCursor() {
    const startPos = Math.max(0, this.cursorPos - this.options.maxChars);
    const textBeforeCursorPos = this.quill.getText(startPos, this.cursorPos - startPos);
    return textBeforeCursorPos;
  }

  onSomethingChange() {
    const range = this.quill.getSelection();
    if (range == null) return;
    this.cursorPos = range.index;
    const textBeforeCursor = this.getTextBeforeCursor();
    const {
      mentionChar,
      mentionCharIndex
    } = getMentionCharIndex(textBeforeCursor, this.options.mentionDenotationChars);

    if (hasValidMentionCharIndex(mentionCharIndex, textBeforeCursor, this.options.isolateCharacter)) {
      const mentionCharPos = this.cursorPos - (textBeforeCursor.length - mentionCharIndex);
      this.mentionCharPos = mentionCharPos;
      const textAfter = textBeforeCursor.substring(mentionCharIndex + mentionChar.length);

      if (textAfter.length >= this.options.minChars && hasValidChars(textAfter, this.getAllowedCharsRegex(mentionChar))) {
        if (this.existingSourceExecutionToken) {
          this.existingSourceExecutionToken.abandoned = true;
        }

        this.renderLoading();
        var sourceRequestToken = {
          abandoned: false
        };
        this.existingSourceExecutionToken = sourceRequestToken;
        this.options.source(textAfter, (data, searchTerm) => {
          if (sourceRequestToken.abandoned) {
            return;
          }

          this.existingSourceExecutionToken = null;
          this.renderList(mentionChar, data, searchTerm);
        }, mentionChar);
      } else {
        if (this.existingSourceExecutionToken) {
          this.existingSourceExecutionToken.abandoned = true;
        }

        this.hideMentionList();
      }
    } else {
      if (this.existingSourceExecutionToken) {
        this.existingSourceExecutionToken.abandoned = true;
      }

      this.hideMentionList();
    }
  }

  getAllowedCharsRegex(denotationChar) {
    if (this.options.allowedChars instanceof RegExp) {
      return this.options.allowedChars;
    } else {
      return this.options.allowedChars(denotationChar);
    }
  }

  onTextChange(delta, oldDelta, source) {
    if (source === "user") {
      this.onSomethingChange();
    }
  }

  onSelectionChange(range) {
    if (range && range.length === 0) {
      this.onSomethingChange();
    } else {
      this.hideMentionList();
    }
  }

  openMenu(denotationChar) {
    var selection = this.quill.getSelection(true);
    this.quill.insertText(selection.index, denotationChar);
    this.quill.blur();
    this.quill.focus();
  }

}

Quill__default["default"].register("modules/mention", Mention);

module.exports = Mention;