import * as lang from './lang.js';
window.lang = lang;

const input = document.getElementById('expr');
const eval_button = document.getElementById('eval');
const output = document.getElementById('output');

function log(text, symbol='>') {
    output.textContent += text.split('\n').map((x,i)=>`${i==0 ? symbol : ' '} ${x}`).join('\n')+'\n'
}

class Cell {
    constructor(parser, source = '') {
        this.parser = parser;
        this.source = source;
        this.output = '';
    }
}

Vue.component('notebook-cell', {
    template: `
    <li class="cell">
        <textarea v-model="cell.source"></textarea>
        <button @click="run">run</button>
        <pre>{{cell.output}}</pre>
    </li>
    `,

    props: ['cell'],
    
    methods: {
        run: function(e) {

            try {
                const expr = lang.parser.parse(this.cell.source);
                const res = expr.evaluate();
                this.cell.output = res instanceof Array ? res.join('\n') : res.toString();
            } catch(e) {
                this.cell.output = `ERROR: ${e.message}\n`;
                console.error(e);
            }
        }
    },

    watch: {
        'cell.source': function(v) {
            if(v) {
                this.$emit('code-non-empty');
            }
        },
        'cell.output': function(v) {
            this.$emit('ran');
        }
    }
});

const saved = localStorage.getItem('time-notebook');
let cells;
if(saved) {
    cells = JSON.parse(saved).map(d=>{const c = new Cell(lang.parser, d.source); c.output = d.output; return c;});
} else {
    cells = [new Cell(lang.parser)];
}

const vm = window.vm = new Vue({
    el: '#app',
    data: {
        parser: lang.parser,
        cells: cells
    },

    methods: {
        add_cell: function(e) {
            this.cells.push(new Cell(this.parser));
        },
        code_non_empty: function() {
            if(this.cells[this.cells.length-1].source) {
                this.add_cell();
            }
            this.save();
        },
        save: function() {
            localStorage.setItem('time-notebook',JSON.stringify(this.cells.map(c=>{ return {source:c.source,output:c.output}})));
        }
    }
});

