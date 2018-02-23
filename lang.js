import {Unit, IntUnit, EnumUnit, Time, TimePoint, Duration} from './time.js';
import * as time from './time.js';

window.time = time;

export class Expression {
    constructor(tokens, scope, source) {
        this.tokens = tokens;
        this.scope = scope;
        this.source = source;
    }

    evaluate() {
        const stack = this.tokens.slice();
        let i = stack.length-1;
        while(i>=0) {
            if(stack[i] instanceof String) {
                const symbol = this.scope.get_symbol(stack[i].valueOf());
                if(symbol) {
                    stack[i] = symbol;
                }
            }
            if(stack[i] instanceof LSymbol && (i==0 || !(stack[i-1] instanceof LSymbol && stack[i-1].symbol==':='))) {
                const symbol = this.scope.get_symbol(stack[i].symbol);
                const value = symbol.get_meaning(stack.slice(i+1));
                if(value!==undefined) {
                    stack[i] = value;
                }
            }
            const token = stack[i];
            if(token instanceof Op) {
                const nargs = token.accept(stack.slice(i+1));
                const args = stack.slice(i+1, i+nargs+1);
                const result = token.fn(this.scope, ... args);
                stack.splice(i, nargs+1);
                if(result!==undefined) {
                    stack.splice(i, 0, result);
                }
                if(stack[i] instanceof Lambda) {
                    i -= 1;
                }
            } else if(token instanceof Lambda) {
                const args = stack.slice(i+1);
                if(token.accept(args)) {
                    const result = token.evaluate(args);
                    stack.splice(i, token.names.length+1, ... result);
                    i += result.length - 1;
                }
            } else {
                i -= 1;
            }
        }
        if(stack.length==0) {
            return;
        } else if(stack.length==1) {
            return stack[0];
        } else {
            console.warn(stack.slice());
            throw(new Error(`didn't evaluate everything: ${this.source}`));
        }
    }
}

export class Lambda {
    constructor(expr, names) {
        this.expr = expr;
        this.names = names;
    }

    accept(tokens) {
        return tokens.length>=this.names.length;
    }

    evaluate(tokens) {
        const defs = {};
        this.names.map((name, i) => defs[name] = tokens[i]);
        const out = this.expr.tokens.map(t => {
            if(t instanceof String && t in defs) {
                return defs[t];
            } else if(t instanceof LSymbol && t.symbol in defs) {
                return defs[t.symbol];
            } else {
                return t;
            }
        });
        return out;
    }
}

export class Op {
    constructor(signature, fn) {
        this.signature = signature;
        this.fn = fn;
    }

    accept(stack) {
        return this.signature(stack);
    }
}

export const any_token = Symbol("accept any token");
export function accept_only(... required) {
    return function(tokens) {
        if(tokens.length<required.length) {
            return false;
        }
        if(tokens.slice(0, required.length).every((t, i) => required[i]==any_token || t instanceof (required[i]))) {
            return required.length;
        }
        return false;
    }
}
const sort_by_constructor = (a, b) => a.constructor<b.constructor ? -1 : a.constructor>b.constructor ? 1 : 0;
export function accept_any_order(... required) {
    return function(tokens) {
        const sorted = tokens.slice(0, required.length).sort(sort_by_constructor);
        return accept_only(... required.sort())(sorted);
    }
}
export function accept_all(... conditions) {
    return function(tokens) {
        if(conditions.every(fn => fn(tokens)!==false)) {
            return conditions[0](tokens);
        } else {
            return false;
        }
    }
}
export const nullary = accept_only([]);
export const never = () => false;

export class Scope {
    constructor() {
        this.symbols = {};
    }

    get_symbol(symbol) {
        if(symbol.valueOf() in this.symbols) {
            return this.symbols[symbol.valueOf()];
        }
    }

    add_symbol(symbol, value) {
        if(!(symbol in this.symbols)) {
            this.symbols[symbol] = new LSymbol(symbol);
        }
        this.symbols[symbol].add_meaning(value);
    }
}

export class LSymbol {
    constructor(symbol) {
        this.symbol = symbol;
        this.op_meanings = [];
        this.other_meaning = undefined;
    }

    toString() {
        return this.symbol;
    }

    add_meaning(value) {
        if(value instanceof Op) {
            this.op_meanings.push(value);
        } else {
            this.other_meaning = value;
        }
    }

    get_meaning(stack) {
        const op = this.op_meanings.find(t => {
            return t.accept(stack)!==false;
        });
        return op || this.other_meaning;
    }
}

const re_name = /^[A-Za-z_]\w*/;

export class Parser {
    constructor(scope) {
        this.scope = scope;
    }

