export enum NodeType {
  STRING,
  MARKUP,
  TEXT,
  ELEMENT_START,
  ELEMENT_END,
  ATTRIBUTE_STATIC,
  ATTRIBUTE_BOUND,
  BINDING
}

export class Node {
  constructor(public type: NodeType, public value: any) {}
}

export class StringNode extends Node {
  constructor(public value: string) {
    super(NodeType.STRING, value);
  }
}

export class BindignNode extends Node {
  constructor(public value: string) {
    super(NodeType.BINDING, value);
  }
}

export class TextNode extends Node {
  constructor(value: string) {
    super(NodeType.TEXT, value);
  }
}

export abstract class AttributeNode extends Node {
  constructor(type: NodeType, public name: string, value: string | null) {
    super(type, value);
  }
}

export class StaticAttributeNode extends AttributeNode {
  constructor(name: string, value: string | null) {
    super(NodeType.ATTRIBUTE_STATIC, name, value);
  }
}

export class BoundAttributeNode extends AttributeNode {
  constructor(name: string, expression: string) {
    super(NodeType.ATTRIBUTE_BOUND, name, expression);
  }
}

export class ElementStartNode extends Node {
  constructor(tagName: string, public attributes: StaticAttributeNode[]) {
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

function isDoubleQuote(charCode: number): boolean {
  return charCode === 34; // ""
}

function isBracketOpen(charCode: number): boolean {
  return charCode === 40; // (
}

function isBracketClose(charCode: number): boolean {
  return charCode === 41; // )
}

function isSlash(charCode: number): boolean {
  return charCode === 47; // /
}

function isAngleBracketOpen(charCode: number): boolean {
  return charCode === 60; // <
}

function isEqualSign(charCode: number): boolean {
  return charCode === 61; // =
}

function isAngleBracketClose(charCode: number): boolean {
  return charCode === 62; // >
}

function isLargeLetter(charCode: number): boolean {
  return charCode >= 65 && charCode <= 90; // A - Z
}

function isSquareBracketOpen(charCode: number): boolean {
  return charCode === 91; // [
}

function isSquareBracketClose(charCode: number): boolean {
  return charCode === 93; // ]
}

function isSmallLetter(charCode: number): boolean {
  return charCode >= 97 && charCode <= 122; // a - z
}

function isCurlyBracketOpen(charCode: number): boolean {
  return charCode === 123; // {
}

function isCurlyBracketClose(charCode: number): boolean {
  return charCode === 125; // }
}

function isLetter(charCode: number): boolean {
  return isSmallLetter(charCode) || isLargeLetter(charCode);
}

function isAttributeNameStart(charCode: number): boolean {
  return isLetter(charCode) || isBracketOpen(charCode) || isSquareBracketOpen(charCode);
}

function isAttributeNamePart(charCode: number): boolean {
  return (
    isLetter(charCode) ||
    isBracketOpen(charCode) ||
    isBracketClose(charCode) ||
    isSquareBracketOpen(charCode) ||
    isSquareBracketClose(charCode)
  );
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

  seekUntil(conditionFn: CharCodeConditionFn): number {
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
    throw new Error(
      `Unexpected character '${String.fromCharCode(this.peekCharCode())}' at position ${this.currentIdx}`
    );
  }

  consume(conditionFn: CharCodeConditionFn): string {
    return this.markup.substring(this.currentIdx, this.seekUntil(conditionFn));
  }

  skipWhitSpace() {
    this.seekUntil(isWhitespace);
  }

  delegate<T extends Node>(DelegateParser): T {
    const parser = new DelegateParser(this.markup, this.currentIdx) as Parser;
    const parsedNode = parser.parse() as T;

    this.currentIdx = parser.currentIdx;

    return parsedNode;
  }

  abstract parse(): Node;
}

export class QuotedStringParser extends Parser {
  parse(): StringNode {
    if (this.peekAndSkip(isDoubleQuote)) {
      const value = this.consume(not(isDoubleQuote));
      this.requireAndSkip(isDoubleQuote);
      return new StringNode(value);
    } else {
      throw 'Unexpected string start';
    }
  }
}

export class BindingParser extends Parser {
  parse(): BindignNode {
    this.requireAndSkip(isCurlyBracketOpen);
    this.requireAndSkip(isCurlyBracketOpen);

    // TODO: this would fail for {{ {a: {b: 5}} }} - i need to count opening / closing brackets!
    const boundExpr = this.consume(not(isCurlyBracketClose));

    this.requireAndSkip(isCurlyBracketClose);
    this.requireAndSkip(isCurlyBracketClose);

    return new BindignNode(boundExpr);
  }
}

export class AttributeParser extends Parser {
  parse(): AttributeNode {
    const attrName = this.consume(isAttributeNamePart);
    this.skipWhitSpace();
    if (this.peekAndSkip(isEqualSign)) {
      this.skipWhitSpace();
      if (this.peek(isDoubleQuote)) {
        const stringNode = this.delegate(QuotedStringParser);
        return new StaticAttributeNode(attrName, stringNode.value);
      } else if (this.peek(isCurlyBracketOpen)) {
        const bindignNode = this.delegate(BindingParser);
        return new BoundAttributeNode(attrName, bindignNode.value);
      } else {
        throw `Invalid attribute value character: ${String.fromCharCode(this.peekCharCode())}`;
      }
    } else {
      return new StaticAttributeNode(attrName, null);
    }
  }
}

export class ElementStartParser extends Parser {
  parse(): ElementStartNode {
    const attributes: StaticAttributeNode[] = [];

    this.requireAndSkip(isAngleBracketOpen); // <

    const tagName = this.consume((charCode: number) => {
      return !isWhitespace(charCode) && !isAngleBracketClose(charCode);
    });

    this.skipWhitSpace();

    while (this.isNotEOF() && !this.peek(isAngleBracketClose)) {
      if (this.peek(isAttributeNameStart)) {
        attributes.push(this.delegate(AttributeParser));
      } else {
        throw `Unexpected attribute name start: ${String.fromCharCode(this.peekCharCode())}`;
      }
      this.skipWhitSpace();
    }

    this.requireAndSkip(isAngleBracketClose); // >

    return new ElementStartNode(tagName, attributes);
  }
}

export class ElementEndParser extends Parser {
  parse(): ElementEndNode {
    this.requireAndSkip(isAngleBracketOpen); // <
    this.requireAndSkip(isSlash); // /

    const tagName = this.consume((charCode: number) => {
      return !isWhitespace(charCode) && !isAngleBracketClose(charCode);
    });

    this.skipWhitSpace();

    this.requireAndSkip(isAngleBracketClose); // >

    return new ElementEndNode(tagName);
  }
}

export class MarkupParser extends Parser {
  parse(): MarkupNode {
    const nodes: Node[] = [];

    while (this.isNotEOF()) {
      if (this.peek(isAngleBracketOpen)) {
        if (this.peek(isSmallLetter, 1)) {
          nodes.push(this.delegate(ElementStartParser));
        } else if (this.peek(isSlash, 1)) {
          nodes.push(this.delegate(ElementEndParser));
        } else {
          throw '< in text nodes are not supported yet';
        }
      } else {
        // TODO: need to account for interpolations as < have different meaning inside
        const text = this.consume(not(isAngleBracketOpen));
        nodes.push(new TextNode(text));
      }
    }

    return new MarkupNode(nodes);
  }
}
