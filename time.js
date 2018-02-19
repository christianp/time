class Unit {
	constructor(name) {
		this.name = name;
		this.subunit = null;
		this.subdivisions = null;
		this.superunit = null;
		this.joins = [];
	}

	static order(units) {
		return units.sort(Unit.compare);
	}

	static compare(a,b) {
		let p = a.superunit;
		while(p!==null && p!==b) {
			p = p.superunit;
		}
		if(p==b) {
			return 1;
		}
		p = b.superunit;
		while(p!==null && p!==a) {
			p = p.superunit;
		}
		if(p==a) {
			return -1;
		}
		return 0;
	}

	assert_valid(item) {
		if(!this.item_is_valid(item)) {
			throw(new Error(`${item} isn't a valid ${this.name}`));
		}
	}

	item_is_valid(item) {
		throw(new Error(`item_is_valid not defined on ${this.name}`));
	}

	has(unit, divisions) {
		if(this.subunit) {
			throw(new Error(`Unit ${this.name} already has a subunit`));
		}
		if(unit.superunit) {
			throw(new Error(`Unit ${this.name} already has a superunit`));
		}
		this.subunit = unit;
		this.subdivisions = divisions;
		unit.superunit = this;
	}

	get_subdivision(t) {
        const item = t.get_unit(this);
        if(item===undefined) {
            throw(new Error(`Can't work subdivision: has no ${this.name}`));
        }
		if(this.subdivisions===undefined) {
			return {direction:'inc'};
		} else if(this.subdivisions[item]!==undefined) {
			const def = this.subdivisions[item];
            if(typeof(def)=='function') {
                return def(t)
            } else {
                return def;
            }
		} else {
            throw(new Error(`${this.name} has no subdivision for ${item}`));
        }
	}

	join(suba,subb,rollover) {
		this.joins.push([suba,subb,rollover]);
	}

	get_join_before(t) {
		const join = this.joins.find(def=>def[1].includes(t));
		if(join) {
			const nt = t.clone();
			nt.merge(join[0]);
			if(join[2] && this.superunit) {
				return this.superunit.previous(nt);
			} else {
				return nt;
			}
		}
	}
	get_join_after(t) {
		const join = this.joins.find(def=>def[0].includes(t));
		if(join) {
			const nt = t.clone();
			nt.merge(join[0]);
			if(join[2] && this.superunit) {
				return this.superunit.next(nt);
			} else {
				return nt;
			}
		}
	}

	compare_values(a,b) {
		throw(new Error('base Unit class can\'t compare values'));
	}
	instance(data) {
		throw(new Error('base Unit class can\'t make an instance'));
	}

	toString() {
		return this.name;
	}
}

class EnumUnit extends Unit {
	constructor(name, sequence, periodic = true) {
		super(name);
		this.sequence = sequence;
		this.periodic = true;
	}

	compare_values(a,b) {
		const ia = this.sequence.indexOf(a.get_unit(this));
		const ib = this.sequence.indexOf(b.get_unit(this));
		return ia>ib ? 1 : ia<ib ? -1 : 0;
	}

	item_is_valid(item) {
		return this.sequence.indexOf(item)>=0;
	}

	instance(item) {
		this.assert_valid(item);
		return new TimePoint([[this,item]]);
	}

	next(t) {
		t.assert_has(this);
		let nt = t.clone();
		const item = t.get_unit(this);
		let i = this.sequence.indexOf(item)+1;
		if(i>=this.sequence.length) {
			if(!this.periodic) {
				throw(new Error(`There's no ${this.name} after ${item}`));
			} else {
				i = i % this.sequence.length;
				if(this.superunit && nt.has_unit(this.superunit)) {
					nt = this.superunit.next(nt);
				}
			}
		}
		nt.set_unit(this,this.sequence[i]);
		return nt;
	}

	previous(t) {
		t.assert_has(this);
		let nt = t.clone();
		const item = t.get_unit(this);
		let i = this.sequence.indexOf(item)-1;
		if(i<0) {
			if(!this.periodic) {
				throw(new Error(`There's no ${this.name} before ${item}`));
			} else {
				i += this.sequence.length;
				if(this.superunit && nt.has_unit(this.superunit)) {
					nt = this.superunit.previous(nt);
				}
			}
		}
		nt.set_unit(this, this.sequence[i]);
		return nt;
	}
}