    source(pos = 0) {
        return this.str.slice(pos);
    }

    strip_space(pos = 0) {
        const osource = this.source(pos);
        const reduced = osource.replace(/^\s*/, '');
        return pos + osource.length - reduced.length;
    }

    exact(str, pos) {
        pos = this.strip_space(pos);
        if(this.source(pos).slice(0, str.length) == str) {
            return {token: str, pos: pos, end: pos+str.length, ttype: 'exact'};
        }
    }

    match(re, pos) {
        pos = this.strip_space(pos);
        const m = re.exec(this.source(pos));
        if(m) {
            const token = m[0];
            return {token: token, pos: pos, match: m, end: pos+token.length, ttype: 'regex'};
        }
    }

    parse(str) {
        this.str = str;
        let pos = 0;
        const tokens = [];
        while(pos<this.str.length) {
            const result = this.get_token(pos);
            if(!result) {
                throw(new Error(`Failed at ${this.source(pos)}`));
            }
            tokens.push(result.token);
            pos = result.end;
        }
        return new Expression(tokens, this.scope, str);
    }
    
    evaluate(str) {
        try {
            return this.parse(str).evaluate();
        } catch(e) {
            console.error(`Error evaluating "${str}": ${e.message}`);
            throw(e);
        }
    }

    get_symbol(pos = 0) {
        const s = this.source(pos);
        const m_punc = this.match(/^[^\w\s]+/, pos);
        if(m_punc) {
            for(let s of Object.keys(this.scope.symbols).sort((a, b) => {return a.length > b.length ? -1 : a.length<b.length ? 1 : 0})) {
                const m = this.exact(s, pos);
                if(m) {
                    return {token: this.scope.symbols[s], pos: pos, end: m.end};
                }
            }
        }
        const m_word = this.match(re_name, pos);
        if(m_word) {
            for(let s of Object.keys(this.scope.symbols).sort((a, b) => {return a.length > b.length ? -1 : a.length<b.length ? 1 : 0})) {
                if(m_word.token==s) {
                    return {token: this.scope.symbols[s], pos: pos, end: m_word.end};
                }
            }
        }
    }

    get_number(pos = 0) {
        const m = this.match(/^\d+/, pos);
        if(m) {
            return {token: new Number(m.token), pos: pos, end: m.end};
        }
    }

    get_name(pos = 0) {
        const m = this.match(re_name, pos);
        if(m) {
            return {token: new String(m.token), pos: pos, end: m.end};
        }
    }

    get_token(pos = 0) {
        return this.get_symbol(pos) || this.get_number(pos) || this.get_name(pos);
    }
}

function unordered(fn) {
    return function(scope, ...args) {
        return fn(scope, ...args.slice().sort(sort_by_constructor));
    }
}

export const scope = new Scope();
scope.add_symbol('+', new Op(accept_only(Number, Number), (_, a, b) => new Number(a+b)));
scope.add_symbol('-', new Op(accept_only(Number, Number), (_, a, b) => new Number(a-b)));
scope.add_symbol('-', new Op(accept_only(Number), (_, a) => new Number(-a)));
scope.add_symbol('*', new Op(accept_only(Number, Number), (_, a, b) => new Number(a*b)));
scope.add_symbol('/', new Op(accept_only(Number, Number), (_, a, b) => new Number(Math.floor(a/b))));
scope.add_symbol('%', new Op(accept_only(Number, Number), (_, a, b) => new Number(a%b)));
scope.add_symbol(']', new Op(never, never));
scope.add_symbol('[', new Op(
    tokens => {
        for(let i=0;i<tokens.length;i++) {
            if(tokens[i] instanceof LSymbol && tokens[i].symbol==']') {
                return i+1;
            }
        }
        return false;
    }, 
    (_, ...things) => {
        return things.slice(0, things.length-1);
    }
));

const re_unit_name = /^[A-Z][a-zA-Z_]/;

