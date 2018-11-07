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
  constructor(public parts: (StringNode | BindignNode)[]) {
    super(NodeType.TEXT, null);
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

const SPACE = 32;
const DOUBLE_QUOTE = 34; // ""
const SINGLE_QUOTE = 39; // '
const BRACKET_OPEN = 40; // (
const BRACKET_CLOSE = 41; // )
const SLASH = 47; // /
const ANGLE_OPEN = 60; // <
const EQUAL = 61;
const ANGLE_CLOSE = 62; // >
const SQUARE_BRACKET_OPEN = 91; // [
const BACK_SLASH = 92; // \
const SQUARE_BRACKET_CLOSE = 93; // ]
const CURLY_BRACKET_OPEN = 123; // {
const CURLY_BRACKET_CLOSE = 125; // }

type CharCodeConditionFn = (charCode: number) => boolean;

function isWhitespace(charCode: number): boolean {
  // TODO: take other whitespaces into account
  return charCode === SPACE;
}

function isLargeLetter(charCode: number): boolean {
  return charCode >= 65 && charCode <= 90; // A - Z
}

function isSmallLetter(charCode: number): boolean {
  return charCode >= 97 && charCode <= 122; // a - z
}

function isLetter(charCode: number): boolean {
  return isSmallLetter(charCode) || isLargeLetter(charCode);
}

function isStringQuote(charCode: number): boolean {
  return charCode === SINGLE_QUOTE || charCode === DOUBLE_QUOTE;
}

function isAttributeNameStart(charCode: number): boolean {
  return isLetter(charCode) || charCode === BRACKET_OPEN || charCode === SQUARE_BRACKET_OPEN;
}

function isAttributeNamePart(charCode: number): boolean {
  return (
    isLetter(charCode) ||
    charCode === BRACKET_OPEN ||
    charCode === BRACKET_CLOSE ||
    charCode === SQUARE_BRACKET_OPEN ||
    charCode === SQUARE_BRACKET_CLOSE
  );
}

abstract class Parser {
  constructor(public markup: string, public currentIdx: number = 0) {}

  private seekUntil(conditionFn: CharCodeConditionFn): number {
    while (this.isNotEOF() && conditionFn(this.peekCharCode())) {
      this.currentIdx++;
    }
    return this.currentIdx;
  }

  isNotEOF() {
    return this.currentIdx < this.markup.length;
  }

  advance(offset: number = 1): number {
    return (this.currentIdx = Math.min(this.currentIdx + offset, this.markup.length));
  }

  peekCharCode(offset: number = 0): number | null {
    const idx = this.currentIdx + offset;
    return idx < this.markup.length ? this.markup.charCodeAt(idx) : null;
  }

  peek(conditionFn: CharCodeConditionFn, offset: number = 0): boolean {
    return this.isNotEOF() && conditionFn(this.peekCharCode(offset));
  }

  nextIs(charCode: number, offset: number = 0): boolean {
    if (this.currentIdx + offset < this.markup.length) {
      return this.peekCharCode(offset) === charCode;
    }
    return false;
  }

  peekAndSkip(charCode: number): boolean {
    const result = this.nextIs(charCode);
    if (result) {
      this.advance();
      return true;
    }
    return false;
  }

  requireAndSkip(charCode: number): void {
    if (!this.peekAndSkip(charCode)) {
      throw new Error(
        `Unexpected character '${String.fromCharCode(this.peekCharCode())}' at position ${this.currentIdx}`
      );
    }
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
    const quoteChar = this.peekCharCode();
    if (isStringQuote) {
      const valueParts: string[] = [];
      let startIdx = this.currentIdx + 1;

      this.requireAndSkip(quoteChar);

      while (this.isNotEOF()) {
        if (this.nextIs(BACK_SLASH) && this.nextIs(quoteChar, 1)) {
          valueParts.push(this.markup.substring(startIdx, this.currentIdx));
          // skip \" or \'
          startIdx = this.advance(2);
        } else if (this.nextIs(quoteChar)) {
          valueParts.push(this.markup.substring(startIdx, this.currentIdx));
          break;
        } else {
          this.advance();
        }
      }

      this.requireAndSkip(quoteChar);

      return new StringNode(valueParts.join(String.fromCharCode(quoteChar)));
    } else {
      throw new Error(`Unexpected string start: ${String.fromCharCode(quoteChar)}`);
    }
  }
}

export class BindingParser extends Parser {
  parse(): BindignNode {
    this.requireAndSkip(CURLY_BRACKET_OPEN);
    this.requireAndSkip(CURLY_BRACKET_OPEN);

    const exprStartIdx = this.currentIdx;
    let openBrackets = 0;

    while (this.isNotEOF()) {
      if (this.nextIs(CURLY_BRACKET_OPEN)) {
        openBrackets++;
        this.advance();
      } else if (this.nextIs(CURLY_BRACKET_CLOSE) && --openBrackets === -1) {
        break;
      } else {
        this.advance();
      }
    }

    this.requireAndSkip(CURLY_BRACKET_CLOSE);
    this.requireAndSkip(CURLY_BRACKET_CLOSE);

    return new BindignNode(this.markup.substring(exprStartIdx, this.currentIdx - 2));
  }
}

export class AttributeParser extends Parser {
  parse(): AttributeNode {
    const attrName = this.consume(isAttributeNamePart);
    this.skipWhitSpace();
    if (this.peekAndSkip(EQUAL)) {
      this.skipWhitSpace();
      if (this.peek(isStringQuote)) {
        const stringNode = this.delegate(QuotedStringParser);
        return new StaticAttributeNode(attrName, stringNode.value);
      } else if (this.nextIs(CURLY_BRACKET_OPEN)) {
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

    this.requireAndSkip(ANGLE_OPEN); // <

    const tagName = this.consume((charCode: number) => {
      return !isWhitespace(charCode) && charCode !== ANGLE_CLOSE;
    });

    this.skipWhitSpace();

    while (this.isNotEOF() && !this.nextIs(ANGLE_CLOSE)) {
      if (this.peek(isAttributeNameStart)) {
        attributes.push(this.delegate(AttributeParser));
      } else {
        throw `Unexpected attribute name start: ${String.fromCharCode(this.peekCharCode())}`;
      }
      this.skipWhitSpace();
    }

    this.requireAndSkip(ANGLE_CLOSE); // >

    return new ElementStartNode(tagName, attributes);
  }
}

export class ElementEndParser extends Parser {
  parse(): ElementEndNode {
    this.requireAndSkip(ANGLE_OPEN); // <
    this.requireAndSkip(SLASH); // /

    const tagName = this.consume((charCode: number) => {
      return !isWhitespace(charCode) && charCode !== ANGLE_CLOSE;
    });

    this.skipWhitSpace();
    this.requireAndSkip(ANGLE_CLOSE); // >

    return new ElementEndNode(tagName);
  }
}

export class InterpolatedTextParser extends Parser {
  parse(): TextNode {
    const parts: any[] = [];

    function isTextStop(charCode: number): boolean {
      // TODO: this should be {{ <a </ to support single { and < in thext nodes
      return charCode === CURLY_BRACKET_OPEN || charCode === ANGLE_OPEN;
    }

    while (this.isNotEOF() && !this.nextIs(ANGLE_OPEN)) {
      if (this.nextIs(CURLY_BRACKET_OPEN)) {
        parts.push(this.delegate(BindingParser));
      } else {
        parts.push(
          new StringNode(
            this.consume(charCode => {
              return !isTextStop(charCode);
            })
          )
        );
      }
    }

    return new TextNode(parts);
  }
}

export class MarkupParser extends Parser {
  parse(): MarkupNode {
    const nodes: Node[] = [];

    while (this.isNotEOF()) {
      if (this.nextIs(ANGLE_OPEN)) {
        if (this.peek(isSmallLetter, 1)) {
          nodes.push(this.delegate(ElementStartParser));
        } else if (this.nextIs(SLASH, 1)) {
          nodes.push(this.delegate(ElementEndParser));
        } else {
          throw new Error('Unexpected character found after <');
        }
      } else {
        nodes.push(this.delegate(InterpolatedTextParser));
      }
    }

    return new MarkupNode(nodes);
  }
}