class IntUnit extends Unit {
	constructor(name, start, end) {
		super(name);
		this.start = start;
		this.end = end;
	}

	compare_values(a,b) {
		if(this.superunit && a.has_unit(this.superunit)) {
			const direction = this.get_direction(a);
			const ia = a.get_unit(this);
			const ib = a.get_unit(this);
			const mul = {'inc': 1, 'dec': -1}[direction];
			return mul*(a>b ? 1 : b<a ? -1 : 0);
		}
	}

	item_is_valid(n) {
		return typeof(n)=='number' && Math.floor(n)==n && n>=this.start && (this.end===undefined || n<=this.end);
	}

	instance(n) {
		this.assert_valid(n);
		n = Math.floor(n);
		if(this.end!==undefined) {
			const gap = this.end - this.start;
			const r = (n-this.start)%gap;
			n = this.start + r;
		} else if(n<this.start) {
			throw(new Error(`Value ${n} is too low for ${this.name}`));
		}
		return new TimePoint([[this,n]]);
	}

	get_direction(t) {
		if(this.superunit===undefined) {
			throw(new Error(`${this.name} has no direction because it has no parent unit`));
		}
		const sup = t.get_unit(this.superunit);
		if(sup===undefined) {
			if(new Set(Object.values(this.superunit.subdivisions)).size > 1) {
				throw(new Error(`Need to know ${this.superunit.name} to know next ${this.name}`));
			} else {
				return Object.values(this.superunit.subdivisions)[0];
			}
		} else {
			return this.superunit.get_subdivision(t).direction;
		}
	}

	next(t) {
		t.assert_has(this);
		let nt = t.clone();
		const n = t.get_unit(this);
		if(this.superunit!==null) {
			const joined = this.superunit.get_join_after(t);
			if(joined) {
                nt.merge(joined);
				return nt;
			}
            nt.set_unit(this, n + ({'inc':1,'dec':-1}[this.get_direction(t)]));
			return this.wrap(nt);
		} else {
            nt.set_unit(this, n+1);
			return this.wrap(nt);
		}
		return nt;
	}

	previous(t) {
		t.assert_has(this);
		const nt = t.clone();
		const n = t.get_unit(this);
		if(this.superunit!==null) {
			const joined = this.superunit.get_join_before(t);
			if(joined) {
				nt.merge(joined);
				return nt;
			}
			const sup = t.get_unit(this.superunit);
            nt.set_unit(this, n + ({'inc':-1,'dec':1}[this.get_direction(t)]));
			return this.wrap(nt);
		} else {
            nt.set_unit(this, n-1);
			return this.wrap(nt);
		}
	}

    get_end(t) {
        if(this.superunit) {
            const sub = this.superunit.get_subdivision(t);
            if(sub===undefined || sub.end===undefined) {
                return this.end;
            } else {
                const send = sub.end;
                return this.end===undefined ? send : Math.min(send,this.end);
            }
        } else {
            return this.end;
        }
    }

	wrap(t) {
        if(!t.has_unit(this)) {
            throw(new Error(`${t} has no ${this.name}`));
        }
        let n = t.get_unit(this);
        let end = this.get_end(t);
		while(n>end) {
            if(this.superunit!==null) {
                const inc = this.get_direction(t)=='inc';
                t = inc ? this.superunit.next(t) : this.superunit.previous(t);
            }
            n -= end;
            end = this.get_end(t);
            const ninc = this.get_direction(t)=='inc';
            if(!ninc) {
                n = end - n;
            }
            t.set_unit(this,n);
		}
		while(n<this.start) {
            const inc = this.get_direction(t)=='inc';
            const nt = inc ? this.superunit.previous(t) : this.superunit.next(t);
            const end = this.get_end(nt);
			if(!inc || end !== undefined) {
				if(this.superunit!==null) {
                    const inc = this.get_direction(t)=='inc';
                    t = nt;
				}
				n = inc ? n + end : n + this.start;
			} else {
				throw(new Error(`There's no ${this.name} ${n}`));
			}
            t.set_unit(this,n);
		}
		return t;
	}
}

