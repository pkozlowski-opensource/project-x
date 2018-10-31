
enum TokenType {
    TEXT,
    ELEMENT_START,
    ELEMENT_END
}

class Token {
    constructor(public type: TokenType, public value: string) {}
}

class TextToken extends Token {
    constructor(value: string) {
        super(TokenType.TEXT, value);
    }
}

class ElementStartToken extends Token {
    constructor(value: string) {
        super(TokenType.ELEMENT_END, value);
    }
}

class ElementEndToken extends Token {
    constructor(value: string) {
        super(TokenType.ELEMENT_END, value);
    }
}

function consumeText(markup: string, start: number): number {
    let end = start;
}

export function lexMarkup(markup: string): Token[] {
    const tokens: Token[] = [];
    
    if (markup != null && markup.length) {
        let currentIdx = 0;
        let peekIdx = 0;

        let textStart: number;

        while (currentIdx < markup.length) {
            if (markup.charAt(currentIdx) === '<') {

            } else {
                textStart = currentIdx;

            }
        }

    }

    return tokens;
    
}