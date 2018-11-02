export enum NodeType {
  MARKUP,
  TEXT,
  ELEMENT_START,
  ELEMENT_END,
  ATTRIBUTE,
  ATTRIBUTE_VALUE
}

export class Node {
  constructor(public type: NodeType, public value: any) {}
}

export class TextToken extends Node {
  constructor(value: string) {
    super(NodeType.TEXT, value);
  }
}

export class AttributeValueNode extends Node {
  constructor(value: string | null) {
    super(NodeType.ATTRIBUTE_VALUE, value);
  }
}

export class AttributeNode extends Node {
  constructor(public name: string, value: AttributeValueNode | null) {
    super(NodeType.ATTRIBUTE, value);
  }
}

export class ElementStartNode extends Node {
  constructor(tagName: string, public attributes: AttributeNode[]) {
    super(NodeType.ELEMENT_START, tagName);
  }
}

export class ElementEndNode extends Node {
  constructor(tagName: string) {
    super(NodeType.ELEMENT_END, tagName);
  }
}

export class MarkupNode extends Node {
  constructor(public children: Node[]) {
    super(NodeType.MARKUP, null);
  }
}

type CharCodeConditionFn = (charCode: number) => boolean;

function isWhitespace(charCode: number): boolean {
  // TODO: take other whitespaces into account
  return charCode === 32;
}

function isStringQuote(charCode: number): boolean {
  return charCode === 34; // ""
}

function isSlash(charCode: number): boolean {
  return charCode === 47; // /
}

function isSmallerSign(charCode: number): boolean {
  return charCode === 60; // <
}

function isEqualSign(charCode: number): boolean {
  return charCode === 61; // =
}

function isGreaerSign(charCode: number): boolean {
  return charCode === 62; // >
}

function isSmallLetter(charCode: number): boolean {
  return charCode >= 97 && charCode <= 122;
}

function not(conditionFn: CharCodeConditionFn): CharCodeConditionFn {
  return (charCode: number): boolean => {
    return !conditionFn(charCode);
  };
}

abstract class Parser {
  constructor(public markup: string, public currentIdx: number = 0) {}

  isNotEOF() {
    return this.currentIdx < this.markup.length;
  }

  peekCharCode(offset: number = 0): number | null {
    const idx = this.currentIdx + offset;
    return idx < this.markup.length ? this.markup.charCodeAt(idx) : null;
  }

  peek(conditionFn: CharCodeConditionFn, offset: number = 0): boolean {
    return this.isNotEOF() && conditionFn(this.peekCharCode(offset));
  }

  skeep(conditionFn: CharCodeConditionFn): number {
    while (this.isNotEOF() && conditionFn(this.peekCharCode())) {
      this.currentIdx++;
    }
    return this.currentIdx;
  }

  peekAndSkip(conditionFn: CharCodeConditionFn): boolean {
    const result = this.peek(conditionFn);
    if (result) {
      this.currentIdx++;
      return true;
    }
    return false;
  }

  requireAndSkip(conditionFn: CharCodeConditionFn): boolean {
    if (this.peekAndSkip(conditionFn)) {
      return true;
    }
    throw `Unexpected character code ${this.peekCharCode()}`;
  }

  consume(conditionFn: CharCodeConditionFn): string {
    return this.markup.substring(this.currentIdx, this.skeep(conditionFn));
  }

  skipWhitSpace() {
    this.skeep(isWhitespace);
  }

  delegate<T extends Node>(DelegateParser): T {
    const parser = new DelegateParser(this.markup, this.currentIdx) as Parser;
    const parsedNode = parser.parse() as T;

    this.currentIdx = parser.currentIdx;

    return parsedNode;
  }

  abstract parse(): Node;
}

export class AtrtibuteValueParser extends Parser {
  parse(): AttributeValueNode | null {
    if (this.peekAndSkip(isStringQuote)) {
      const attrValue = this.consume(not(isStringQuote));
      this.requireAndSkip(isStringQuote);
      return new AttributeValueNode(attrValue);
    }
    return null;
  }
}

export class AttributeParser extends Parser {
  parse(): AttributeNode {
    const attrName = this.consume(isSmallLetter);
    this.skipWhitSpace();
    if (this.peekAndSkip(isEqualSign)) {
      this.skipWhitSpace();
      return new AttributeNode(attrName, this.delegate(AtrtibuteValueParser));
    } else {
      return new AttributeNode(attrName, null);
    }
  }
}

export class ElementStartParser extends Parser {
  parse(): ElementStartNode {
    const attributes: AttributeNode[] = [];

    this.requireAndSkip(isSmallerSign); // <

    const tagName = this.consume((charCode: number) => {
      return !isWhitespace(charCode) && !isGreaerSign(charCode);
    });

    this.skipWhitSpace();

    while (this.isNotEOF() && !this.peek(isGreaerSign)) {
      if (this.peek(isSmallLetter)) {
        attributes.push(this.delegate(AttributeParser));
      }
      this.skipWhitSpace();
    }

    this.requireAndSkip(isGreaerSign); // >

    return new ElementStartNode(tagName, attributes);
  }
}

export class ElementEndParser extends Parser {
  parse(): ElementEndNode {
    this.requireAndSkip(isSmallerSign); // <
    this.requireAndSkip(isSlash); // /

    const tagName = this.consume((charCode: number) => {
      return !isWhitespace(charCode) && !isGreaerSign(charCode);
    });

    this.skipWhitSpace();

    this.requireAndSkip(isGreaerSign); // >

    return new ElementEndNode(tagName);
  }
}

export class MarkupParser extends Parser {
  parse(): MarkupNode {
    const nodes: Node[] = [];

    while (this.isNotEOF()) {
      if (this.peek(isSmallerSign)) {
        if (this.peek(isSmallLetter, 1)) {
          nodes.push(this.delegate(ElementStartParser));
        } else if (this.peek(isSlash, 1)) {
          nodes.push(this.delegate(ElementEndParser));
        } else {
          throw '< in text nodes are not supported yet';
        }
      } else {
        const text = this.consume(not(isSmallerSign));
        nodes.push(new TextToken(text));
      }
    }

    return new MarkupNode(nodes);
  }
}