class TimePoint {
	constructor(units) {
		this.units = units;
	}

	static compare(a,b) {
		const units = Array.from(new Set(a.units.concat(b.units).map(def=>def[0])));
		units.sort(Unit.compare);
		for(let unit of units) {
			if(!a.has_unit(unit) || !b.has_unit(unit)) {
				throw(new Error(`One timepoint has a ${unit.name} but the other doesn't: ${a} vs ${b}`));
			}
			const res = unit.compare_values(a, b);
			if(res!=0) {
				return res;
			}
		}
		return 0;
	}

	clone() {
		return new TimePoint(this.units.slice());
	}

	assert_has(unit) {
		if(!this.has_unit(unit)) {
			throw(new Error(`${this} doesn't have a ${unit.name}`));
		}
	}

	has_unit(unit) {
		return this.units.find(def=>def[0]==unit) && true;
	}

	get_unit(unit) {
		const def = this.units.find(def=>def[0]==unit);
		return def && def[1];
	}

	set_unit(unit,item) {
		const i = this.units.findIndex(def=>def[0]==unit);
		this.units[i] = [unit,item];
	}

	includes(t) {
		return this.units.every(def=>{
			const [unit,item] = def;
			return t.get_unit(unit)==item;
		});
	}

	toString() {
		this.units.sort((a,b)=>Unit.compare(a[0],b[0]));
		return this.units.map(def=>{const [unit,item] = def; return `${unit.name}: ${item}`}).join(', ');
	}

	static combine(... points) {
		const np = new TimePoint([]);
		points.forEach(p => {
			p.units.forEach(u=>{
				if(np.get_unit(u[0])) {
					throw(new Error(`More than one point being combined has a ${u[0]}`));
				}
				np.units.push(u);
			});
		});
		return np;
	}
	
	merge(t) {
		const thist = this;
		t.units.forEach(def=>thist.set_unit(def[0],def[1]));
	}
}
class Time {
	constructor(start,end) {
		this.start = start;
		this.end = end;
	}
}

const c = TimePoint.combine;

const Epoch = new EnumUnit('Epoch', ['BC','AD'], periodic = false);
const ad = Epoch.instance('AD');
const bc = Epoch.instance('BC');

const Year = new IntUnit('Year', 1);
const year = Year.instance.bind(Year);
Epoch.has(Year, {'BC': {direction:'dec'}, 'AD': {direction:'inc'}});
Epoch.join(c(year(1),bc), c(year(1),ad))

const Month = new EnumUnit('Month', ['January','February','March','April','May','June','July','August','September','October','November','December']);
const month = Month.instance.bind(Month);
Year.has(Month);

const Day = new IntUnit('Day',1);
const day = Day.instance.bind(Day);
Month.has(Day,
    {
        'January':{'direction':'inc',end:31},
        'February': function(t) { t.assert_has(Year); const y = t.get_unit(Year); const leap = y%4==0 && !(y%100==0 && y%400!=0); return {direction: 'inc', end: leap ? 29 : 28}; },
        'March':{'direction':'inc',end:31},
        'April':{'direction':'inc',end:30},
        'May':{'direction':'inc',end:31},
        'June':{'direction':'inc',end:30},
        'July':{'direction':'inc',end:31},
        'August':{'direction':'inc',end:31},
        'September':{'direction':'inc',end:30},
        'October':{'direction':'inc',end:31},
        'November':{'direction':'inc',end:30},
        'December':{'direction':'inc',end:31}
    }
);

const Hour = new IntUnit('Hour',0,23);
const hour = Hour.instance.bind(Hour);
Day.has(Hour);

const ad2000 = c(year(2000),ad);
console.log(ad2000+'');
const next = Year.next(ad2000);
console.log(next+'');
console.log(Year.previous(ad2000)+'');

const m = month('January');
console.log(Month.previous(m)+'');

const bc1 = c(year(1),bc);
console.log(Year.next(bc1)+'');
console.log(Year.previous(bc1)+'');
console.log(Month.next(c(month('December'),bc1)));
