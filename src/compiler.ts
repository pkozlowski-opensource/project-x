
class TextNode {
    constructor(public value: string) {}
}

class ElementNode {
    constructor(public tagName: string) {}
}

export function parseMarkup(markup: string): (TextNode|ElementNode)[] {
    return [new TextNode(markup)];
}