scope.add_symbol('Enum', new Op(
    accept_all(accept_only(String, Array), (tokens) => tokens[0].match(re_unit_name) && tokens[1].every(x => x instanceof String) && 2), 
    (scope, name, sequence) => {
        sequence = sequence.map(x => x.valueOf());
        const unit = new EnumUnit(name, sequence);
        scope.add_symbol(name, unit);
        sequence.forEach(item => scope.add_symbol(item, unit.instance(item)));
        return unit;
    }
));
scope.add_symbol('Int', new Op(
    accept_all(accept_only(String, Number), (tokens) => tokens[0].match(re_unit_name)), 
    (scope, name, start) => {
        const unit = new IntUnit(name, start);
        scope.add_symbol(name.toLowerCase(), new Op(accept_only(Number), (_, n) => unit.instance(n.valueOf())));
        scope.add_symbol(name, unit);
        return unit;
    }
));
scope.add_symbol('p', new Op(accept_all(accept_only(EnumUnit, String), (tokens) => tokens[0].item_is_valid(tokens[1].valueOf())), (_, unit, item) => unit.instance(item.valueOf())));
scope.add_symbol('-', new Op(accept_only(TimePoint, TimePoint), (_, a, b) => new Time(a, b)));
scope.add_symbol('d', new Op(accept_only(Time), (_, t) => t.duration()));
scope.add_symbol('c', new Op(
    accept_all(
        accept_only(Array), 
        (tokens) => {
            const arr = tokens[0];
            let i=0;
            while(i<arr.length && arr[i] instanceof TimePoint) {
                i += 1;
            }
            return i>0 && i;
        }
    ), 
    (scope, timepoints) => TimePoint.combine(... timepoints)
));

function enum_has_cases(supunit, subunit, tokens) {
    const def = {};
    tokens = tokens.map(x => x.valueOf());
    for(let i=0;i<tokens.length;) {
        if(!(tokens[i] instanceof TimePoint)) {
            return false;
        }
        const item = tokens[i].get_unit(supunit);
        if(!supunit.item_is_valid(item)) {
            return false;
        }
        i += 1;
        let direction = 'inc';
        if(/^(inc|dec)$/.exec(tokens[i])) {
            direction = tokens[i];
            i += 1;
        }
        let end = undefined;
        if(typeof(tokens[i])=="number") {
            end = tokens[i];
            i += 1;
        }
        def[item] = {
            direction: direction, 
            end: end
        }
    }
    return def;
}

scope.add_symbol('has', new Op(
    accept_all(
        accept_only(EnumUnit, Unit, Array), 
        (tokens) => {
            const [sup, sub, cases] = tokens;
            return enum_has_cases(sup, sub, cases)!==false;
        }
    ), 
    (scope, sup, sub, cases) => {
        const def = enum_has_cases(sup, sub, cases);
        sup.has(sub, def);
        return sup;
    }
));
scope.add_symbol('has', new Op(accept_only(Unit, Unit), (_, a, b) => {a.has(b); return a;}));
scope.add_symbol('in', new Op(accept_only(Unit, Time), (_, unit, t) => new Number(t.size_in(unit))));
scope.add_symbol('*', new Op(accept_any_order(Number, Unit), unordered((_, unit, n) => unit.times(n))));
scope.add_symbol('*', new Op(accept_any_order(Number, Duration), unordered((_, duration, n) => duration.times(n))));
scope.add_symbol('+', new Op(accept_only(Duration, Duration), (_, a, b) => Duration.add(a, b)))
scope.add_symbol('+', new Op(accept_any_order(Duration, TimePoint), (_, d, t) => t.add(d)));
scope.add_symbol('-', new Op(accept_any_order(Duration, TimePoint), (_, d, t) => t.subtract(d)));
scope.add_symbol(':=', new Op(accept_only(String, any_token), (scope, name, value) => scope.add_symbol(name.valueOf(), value)));
scope.add_symbol(':=', new Op(accept_only(LSymbol, any_token), (scope, symbol, value) => scope.add_symbol(symbol.symbol, value)));

function lambda_args(tokens) {
    let i = 0;
    while(i<tokens.length && (tokens[i] instanceof String || tokens[i] instanceof LSymbol)) {
        i += 1;
    }
    if(i<tokens.length && tokens[i] instanceof Array) {
        return i+1;
    }
    return false;
}

scope.add_symbol('\\', new Op(
    lambda_args, 
    (scope, ... tokens) => {
        const named_params = tokens.slice(0, tokens.length-1).map(x => x.toString());
        const expr = tokens[tokens.length-1];
        return new Lambda(new Expression(expr, scope), named_params);
    }
));
scope.add_symbol('\\', new Op(accept_only(Array), (scope, tokens) => new Lambda(new Expression(tokens, scope), [])));

export const parser = new Parser(scope);
try {
    parser.evaluate('Int Year 1');
    parser.evaluate('Enum Month [ January February March April May June July August September October November December ]');
    parser.evaluate('has Year Month');
    parser.evaluate('Int Day 1');
    parser.evaluate('has Month Day [January 31 February 28 March 31 April 30 May 31 June 30 July 31 August 31 September 30 October 31 November 30 December 31 ]');
    parser.evaluate('Enum Epoch [BC AD]');
    parser.evaluate('has Epoch Year [BC dec AD inc]')
} catch(e) {
    console.error(e);
}
